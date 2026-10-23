import type { RaceRequestResult } from "../races/types.ts";

/** The final name must be one of the two values written (P6-TW-RACE-001). */
export function assertNameIsOneOf(final: string | null, candidates: [string, string]): void {
  if (final === null) throw new Error("TEST BUG: the record is missing after the race");
  if (!candidates.includes(final)) {
    throw new Error(`P6-TW-RACE-001: final name ${final} is neither ${candidates.join(" nor ")}`);
  }
}

/** Exactly one success among the parallel redemptions (P6-TW-RACE-004). */
export function assertExactlyOne(successes: number, label: string): void {
  if (successes !== 1) throw new Error(`${label}: ${successes} successes, expected exactly 1`);
}

/** Both disjoint-field values persist (P6-TW-RACE-005). */
export function assertBothKept(
  got: { name: string | null; employees: number | null },
  want: { name: string; employees: number },
): void {
  if (got.name !== want.name || got.employees !== want.employees) {
    throw new Error(`P6-TW-RACE-005: lost update (name ${got.name}, employees ${got.employees})`);
  }
}

/** A replay after a success is refused with a GraphQL error (P6-TW-RACE-006). */
export function assertReplayRefused(body: { errors?: Array<{ message: string }> }): void {
  if (!body.errors?.length) throw new Error("P6-TW-RACE-006: replay was accepted");
}

/** One live row for the pair after a merge, and one survivor id in every response (P6-TW-RACE-003). */
export function assertOneSurvivor(liveRows: number, survivorIds: Array<string | null>): void {
  const ids = new Set(survivorIds);
  if (liveRows !== 1 || ids.size !== 1 || ids.has(null)) {
    throw new Error(`P6-TW-RACE-003: ${liveRows} live rows, survivor ids ${[...ids].join(",")}`);
  }
}

/** No 5xx and no missing response in a trial (the roadmap's oracle on every case). */
export function assertNo5xx(statuses: Array<number | null>): void {
  const bad = statuses.filter((s) => s === null || s >= 500);
  if (bad.length) {
    throw new Error(
      `UNEXPECTED: 5xx or no response: ${bad.join(",")} (no product label; Task 6 D14)`,
    );
  }
}

/** True when every request was in flight at one moment: the latest start is before the earliest end (D15). */
export function overlapped(
  requests: Array<Pick<RaceRequestResult, "startedAtMs" | "endedAtMs">>,
): boolean {
  if (requests.length < 2) return false;
  return (
    Math.max(...requests.map((r) => r.startedAtMs)) < Math.min(...requests.map((r) => r.endedAtMs))
  );
}
