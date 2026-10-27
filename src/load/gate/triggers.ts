// The A/B trigger decision (plan Phase 4b task 12 §6.4): which product ref was bumped (a `*_REF` value changed in perf.yml or
// scripts/bootstrap.sh), and whether a change touches P6 load code (the D5 path triggers).
export const REF_NAMES = ["CAL_REF", "MEDUSA_REF", "DOCUMENSO_REF"] as const;
export type RefName = (typeof REF_NAMES)[number];

const LOAD_CODE_PREFIXES = ["k6/", "scripts/load/", "src/load/"] as const;

/**
 * The `*_REF` names whose value changed in a unified diff of perf.yml or bootstrap.sh. A line is a change only when it adds or removes
 * a `NAME=` or `NAME:` assignment; other edits to those files do not start the gate.
 */
export function changedRefs(diffText: string): RefName[] {
  const changed = new Set<RefName>();
  for (const line of diffText.split("\n")) {
    if (!/^[+-]/.test(line) || line.startsWith("+++") || line.startsWith("---")) continue;
    for (const name of REF_NAMES) {
      if (new RegExp(`\\b${name}\\s*[:=]`).test(line)) changed.add(name);
    }
  }
  return REF_NAMES.filter((name) => changed.has(name));
}

/** True when any changed path is under k6/, scripts/load/ or src/load/. */
export function touchesLoadCode(paths: string[]): boolean {
  return paths.some((p) => LOAD_CODE_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

const SHA = /^[0-9a-f]{40}$/;
export const ZERO_SHA = "0000000000000000000000000000000000000000";

/**
 * The label names of a `pull_request` event, from the LABELS_JSON the workflow passes (toJSON of the event's labels). On a push there is
 * no pull request, so the value is the string "null": that is no labels. An empty or missing value is no labels too. Bad input (invalid
 * JSON, or a value that is not an array of named labels) throws: it is never read as "no labels".
 */
export function parseLabelNames(json: string | undefined): string[] {
  if (json === undefined || json.trim() === "") return [];
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(`gate triggers: LABELS_JSON is not valid JSON (${json.slice(0, 60)})`);
  }
  if (value === null) return [];
  if (!Array.isArray(value))
    throw new Error("gate triggers: LABELS_JSON must be a JSON array or null");
  return value.map((label) => {
    if (!label || typeof (label as { name?: unknown }).name !== "string")
      throw new Error("gate triggers: every label in LABELS_JSON needs a string name");
    return (label as { name: string }).name;
  });
}

/** True when the pull request carries the label. */
export function hasLabel(names: string[], label: string): boolean {
  return names.includes(label);
}

export interface DiffBaseInput {
  eventName: string;
  prBaseSha?: string; // github.event.pull_request.base.sha
  beforeSha?: string; // github.event.before on a push
}

/**
 * The commit the trigger diff starts from: the PR base on a pull request; the commit before the push on a push; and HEAD~1 when the push
 * has no earlier commit (the all-zero before of a new branch). A malformed sha throws.
 */
export function diffBaseOf(input: DiffBaseInput): string {
  if (input.eventName === "pull_request") {
    if (!input.prBaseSha || !SHA.test(input.prBaseSha))
      throw new Error("gate triggers: a pull request needs a 40-hex base sha");
    return input.prBaseSha;
  }
  if (input.beforeSha === undefined || input.beforeSha === "" || input.beforeSha === ZERO_SHA)
    return "HEAD~1";
  if (!SHA.test(input.beforeSha))
    throw new Error("gate triggers: the push 'before' sha is not 40-hex");
  return input.beforeSha;
}
