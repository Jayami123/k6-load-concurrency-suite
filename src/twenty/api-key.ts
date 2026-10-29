import { graphqlCall } from "./api.ts";

/** One seeded run key: its id (for revocation) and its token (the k6 secret). Never logged. */
export interface RunApiKey {
  id: string;
  token: string;
}

const ROLES = "query Roles { getRoles { id label } }";
const CREATE =
  "mutation CreateRunApiKey($input: CreateApiKeyInput!) { createApiKey(input: $input) { id } }";
const TOKEN =
  "mutation RunApiKeyToken($apiKeyId: UUID!, $expiresAt: String!) { generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) { token } }";
const REVOKE =
  "mutation RevokeRunApiKey($input: RevokeApiKeyInput!) { revokeApiKey(input: $input) { id } }";

/** GraphQL messages only: a response body can hold a key value, so it is never quoted. */
function messageOf(json: { errors?: Array<{ message: string }> } | null, fallback: string): string {
  const message = json?.errors?.[0]?.message;
  return `TEST BUG: ${message ?? fallback}`;
}

/** The Admin role's id, from getRoles on /metadata (the role the run keys act as). */
async function adminRoleId(
  baseUrl: string,
  authorizationHeader: string,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const res = await graphqlCall(baseUrl, "/metadata", ROLES, {}, authorizationHeader, fetchImpl);
  const roles = (res.json?.data as { getRoles?: Array<{ id: string; label: string }> } | undefined)
    ?.getRoles;
  const admin = roles?.find((r) => r.label === "Admin");
  if (!admin) throw new Error(messageOf(res.json, "no Admin role in the workspace"));
  return admin.id;
}

/**
 * One key: createApiKey on /metadata, then generateApiKeyToken for its value. When the token step fails, the new key is
 * revoked before the error is thrown, so no unused key is left behind.
 */
export async function createRunApiKey(opts: {
  baseUrl: string;
  authorizationHeader: string;
  name: string;
  roleId: string;
  expiresAt: string;
  fetchImpl?: typeof fetch;
}): Promise<RunApiKey> {
  const { baseUrl, authorizationHeader, name, roleId, expiresAt, fetchImpl } = opts;
  const created = await graphqlCall(
    baseUrl,
    "/metadata",
    CREATE,
    { input: { name, expiresAt, roleId } },
    authorizationHeader,
    fetchImpl,
  );
  const id = (created.json?.data as { createApiKey?: { id?: string } } | undefined)?.createApiKey
    ?.id;
  if (!id) throw new Error(messageOf(created.json, "createApiKey returned no id"));
  const issued = await graphqlCall(
    baseUrl,
    "/metadata",
    TOKEN,
    { apiKeyId: id, expiresAt },
    authorizationHeader,
    fetchImpl,
  );
  const token = (issued.json?.data as { generateApiKeyToken?: { token?: string } } | undefined)
    ?.generateApiKeyToken?.token;
  if (!token) {
    await revokeRunApiKeys({ baseUrl, authorizationHeader, ids: [id], fetchImpl }).catch(() => {});
    throw new Error(messageOf(issued.json, "generateApiKeyToken returned no token"));
  }
  return { id, token };
}

/** Revokes one key. A GraphQL error is thrown with its message only. */
export async function revokeRunApiKey(opts: {
  baseUrl: string;
  authorizationHeader: string;
  id: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { baseUrl, authorizationHeader, id, fetchImpl } = opts;
  const res = await graphqlCall(
    baseUrl,
    "/metadata",
    REVOKE,
    { input: { id } },
    authorizationHeader,
    fetchImpl,
  );
  if (res.json?.errors?.length || !res.json?.data) {
    throw new Error(messageOf(res.json, `revokeApiKey HTTP ${res.status}`));
  }
}

/**
 * One key per name, in order (Twenty plan §2.13). Every key shares the Admin role, so every key of one workspace shares one
 * speed bucket at image defaults (§2.13). If a creation fails, the keys already made are revoked before the error is thrown.
 */
export async function createRunApiKeys(opts: {
  baseUrl: string;
  authorizationHeader: string;
  names: string[];
  expiresAt: string;
  fetchImpl?: typeof fetch;
}): Promise<RunApiKey[]> {
  const { baseUrl, authorizationHeader, names, expiresAt, fetchImpl } = opts;
  const roleId = await adminRoleId(baseUrl, authorizationHeader, fetchImpl);
  const keys: RunApiKey[] = [];
  try {
    for (const name of names) {
      keys.push(
        await createRunApiKey({ baseUrl, authorizationHeader, name, roleId, expiresAt, fetchImpl }),
      );
    }
  } catch (err) {
    await revokeRunApiKeys({
      baseUrl,
      authorizationHeader,
      ids: keys.map((k) => k.id),
      fetchImpl,
    }).catch(() => {});
    throw err;
  }
  return keys;
}

/** Revokes every id. Failures are collected; one TEST BUG names how many failed, never a value. */
export async function revokeRunApiKeys(opts: {
  baseUrl: string;
  authorizationHeader: string;
  ids: string[];
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const failed: string[] = [];
  for (const id of opts.ids) {
    try {
      await revokeRunApiKey({ ...opts, id });
    } catch {
      failed.push(id);
    }
  }
  if (failed.length > 0) {
    throw new Error(`TEST BUG: ${failed.length} API key revocation(s) failed`);
  }
}
