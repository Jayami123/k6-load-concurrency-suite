// Twenty background journey (Twenty plan §2.2, §6.6): create one company, read it back, patch its name once, read it back.
// Names are `${prefix}-${n}-a`, then `…-u` after the patch. REST shapes: POST /rest/companies answers
// { data: { createCompany: { id } } }, GET /rest/companies/<id> answers { data: { company } } (probed, Twenty plan §5 row 7).
// No retry: every status is recorded as it arrives.
import http from "k6/http";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { check } from "k6";
import { authorizationHeader, restHeaders } from "../lib/twenty-auth.js";

export const createdCounter = new Counter("p6_tw_created");
export const updatedCounter = new Counter("p6_tw_updated");
export const serverErrorCounter = new Counter("p6_tw_5xx");
export const limited429Counter = new Counter("p6_tw_429");

/** @param {any} r @returns {boolean} */
const isSuccess = (r) => r.status >= 200 && r.status < 300;

/** Counts the response classes the reconcile reads: every 5xx and every 429. @param {any} res */
function observe(res) {
  if (res.status >= 500) serverErrorCounter.add(1);
  if (res.status === 429) limited429Counter.add(1);
}

/**
 * One field of a JSON answer, or undefined when the body is not JSON or the field is missing.
 * @param {any} res
 * @param {string} path
 * @returns {any}
 */
function fieldOf(res, path) {
  try {
    return res.json(path);
  } catch (_) {
    return undefined;
  }
}

/** The name in a GET answer. @param {any} res @returns {any} */
function nameIn(res) {
  return fieldOf(res, "data.company.name");
}

/**
 * One iteration. Returns { created: [id], patched: 0 | 1, serverErrors: count } for the case's own use.
 * @param {{ baseUrl: string, prefix: string }} cfg
 * @param {object} [_opts] reserved for the journeys of Tasks 4 to 6 (none yet)
 * @returns {{ created: any[], patched: number, serverErrors: number }}
 */
export function runTwBackground(cfg, _opts = {}) {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const headers = restHeaders(authorizationHeader());
  const n = exec.scenario.iterationInTest;
  const name = `${cfg.prefix}-${n}-a`;
  const renamed = `${name}-u`;
  const out = { created: /** @type {any[]} */ ([]), patched: 0, serverErrors: 0 };

  // 1. create
  const create = http.post(`${base}/rest/companies`, JSON.stringify({ name }), {
    headers,
    tags: { op: "create" },
  });
  observe(create);
  check(create, { "create 2xx": isSuccess });
  if (create.status >= 500) out.serverErrors += 1;
  const id = isSuccess(create) ? fieldOf(create, "data.createCompany.id") : undefined;
  if (!id) return out;
  createdCounter.add(1);
  out.created.push(id);

  // 2. read back
  const read = http.get(`${base}/rest/companies/${id}`, { headers, tags: { op: "read" } });
  observe(read);
  check(read, { "read 200": (r) => r.status === 200, "read name": (r) => nameIn(r) === name });

  // 3. patch the name once
  const patch = http.patch(`${base}/rest/companies/${id}`, JSON.stringify({ name: renamed }), {
    headers,
    tags: { op: "patch" },
  });
  observe(patch);
  check(patch, { "patch 2xx": isSuccess });
  if (patch.status >= 500) out.serverErrors += 1;
  if (isSuccess(patch)) {
    updatedCounter.add(1);
    out.patched = 1;
  }

  // 4. read back the new name
  const reread = http.get(`${base}/rest/companies/${id}`, { headers, tags: { op: "read" } });
  observe(reread);
  check(reread, { "reread name": (r) => nameIn(r) === renamed });
  return out;
}
