export interface TwentyWorkspace {
  displayName: string;
  loginToken: string;
  workspaceUrls: { subdomainUrl?: string | null; customUrl?: string | null } | null;
}

interface SignInData {
  signIn: { availableWorkspaces: { availableWorkspacesForSignIn: TwentyWorkspace[] } };
}
interface ExchangeData {
  getAuthTokensFromLoginToken: { tokens: { accessOrWorkspaceAgnosticToken: { token: string } } };
}

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

/** Same order as the harness (selectWorkspaceOrigin): subdomain URL, then custom URL, then the base URL. */
export function originFor(workspace: TwentyWorkspace, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const subdomain = workspace.workspaceUrls?.subdomainUrl?.trim();
  if (subdomain) return subdomain.replace(/\/$/, "");
  const custom = workspace.workspaceUrls?.customUrl?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return base;
}

/** Throws a TEST BUG naming the missing workspace; never prints the list's tokens. */
export function pickWorkspace(workspaces: TwentyWorkspace[], displayName: string): TwentyWorkspace {
  const found = workspaces.find((w) => w.displayName === displayName);
  if (!found) {
    throw new Error(
      `TEST BUG: no workspace named ${displayName} in signIn (got ${workspaces.length})`,
    );
  }
  return found;
}

/** POSTs a GraphQL operation. Throws on `errors` with the messages only, never the body. */
export async function graphqlData<T>(
  fetchImpl: typeof fetch,
  url: string,
  query: string,
  variables: Record<string, unknown>,
  authorizationHeader?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorizationHeader) headers.Authorization = authorizationHeader;
  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new Error(
      `Twenty GraphQL error (HTTP ${res.status}): ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) throw new Error(`Twenty GraphQL returned no data (HTTP ${res.status})`);
  return body.data;
}

/**
 * signIn, pick the workspace by display name, exchange its login token for a workspace token.
 * The agnostic token from signIn is not returned: it cannot read data (§3.3).
 */
export async function signInWorkspace(opts: {
  baseUrl: string;
  email: string;
  password: string;
  workspaceName: string;
  fetchImpl?: typeof fetch;
}): Promise<{ authorizationHeader: string; origin: string }> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, "")}/metadata`;
  const signIn = await graphqlData<SignInData>(f, url, SIGN_IN, {
    email: opts.email,
    password: opts.password,
  });
  const workspace = pickWorkspace(
    signIn.signIn.availableWorkspaces.availableWorkspacesForSignIn,
    opts.workspaceName,
  );
  const origin = originFor(workspace, opts.baseUrl);
  const exchanged = await graphqlData<ExchangeData>(f, url, EXCHANGE, {
    loginToken: workspace.loginToken,
    origin,
  });
  const token = exchanged.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  if (!token) throw new Error("Twenty exchange returned no workspace token");
  return { authorizationHeader: `Bearer ${token}`, origin };
}

/** `currentUser.email` with a given authorization header (the probe's `currentUser` check). */
export async function currentUserEmail(
  baseUrl: string,
  authorizationHeader: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const data = await graphqlData<{ currentUser: { email: string } }>(
    fetchImpl,
    `${baseUrl.replace(/\/$/, "")}/metadata`,
    "query CurrentUser { currentUser { email } }",
    {},
    authorizationHeader,
  );
  return data.currentUser.email;
}
