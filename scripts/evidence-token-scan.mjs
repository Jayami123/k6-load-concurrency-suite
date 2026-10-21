// Scans evidence files for tokens before they go into a release.
// Prints file and line only. The matched text is never printed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The three patterns of the Task 8 step 8 grep, then the additions.
/** @type {RegExp[]} */
export const PATTERNS = [
  /api_[A-Za-z0-9]{8,}/,
  /Bearer /,
  /sessionId/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\./,
  /Authorization:/i,
  /\b(?:password|secret|token)=\S+/i,
];

/** @param {string} text @returns {number[]} */
export function findHits(text) {
  /** @type {number[]} */
  const lines = [];
  text.split("\n").forEach((line, index) => {
    if (PATTERNS.some((pattern) => pattern.test(line))) lines.push(index + 1);
  });
  return lines;
}

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** @param {string} root @returns {{ file: string, lines: number[] }[]} */
export function scanTree(root) {
  return listFiles(root)
    .map((file) => ({ file: relative(root, file), lines: findHits(readFileSync(file, "utf8")) }))
    .filter((hit) => hit.lines.length > 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root] = process.argv.slice(2);
  if (!root) {
    console.error("usage: node scripts/evidence-token-scan.mjs <dir>");
    process.exit(2);
  }
  const hits = scanTree(root);
  for (const { file, lines } of hits)
    console.error(`TOKEN PATTERN: ${file} line ${lines.join(", ")}`);
  if (hits.length > 0) {
    console.error("stop: nothing was uploaded");
    process.exit(1);
  }
  console.log("token scan: clean");
}
