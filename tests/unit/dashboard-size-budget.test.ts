import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { collectFromArtefactDir } from "../../src/dashboard/collect.ts";
import { readKneeCurves } from "../../src/dashboard/knee/read-curves.ts";
import { parsePendingFile, planRelease } from "../../src/dashboard/release-plan.ts";
import { renderSite } from "../../src/dashboard/render/page.ts";
import { buildSiteModel, type VerdictInput } from "../../src/dashboard/site-model.ts";
import { readSoakTrends } from "../../src/dashboard/soak/read-trends.ts";
import { readKnee, readSoak } from "../../scripts/dashboard/build-site.ts";

const SIZE_BUDGET = "tests/fixtures/dashboard/size-budget.json";
const FIXTURES = "tests/fixtures/dashboard";

/**
 * 4096 bytes is 5.85% of the 69994-byte fixture page. A typical chart on that page is about
 * 2.0–2.6 KB and the knee card is 7541 bytes. This headroom covers a caption or a short table.
 * A second knee card is past it. The reason is in docs/plans/2026-10-28-p6-dashboard-v2.md.
 */
const HEADROOM_BYTES = 4096;

/** Bytes of the published page, from curl size_download and wc -c on 2026-10-28 19:25 UTC. */
const LIVE_BYTES = 393822;

interface SizeBudgetFile {
  measuredBytes: number;
  headroomBytes: number;
  maxBytes: number;
  liveBytes: number;
}

/**
 * Verdicts the trimmed fixtures do not carry. One row per card whose fixture data would not
 * land on the same state as the published page. Known-fail rows use the existing case mapping.
 */
const STATUS_ROWS: VerdictInput[] = [
  {
    runId: "20261025T211249Z-930402a3",
    caseId: "P6-CAL-LOAD-005",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
    githubRunId: "40234172872",
  },
  {
    runId: "20261027T053030Z-ba00cb53",
    caseId: "P6-MED-LOAD-005",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
    githubRunId: "40455577906",
  },
  {
    runId: "20261027T120000Z-two",
    caseId: "P6-MED-RACE-002",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261027T120100Z-cancel",
    caseId: "P6-MED-RACE-009",
    outcome: "FAIL",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261027T120200Z-inv",
    caseId: "P6-CAL-RACE-003",
    outcome: "FAIL",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261027T113647Z-f900ee85",
    caseId: "P6-CAL-LOAD-003",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
    githubRunId: "40497029348",
  },
];

function stageCopy(dir: string, src: string, dest: string): void {
  const abs = path.join(dir, dest);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, readFileSync(src));
}

function stageKnee(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "size-knee-"));
  stageCopy(
    dir,
    path.join(FIXTURES, "knee/cal-40234172872.json"),
    "knee-cal/P6-CAL-LOAD-005/20261025T211249Z-930402a3/knee-report-main.json",
  );
  stageCopy(
    dir,
    path.join(FIXTURES, "knee/doc-invalid-40234172872.json"),
    "knee-documenso/P6-DOC-LOAD-005/20261025T211144Z-2d4c30cb/knee-report-main.json",
  );
  return dir;
}

function stageSoak(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "size-soak-"));
  const runDir = path.join(dir, "soak-medusa-120", "P6-MED-LOAD-005", "20261027T053030Z-ba00cb53");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    path.join(runDir, "soak.json"),
    readFileSync(path.join(FIXTURES, "soak/med-120-40455577906-soak.json")),
  );
  writeFileSync(
    path.join(runDir, "telemetry-main.json"),
    readFileSync(path.join(FIXTURES, "soak/med-120-40455577906-telemetry-head.json")),
  );
  return dir;
}

/** The page the budget measures: fixture artefacts plus the status rows above. */
export function releasePage(): string {
  const verdicts: VerdictInput[] = [];
  const kneeCurves = [];
  const soakTrends = [];
  const aa = [];
  const ab = [];
  const races = [];
  for (const group of ["aa", "ab", "races"] as const) {
    const dir = path.join(FIXTURES, group);
    for (const id of readdirSync(dir).sort()) {
      const collected = collectFromArtefactDir(path.join(dir, id), id);
      verdicts.push(...collected.verdicts);
      kneeCurves.push(...collected.kneeCurves);
      soakTrends.push(...collected.soakTrends);
      aa.push(...collected.aa);
      ab.push(...collected.ab);
      races.push(...collected.races);
    }
  }
  const kneeDir = stageKnee();
  const soakDir = stageSoak();
  try {
    kneeCurves.push(...readKneeCurves(kneeDir, "40234172872"));
    soakTrends.push(...readSoakTrends(soakDir, "40455577906"));
  } finally {
    rmSync(kneeDir, { recursive: true, force: true });
    rmSync(soakDir, { recursive: true, force: true });
  }
  verdicts.push(...STATUS_ROWS);
  const model = buildSiteModel({ verdicts });
  const releasePlan = planRelease(
    ["40455577906"],
    [{ tag: "p6-phase4", name: "p6-40455577906-evidence.zip" }],
    [],
  );
  const pending = parsePendingFile(
    JSON.parse(readFileSync("docs/evidence/pending-release.json", "utf8")),
  );
  const runs = new Map<string, string>([
    ["20261025T211249Z-930402a3", "40234172872"],
    ["20261027T053030Z-ba00cb53", "40455577906"],
    ["20261027T113647Z-f900ee85", "40497029348"],
  ]);
  return renderSite(model, runs, new Map(), pending, {
    sha: "0123456789abcdef",
    builtAt: "2026-10-28 18:57 UTC",
    observations: [],
    knee: readKnee(path.join("k6", "thresholds", "knee-bounds.json")),
    soak: readSoak(path.join("k6", "thresholds", "soak-bounds.json")),
    kneeCurves,
    soakTrends,
    aa,
    ab,
    races,
    releasePlan,
  });
}

function readBudget(): SizeBudgetFile {
  assert.equal(existsSync(SIZE_BUDGET), true, `${SIZE_BUDGET} is missing`);
  return JSON.parse(readFileSync(SIZE_BUDGET, "utf8")) as SizeBudgetFile;
}

function assertWithinBudget(bytes: number, maxBytes: number): void {
  assert.ok(bytes <= maxBytes, `page is ${bytes} bytes, budget is ${maxBytes}`);
}

const html = releasePage();
const bytes = Buffer.byteLength(html, "utf8");

describe("dashboard size budget", () => {
  it("index.html is at most MAX_SITE_BYTES", () => {
    const budget = readBudget();
    assert.match(html, /PASS 6, FAIL 0, KNOWN FAIL 3, PENDING 1, INVALID 0/);
    assert.equal(bytes, budget.measuredBytes, `fixture page is ${bytes} bytes`);
    assertWithinBudget(bytes, budget.maxBytes);
    assert.equal(budget.headroomBytes, HEADROOM_BYTES);
    assert.equal(budget.maxBytes, budget.measuredBytes + HEADROOM_BYTES);
    assert.equal(budget.liveBytes, LIVE_BYTES);
  });

  it("a page over the budget fails the check", () => {
    const budget = readBudget();
    assert.throws(
      () => assertWithinBudget(budget.maxBytes + 1, budget.maxBytes),
      /page is \d+ bytes, budget is \d+/,
    );
  });
});
