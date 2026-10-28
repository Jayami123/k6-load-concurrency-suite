// The evidence cards of the site. Pure: a card's state is computed from the verdicts at build time, never typed in by hand.
// Precedence: no run is PENDING; runs but none VALID is INVALID; a VALID FAIL on a known case is KNOWN FAIL; any other VALID FAIL
// is FAIL; otherwise PASS. INVALID runs never decide a state, they are only listed.
import {
  KNEE_CASE_IDS,
  SOAK_CASE_IDS,
  TWO_INSTANCE_CASE_IDS,
  showcaseNote,
  type VerdictInput,
} from "./site-model.ts";

export type CardStatus = "PASS" | "FAIL" | "KNOWN FAIL" | "PENDING" | "INVALID";

export interface CardSpec {
  id: string;
  title: string;
  proves: string; // what the card proves, one or two sentences
  caseIds: readonly string[];
  pendingReason: string; // shown while no run of these cases exists in a release
  knownFail?: { caseIds: readonly string[]; obs: string };
}

export interface CardState {
  spec: CardSpec;
  status: CardStatus;
  reason: string; // why the card is PENDING or INVALID; "" otherwise
  obs: string; // the observation id of a KNOWN FAIL; "" otherwise
  runs: VerdictInput[]; // the verdicts of the card's cases, sorted by case then run
}

/** The UTC time of a run, read from its run id (YYYYMMDDTHHMMSSZ-...). A run id without that prefix shows "time unknown". */
export function utcOf(runId: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(runId);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} UTC` : "time unknown";
}

export const CARD_SPECS: readonly CardSpec[] = [
  {
    id: "knee",
    title: "Knee chart with the first saturated resource",
    proves: showcaseNote("knee"),
    caseIds: KNEE_CASE_IDS,
    pendingReason: "no VALID knee run in a release yet",
  },
  {
    id: "soak",
    title: "Soak leak check",
    proves: showcaseNote("soak"),
    caseIds: SOAK_CASE_IDS,
    pendingReason: "no VALID 30-minute soak run in a release yet",
  },
  {
    id: "two-instance",
    title: "Medusa two-instance conservation",
    proves: showcaseNote("two-instance"),
    caseIds: TWO_INSTANCE_CASE_IDS,
    pendingReason: "no VALID conservation run in a release yet",
  },
  {
    id: "promo",
    title: "Medusa promo ledger (P6-MED-RACE-005, P6-MED-RACE-012)",
    proves:
      "It proves that a promotion's budget and its ledger balances hold when carts race for the same promotion: no overspend and no double redemption.",
    caseIds: ["P6-MED-RACE-005", "P6-MED-RACE-012"],
    pendingReason: "no VALID promo ledger run in a release yet",
  },
  {
    id: "cancel",
    title: "Medusa cancel races (P6-MED-RACE-008, P6-MED-RACE-009)",
    proves:
      "It proves that a cancel racing a fulfilment or a second cancel leaves one terminal state and releases every reservation. The known failure is the reservation leak below.",
    caseIds: ["P6-MED-RACE-008", "P6-MED-RACE-009"],
    knownFail: { caseIds: ["P6-MED-RACE-009"], obs: "P6-OBS-MED-002" },
    pendingReason: "no VALID cancel race run in a release yet",
  },
  {
    id: "invariants",
    title: "Cal and Documenso invariants",
    proves:
      "It proves that the race invariants of the Cal and Documenso flows hold under concurrent requests: one booking per slot and one signature per envelope.",
    caseIds: ["P6-CAL-RACE-001", "P6-CAL-RACE-003", "P6-DOC-RACE-001", "P6-DOC-RACE-002"],
    knownFail: {
      caseIds: ["P6-CAL-RACE-003", "P6-DOC-RACE-001"],
      obs: "P6-OBS-CAL-002 / P6-OBS-DOC-002",
    },
    pendingReason: "no VALID invariant run in a release yet",
  },
  {
    id: "invariants-load",
    title: "Invariants under load (Cal, Documenso, Medusa)",
    proves:
      "It proves that the race invariants still hold while the flows run under load: one booking per slot, one signature per envelope, and the Medusa order and reservation counts. The Medusa cancel-race leak is a known failure (P6-OBS-MED-002).",
    caseIds: [
      "P6-CAL-LOAD-002",
      "P6-CAL-LOAD-006",
      "P6-DOC-LOAD-003",
      "P6-MED-LOAD-007",
      "P6-MED-LOAD-008",
      "P6-MED-LOAD-009",
    ],
    knownFail: { caseIds: ["P6-MED-LOAD-009"], obs: "P6-OBS-MED-002" },
    pendingReason: "no VALID invariant-under-load run in a release yet",
  },
  {
    id: "aa-noise",
    title: "A/A noise and tolerance",
    proves:
      "It proves how much two identical runs differ, which sets the tolerance a change must exceed before the A/B gate reads it as a regression.",
    caseIds: ["P6-CAL-LOAD-003", "P6-MED-LOAD-002"],
    pendingReason: "no VALID A/A arm in a published release yet",
  },
  {
    id: "ab-gate",
    title: "A/B gate verdicts",
    proves:
      "It proves whether a change moved a measured metric beyond the A/A tolerance. Without a tolerance no verdict can be read.",
    caseIds: ["P6-CAL-LOAD-003"],
    pendingReason: "no VALID A/B gate verdict in a published release yet",
  },
  {
    id: "twenty",
    title: "Twenty races (P6-TW-RACE-001–006)",
    proves:
      "It proves the Twenty race histograms carry an assigned pass or fail, not the createHistogram default.",
    caseIds: [
      "P6-TW-RACE-001",
      "P6-TW-RACE-002",
      "P6-TW-RACE-003",
      "P6-TW-RACE-004",
      "P6-TW-RACE-005",
      "P6-TW-RACE-006",
    ],
    knownFail: { caseIds: ["P6-TW-RACE-004"], obs: "P6-OBS-TW-001" },
    pendingReason:
      "published histograms still have the default fail; waiting for a release after PR-T",
  },
];

/** The state of one card from the verdicts of its cases. */
export function computeCard(spec: CardSpec, verdicts: readonly VerdictInput[]): CardState {
  const runs = verdicts
    .filter((v) => spec.caseIds.includes(v.caseId))
    .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.runId.localeCompare(b.runId));
  if (runs.length === 0)
    return { spec, status: "PENDING", reason: spec.pendingReason, obs: "", runs };
  const valid = runs.filter((v) => v.validity === "VALID");
  if (valid.length === 0)
    return { spec, status: "INVALID", reason: `${runs.length} run(s), none VALID`, obs: "", runs };
  const knownFail = spec.knownFail;
  if (knownFail && valid.some((v) => isKnownFail(v, spec)))
    return { spec, status: "KNOWN FAIL", reason: "", obs: knownFail.obs, runs };
  if (valid.some((v) => v.outcome === "FAIL"))
    return { spec, status: "FAIL", reason: "", obs: "", runs };
  return { spec, status: "PASS", reason: "", obs: "", runs };
}

function isKnownFail(v: VerdictInput, spec: CardSpec): boolean {
  const kf = spec.knownFail;
  if (!kf || !kf.caseIds.includes(v.caseId)) return false;
  if (v.outcome === "FAIL") return true;
  if (v.knownFail && kf.obs.split(" / ").includes(v.knownFail)) return true;
  // Cancel -009 histograms are verdict "pass" with suspectedBug set (Q-4). That is KNOWN FAIL
  // only because spec.knownFail.caseIds lists them. Never use this branch to map a case to FAIL.
  if ((v.suspectedBugCount ?? 0) > 0 && v.outcome === "PASS") return true;
  return false;
}
