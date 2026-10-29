// Twenty request credentials (Twenty plan §2.1). The runner passes secrets only through the environment; this module never logs a value.
import http from "k6/http";

const SIGN_IN = `mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    availableWorkspaces { availableWorkspacesForSignIn { displayName loginToken workspaceUrls { subdomainUrl customUrl } } }
  }
}`;
const EXCHANGE = `mutation GetAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
  getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
    tokens { accessOrWorkspaceAgnosticToken { token } }
  }
}`;

/**
 * "Bearer <key>" from the first entry of TWENTY_API_KEYS (a JSON array, the API-key cases, Twenty plan §2.13) when set,
 * else "Bearer <token>" from TWENTY_TOKEN (the user-token case). Throws a TEST BUG when neither is set.
 * A malformed TWENTY_API_KEYS names only the problem, never its text (a JSON parse error can quote the value).
 */
export function authorizationHeader() {
  const keys = __ENV.TWENTY_API_KEYS;
  if (keys) {
    let list;
    try {
      list = JSON.parse(keys);
    } catch (_) {
      throw new Error("TEST BUG: TWENTY_API_KEYS is not a JSON array");
    }
    if (Array.isArray(list) && typeof list[0] === "string" && list[0] !== "") {
      return `Bearer ${list[0]}`;
    }
    throw new Error("TEST BUG: TWENTY_API_KEYS has no key");
  }
  const token = __ENV.TWENTY_TOKEN;
  if (token) return `Bearer ${token}`;
  throw new Error("TEST BUG: TWENTY_TOKEN is not set");
}

/** One GraphQL call on /metadata. Throws with the GraphQL message only, never a body. */
function graphql(url, query, variables) {
  const res = http.post(url, JSON.stringify({ query, variables }), {
    headers: { "Content-Type": "application/json" },
    tags: { op: "auth" },
  });
  let body = null;
  try {
    body = res.json();
  } catch (_) {
    body = null;
  }
  if (body && body.errors && body.errors.length > 0) {
    throw new Error(`TEST BUG: ${body.errors[0].message}`);
  }
  if (res.status !== 200 || !body || !body.data) {
    throw new Error(`TEST BUG: sign-in HTTP ${res.status}`);
  }
  return body.data;
}

/**
 * The standalone path for `k6 run` (no runner): sign in, then exchange the login token for the workspace token, the same
 * order as src/twenty/auth.ts signInWorkspace. Returns "Bearer <token>".
 */
export function signInWithPassword({ baseUrl, email, password, workspaceName }) {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/metadata`;
  const signIn = graphql(url, SIGN_IN, { email, password });
  const workspaces = signIn.signIn.availableWorkspaces.availableWorkspacesForSignIn;
  const workspace = workspaces.find((w) => w.displayName === workspaceName);
  if (!workspace)
    throw new Error(`TEST BUG: workspace ${workspaceName} is not in the sign-in list`);
  const subdomain = workspace.workspaceUrls && workspace.workspaceUrls.subdomainUrl;
  const custom = workspace.workspaceUrls && workspace.workspaceUrls.customUrl;
  const origin = (subdomain || custom || base).replace(/\/$/, "");
  const exchanged = graphql(url, EXCHANGE, { loginToken: workspace.loginToken, origin });
  const token = exchanged.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  if (!token) throw new Error("TEST BUG: exchange returned no workspace token");
  return `Bearer ${token}`;
}

/** The REST headers of every Twenty request. */
export function restHeaders(authorization) {
  return { Authorization: authorization, "Content-Type": "application/json" };
}
