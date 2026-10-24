import http from "k6/http";

/**
 * GET/POST with a fixed `name` tag (so no URL with an id or token becomes a metric label) and an explicit timeout.
 * @param {string} method
 * @param {string} url
 * @param {string} name
 * @param {unknown} [body]
 * @param {Record<string, unknown>} [params]
 */
export function request(method, url, name, body, params = {}) {
  const p = { ...params, tags: { ...(params.tags || {}), name } };
  return method === "GET"
    ? http.get(url, p)
    : http.post(url, body === undefined ? null : JSON.stringify(body), p);
}

/**
 * Declares which statuses are expected so http_req_failed stays meaningful (a clean 400 refusal is not a failure; D9).
 * @param {...(number | { min: number, max: number })} extra
 */
export function expectStatuses(...extra) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, ...extra));
}
