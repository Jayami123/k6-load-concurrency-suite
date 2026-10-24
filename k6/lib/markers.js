import http from "k6/http";
import { Trend } from "k6/metrics";

/** Trend metrics read by src/load/telemetry/markers.ts (offsetsFromSummary). */
export const clockStart = new Trend("p6_clock_offset_start_ms");
export const clockEnd = new Trend("p6_clock_offset_end_ms");

/**
 * Offset of the marker server's clock from k6's, in ms: the server's clock minus the midpoint of the request.
 * @param {string} url
 * @returns {number | undefined}
 */
export function clockOffset(url) {
  const t0 = Date.now();
  const res = http.get(url);
  const t1 = Date.now();
  const serverNowMs = res.json("serverNowMs");
  if (typeof serverNowMs !== "number") return undefined;
  return serverNowMs - (t0 + t1) / 2;
}

/**
 * setup() helper: records the offset at the start of the run when the runner gave a marker (MARKER_URL). Without one it does nothing.
 * @param {string | undefined} url
 */
export function recordClockStart(url) {
  if (!url) return;
  const offset = clockOffset(url);
  if (offset !== undefined) clockStart.add(offset);
}

/**
 * teardown() helper: records the offset at the end of the run when the runner gave a marker (MARKER_URL). Without one it does nothing.
 * @param {string | undefined} url
 */
export function recordClockEnd(url) {
  if (!url) return;
  const offset = clockOffset(url);
  if (offset !== undefined) clockEnd.add(offset);
}
