// Counts from the product's log, appended since the last poll. Counts only: no line or byte of text is ever returned (plan task 5 §6.3).
import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { LoadProduct } from "../types.ts";

export const MEDUSA_5XX = /"level":"http".*?"status":5\d\d/;
export const KNOWN_NOISE = {
  smtp: /ECONNREFUSED 127\.0\.0\.1:1025/,
  dailyVideo: /createMeeting failed/,
} as const;
const JOB_FAILED = /\[JOBS\]: Job .* failed/;
const DURATION = /"duration":(\d+(?:\.\d+)?)/;

export interface LogCounts {
  errorLines: number;
  http5xx: number;
  jobFailures: number;
  knownNoise: { smtp: number; dailyVideo: number };
  maxServerMs?: number;
}

/** Counts one chunk of complete lines. Noise lines are counted by class and never as errors. */
export function countFromChunk(product: LoadProduct, chunk: string): LogCounts {
  const out: LogCounts = {
    errorLines: 0,
    http5xx: 0,
    jobFailures: 0,
    knownNoise: { smtp: 0, dailyVideo: 0 },
  };
  for (const line of chunk.split("\n")) {
    if (line.length === 0) continue;
    if (KNOWN_NOISE.smtp.test(line)) {
      out.knownNoise.smtp += 1;
      continue;
    }
    if (KNOWN_NOISE.dailyVideo.test(line)) {
      out.knownNoise.dailyVideo += 1;
      continue;
    }
    if (product === "medusa") {
      if (MEDUSA_5XX.test(line)) out.http5xx += 1;
      const ms = DURATION.exec(line);
      if (ms) out.maxServerMs = Math.max(out.maxServerMs ?? 0, Number(ms[1]));
    }
    if (product === "documenso" && JOB_FAILED.test(line)) out.jobFailures += 1;
    if (/\berror\b/i.test(line)) out.errorLines += 1;
  }
  return out;
}

export interface LogIo {
  size(file: string): number;
  read(file: string, from: number, to: number): string;
}

const defaultIo: LogIo = {
  size: (file) => statSync(file).size,
  read: (file, from, to) => {
    const fd = openSync(file, "r");
    try {
      const buf = Buffer.alloc(to - from);
      const n = readSync(fd, buf, 0, buf.length, from);
      return buf.subarray(0, n).toString("utf8");
    } finally {
      closeSync(fd);
    }
  },
};

/**
 * Starts at the file's current size, so earlier lines never count. poll() returns the counts of the bytes appended since the
 * last poll; a partial last line waits for its newline, so a line split across two polls is counted once. A shrunk file
 * (rotation or truncation) restarts at offset 0.
 */
export function createLogCounter(
  file: string,
  product: LoadProduct,
  io: LogIo = defaultIo,
): { poll(): LogCounts } {
  let offset = io.size(file);
  let pending = "";
  return {
    poll(): LogCounts {
      const size = io.size(file);
      if (size < offset) {
        offset = 0;
        pending = "";
      }
      if (size > offset) {
        pending += io.read(file, offset, size);
        offset = size;
      }
      const lastNewline = pending.lastIndexOf("\n");
      if (lastNewline === -1) return countFromChunk(product, "");
      const complete = pending.slice(0, lastNewline + 1);
      pending = pending.slice(lastNewline + 1);
      return countFromChunk(product, complete);
    },
  };
}
