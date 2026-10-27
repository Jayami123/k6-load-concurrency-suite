// The dashboard site model (plan Phase 4b task 13 §6.2). Pure: the caller reads the artefacts, this module decides what the site shows.
// A showcase without its data is pending with its reason; INVALID runs are listed and never plotted.
export type ShowcaseId = "knee" | "soak" | "two-instance";

export interface ShowcaseState {
  id: ShowcaseId;
  status: "ready" | "pending";
  pending?: string; // the reason, shown on the site and in the README (never a placeholder number)
  note: string; // "what this proves", the same text as the README
  runLinks: string[]; // GitHub Actions run URLs of the evidence used
}

export interface SiteModel {
  generatedFrom: string[]; // the run IDs the site was built from
  showcases: ShowcaseState[];
  invalidRuns: Array<{ runId: string; caseId: string; reasons: string[] }>; // listed, never plotted
}

export interface VerdictInput {
  runId: string;
  caseId: string;
  outcome: string;
  validity: string;
  reasons: string[];
}

const NOTES: Record<ShowcaseId, string> = {
  knee: "This shows where each product's knee range sits and which resource gave first (rule in src/load/knee/first-saturated.ts). It proves the stop rule finds a range, not a single maximum: the range and the run IDs are the evidence, and the label is 'knee range, environment-bound'.",
  soak: "This shows the RSS, fds and connection slope after warm-up and the plateau verdict, with the DB growth reported separately. It proves that growth which does not plateau is flagged and that data growth is not read as a leak.",
  "two-instance":
    "This shows that two Medusa backends on one database and one Redis lock sell no more units than stock, and that no cart becomes two orders (P6-MED-RACE-002 and P6-MED-LOAD-007). It proves the lock holds under two instances.",
};

/** The text of a showcase's "what this proves" note (the same text goes in the README). */
export function showcaseNote(id: ShowcaseId): string {
  return NOTES[id];
}

/** Escapes every artefact-derived value before it is put in HTML. No raw artefact text reaches the page. */
export function escapeLabel(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the model from the verdicts of the artefacts. A showcase without its data is pending with its reason. The INVALID list is
 * sorted by case then run, so the page is stable between builds.
 */
export function buildSiteModel(input: {
  verdicts: VerdictInput[];
  hasSoakData: boolean;
  hasInvariantData: boolean;
}): SiteModel {
  const knee = input.verdicts.filter((v) => /KNEE/.test(v.caseId) && v.validity === "VALID");
  const showcases: ShowcaseState[] = [
    {
      id: "knee",
      status: knee.length > 0 ? "ready" : "pending",
      ...(knee.length > 0 ? {} : { pending: "no valid knee run in the artefacts yet" }),
      note: NOTES.knee,
      runLinks: knee.map((v) => v.runId),
    },
    {
      id: "soak",
      status: input.hasSoakData ? "ready" : "pending",
      ...(input.hasSoakData ? {} : { pending: "waiting for the soak data (Task 7)" }),
      note: NOTES.soak,
      runLinks: [],
    },
    {
      id: "two-instance",
      status: input.hasInvariantData ? "ready" : "pending",
      ...(input.hasInvariantData ? {} : { pending: "waiting for the invariant data (Task 10)" }),
      note: NOTES["two-instance"],
      runLinks: [],
    },
  ];
  const invalidRuns = input.verdicts
    .filter((v) => v.validity === "INVALID")
    .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.runId.localeCompare(b.runId))
    .map((v) => ({ runId: v.runId, caseId: v.caseId, reasons: v.reasons }));
  const generatedFrom = [...new Set(input.verdicts.map((v) => v.runId))].sort();
  return { generatedFrom, showcases, invalidRuns };
}
