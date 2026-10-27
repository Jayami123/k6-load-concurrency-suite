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
