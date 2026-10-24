# P6 Phase 3 Task 6: post-load reconciliation (`P6-X-LOAD-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 6", D6, D7, "Rules that hold for every task".
It builds on the Task 3 plan ([task3](2026-10-24-p6-phase3-task3-load-foundation.md) §6.2: `Stage`, `StageResult`, `LoadContext`, the `reconcile` and `cleanup` slots; §6.4: `verdict.json`) and the
Task 4 plan ([task4](2026-10-24-p6-phase3-task4-load-validity.md) §6.7: the `reconcile` slot first runs the validity step, then this task's audit). Names not defined here are defined there.

## 1. Header

- **Task.** Phase 3 Task 6. Case: `P6-X-LOAD-005` (P0).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-load-reconciliation`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3 and 4 merged (Task 5 is independent).
- **Harness pin assumed.** Any. No product is started by the build; the unit tests use fixtures.
- **Environment change.** None (§11).
- **Unit tests.** B = count on main when the build starts (today's chain: 656 after Tasks 1 to 5; Task 5 is independent, so the deltas are what counts). This plan adds **+33** (§12); expected B + 33 (**689** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 557 -> T4 600 -> T5 656 -> T6 689 -> T7 707 -> T8 726 -> T9 750 -> T10 784.
- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 known bugs are counted, not failed, **but an `unexpected` entry fails the run** (a known bug seen where it should not occur is new evidence). Q2 (and Task 8 Q2) `F-M2` ghost orders are counted until fixed upstream, then the flag flips to fail (the flip is a recorded follow-up, §13). Q3 accept the 30 s drain contract. Q4 accept. All closed in §13.
- **Stop for owner review.** Yes (rule 10): a shared runner changes, and the owner labels product bugs.

## 2. What it proves

- **Correctness is checked after the load, not only per request.** After every LOAD run an audit reads the product's database through the existing read-only oracles, scoped to the run's own data, and any violation is a **PRODUCT BUG** with evidence.
- **Finance and healthcare.** The end-of-day reconciliation of a ledger, or a medication-count reconciliation after a busy shift: the books must balance whatever the throughput was. Known bugs are counted under their own ids, never hidden and never allowed to drown a new finding.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM. Products were started with `npm run up:<product>` and stopped with `down`; the audits below are throwaway prototypes (`/tmp/s/probe/{cal-audit,med-oracle,med-money,doc-audit}.ts`) that import the repo's own read-only pool and oracles.
Load came from the k6 journey prototypes of the Task 7/8/10 plans, 2.3.0.

### 3.1 Can each oracle be scoped by the run prefix? (roadmap probe item 1)

| Product   | Scope used                                                                                                                                                                             | Probe result                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cal       | `Attendee.email LIKE '<prefix>%'` through `caseLiveBookings`, `readOverlapPairs(pool, userId, like)` (`OVERLAP_PAIRS_SQL` filters both bookings by attendee)                           | 2 per second for 20 s: **41** live bookings, all `accepted`, **0** overlap pairs; 10 per second for 15 s: **144** live bookings, **0** pairs; cleanup cancelled 144 and left 0 (`leakCheck` empty) |
| Medusa    | variant id + inventory item id + location id (`readOversellSnapshot`), `order.email LIKE '<prefix>-%'` (`LEAK_LIVE_ORDER_IDS_SQL`), payments joined through `order_payment_collection` | 1 journey per second, S = 25, 30 s: `orderCount 25`, `orderQty 25`, `reservationQty 25`, `stocked 25`, `reserved 25`, live orders by email 25, status `pending` ×25                                |
| Documenso | `Envelope.title LIKE '<prefix>%'`, seal jobs by `payload->>'documentId'` = the number in `secondaryId` (`document_<n>`), `DocumentAuditLog` by `envelopeId`                            | 258 envelopes from the probes: all `COMPLETED`, `seal=1`, `stuck=0`, `audit=1`                                                                                                                     |

Titles, emails and attendee addresses carry the run prefix because the **k6 journeys put it there** (Task 3 `caseDataPrefix`, `iterationId`, `attendeeEmail`); the audit never reads global data. Each audit also asserts it saw at least one run-created row, so a scoping mistake cannot pass on nothing (§7).

The SQL strings (all `SELECT`, all with one `LIKE` parameter, all valid through `assertSelectOnly`):

```sql
-- Medusa: payments of the run's orders (balances); 25 rows in the probe
SELECT p.id, p.amount::text AS amount,
  (SELECT COALESCE(SUM(c.amount),0)::text FROM capture c WHERE c.payment_id = p.id AND c.deleted_at IS NULL) AS captured,
  (SELECT COALESCE(SUM(r.amount),0)::text FROM refund  r WHERE r.payment_id = p.id AND r.deleted_at IS NULL) AS refunded
FROM "order" o JOIN order_payment_collection opc ON opc.order_id = o.id
JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
WHERE o.email LIKE $1 AND o.deleted_at IS NULL AND p.deleted_at IS NULL
-- result: 25 payments, every one "amount=1010 captured=0 refunded=0"; payment collections: authorized x25; orders without a payment collection: 0

-- Documenso: per envelope of the run
SELECT e.id, e.status::text AS status,
  (SELECT count(*)::int FROM "BackgroundJob" j WHERE j."jobId" = 'internal.seal-document' AND j.payload->>'documentId' = substring(e."secondaryId" from 'document_(\d+)')) AS seal_jobs,
  (SELECT count(*)::int FROM "BackgroundJob" j WHERE j.status IN ('PENDING','PROCESSING') AND j.payload->>'documentId' = substring(e."secondaryId" from 'document_(\d+)')) AS stuck_jobs,
  (SELECT count(*)::int FROM "DocumentAuditLog" a WHERE a."envelopeId" = e.id AND a.type::text = 'DOCUMENT_COMPLETED') AS completed_audit
FROM "Envelope" e WHERE e.title LIKE $1
```

### 3.2 Which Medusa money oracles exist on `main`? (roadmap probe item 3, Note 2, D7)

Grepped at `5acd2a0`: in `src/medusa/oracle.ts`: `MONEY_PAYMENT_FOR_ORDER_SQL`, `MONEY_SNAPSHOT_SQL`, `readMoneySnapshot`, `moneyLeakCheck`, `LATEST_SUMMARY_SQL`, `readLatestSummaryRefund`; in `src/medusa/invariants.ts`:
`checkRefundCap({capturedSum, refundedSum})`, `checkCaptureCap({authorizedAmount, capturedSum})`, `checkSummaryRefund`; `src/medusa/money.ts` `parseWholeAmount`. They landed with Phase 2 Task 2 (`P6-MED-RACE-007/010/011`).
So the D7 clause "balances ≥ 0" is **not pending**: the audit reconciles it as _captured ≤ authorised_ and _refunded ≤ captured_ for every payment of the run, which also means _outstanding = captured − refunded ≥ 0_. The probe's pure checkouts capture and refund nothing (captured 0, refunded 0, authorised 1010),
so the clause is satisfied and non-vacuous for the capture/refund journeys of later phases. The pending-mechanism of D7 stays in the code (`AuditResult.pending: string[]`) for a product whose oracle is missing; it is empty for all three products today.

### 3.3 How long do Documenso's in-process jobs take to drain? (probe item 2)

`NEXT_PRIVATE_JOBS_PROVIDER=local`: jobs run inside the web process. After k6 stopped (journey with two recipients, 20 s per run, VM):

| Rate (documents/s) | Documents | Peak PENDING / PROCESSING jobs | Drain after k6 ended | k6 `dropped_iterations` |
| ------------------ | --------- | ------------------------------ | -------------------- | ----------------------- |
| 0.5                | 10        | 0 / 2                          | ≤ 2 s (probe floor)  | 0                       |
| 1                  | 21        | 1 / 2                          | ≤ 2 s                | 0                       |
| 2                  | 41        | 1 / 3                          | ≤ 2 s                | 0                       |
| 5                  | 85        | 9 / 46                         | ≈ 3 s                | 15                      |
| 10                 | 94        | 11 / 50                        | ≈ 3 s                | 106                     |

(The probe's drain loop needs four consecutive idle half-second samples, so 2 s is its floor.) Drain contract of this task: **30 seconds** (ten times the worst measured 3 s), after which still-pending jobs are a `PRODUCT BUG` finding ("backlog did not drain").
Task 9 sets its own, tighter lag contract from its probe; this one only guarantees the audit does not read half-finished work. `waitForDrain` returns the measured drain time.

### 3.4 Known bugs in the audits (counted separately, never hidden)

- `P6-OBS-CAL-002` (high, calcom/cal.diy#30374): two overlapping bookings of one host both accepted. In the LOAD journeys every booking has its own slot, so the audit expects 0 pairs; any pair is reported under `knownBugs["P6-OBS-CAL-002"]`.
- `P6-OBS-DOC-002` (medium, documenso/documenso#3187): double seal when the last recipients complete **in parallel**. Journeys complete sequentially (probe: seal = 1 on all 258 envelopes), so a double seal is reported under `knownBugs["P6-OBS-DOC-002"]` and flagged `unexpectedForSequential: true`: new evidence, the Task 9 wording.
- `F-M2` (Medusa, owner label PRODUCT BUG, README "Known product bugs") and `F-M5` (same mechanism, SUSPECTED): a DB order that no checkout returned. Under LOAD, `orderCount` (database) above the client-visible `p6_orders` counter is reported under `knownBugs["F-M2"]`.
- Probe check: none of the four fired in any probe run (0 pairs; 258 single seals; Medusa DB orders equal the client's orders in every run).

### 3.5 What stays unconfirmed ("build-time probe must confirm")

1. The exact audit runtime per product at the real run sizes (the SQL is index-friendly for the probe sizes: milliseconds; Task 7's CI runs measure it).
2. Cal and Documenso rows when the journey creates the data through k6 only (Task 7 probes both; the data above came from prototype journeys of the same shape).
3. `payment.amount` for orders whose payment is captured (no capture exists in any LOAD journey yet).

## 4. Depends on earlier plans

From Task 3: `LoadCase`, `LoadContext` (`config`, `k6`, `results`), `Stage`, `StageResult`, `defaultStages` (`reconcile`, `cleanup` slots), `parseK6Summary` (the client-side counters are read from the k6 summary), `EXIT_CODES`, `runDir`. From Task 4: the `reconcile` slot already runs `judgeValidity` first; this task adds the audit
after it in the same slot, via `composeStages`. From `main` (exact names, all grepped): `src/oracles/pg.ts` (`createReadOnlyPool`, `selectRows`, `waitForStable`); `src/cal/oracle.ts` (`HOST_OVERLAP_SQL`, `OVERLAP_PAIRS_SQL`, `readOverlapPairs`, `caseLiveBookings`, `leakCheck`, `pairEvidence`, `type OverlapPair`, `type SlotRow`);
`src/medusa/oracle.ts` (`readOversellSnapshot`, `type OversellOracleSnapshot`, `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `LEAK_LIVE_ORDER_IDS_SQL`, `leakCheck`, `moneyLeakCheck`); `src/medusa/invariants.ts` (`checkCaptureCap`, `checkRefundCap`);
`src/medusa/money.ts` (`parseWholeAmount`); `src/documenso/oracle.ts` (`SEAL_JOBS_SQL`, `readTerminalJobs`, `DOCUMENT_COMPLETED_AUDIT_SQL`, `ENVELOPE_SQL`, `LIVE_ENVELOPE_LEAK_SQL`, `leakCheck`) and `src/documenso/invariants.ts`.
Task 7 (journeys) puts the run prefix into the data and fills `ctx.config.audit` in each case's `setup` stage (§6.4); until then the audit is exercised by fixtures.

## 5. Build-time recheck

| #   | Check                       | Command                                                                                                                                        | Expected                                                                                 |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Base, Tasks 3 and 4 merged  | `git log -1 --format=%h origin/main; git log --oneline origin/main \| grep -i "validity\|runner core"`                                         | descendant of `5acd2a0`; both tasks present                                              |
| 2   | Baseline                    | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                            | exit 0, `# tests` = B (656 once Tasks 1 to 5 are merged)                                 |
| 3   | Task 3 and 4 interfaces     | `grep -n "reconcile" src/load/stages.ts; grep -n "export function judgeValidity" src/load/validity.ts`                                         | `reconcile` slot present; Task 4's validity wiring present (`composeStages` is new here) |
| 4   | Money oracles still on main | `grep -n "export function checkRefundCap\|export function checkCaptureCap\|export async function readMoneySnapshot" src/medusa/*.ts`           | three hits (otherwise: the Medusa money clause becomes `pending`, §6.5)                  |
| 5   | Known-bug ids still current | `grep -n "P6-OBS-CAL-002\|P6-OBS-DOC-002\|F-M2" README.md docs/BACKLOG.md \| head`                                                             | all three present; if a bug is fixed upstream, drop its `knownBugs` entry                |
| 6   | Table and column names      | with a stack up: `psql`-less probe: run the build's `tests/unit/reconcile-sql.test.ts` plus the three SQL strings of §3.1 through `selectRows` | no `relation does not exist`                                                             |

## 6. Design

### 6.1 File tree

```text
src/load/reconcile/types.ts            NEW      Finding, AuditCheck, AuditResult, AuditScope per product, AuditStageConfig
src/load/reconcile/cal.ts              NEW      readCalSnapshot(), evaluateCalAudit(), reconcileCal()
src/load/reconcile/medusa.ts           NEW      readMedusaSnapshot(), evaluateMedusaAudit(), reconcileMedusa()
src/load/reconcile/documenso.ts        NEW      readDocumensoSnapshot(), waitForDrain(), evaluateDocumensoAudit(), reconcileDocumenso()
src/load/reconcile/index.ts            NEW      reconcileStage (a Stage), writeAudit(), the product switch
src/load/stages.ts                     CHANGED  + composeStages(); reconcile slot = composeStages(validityStage, reconcileStage) (Task 4 added validityStage)
src/load/types.ts                      CHANGED  + AuditResult in verdict (reasons/knownBugs)
src/ci/load-table.ts                   CHANGED  + known-bug column
tests/unit/reconcile-cal.test.ts, reconcile-medusa.test.ts, reconcile-documenso.test.ts, reconcile-index.test.ts    NEW
README.md                              CHANGED  "What the audit checks" (one table)
```

### 6.2 Types (`src/load/reconcile/types.ts`, exact)

```ts
export type AuditProduct = "cal" | "medusa" | "documenso";

/** kind follows docs/agent-rules.md. knownBugId is set when the finding is an already-labelled bug; such findings go to knownBugs, not violations. */
export interface Finding {
  kind: "PRODUCT BUG" | "TEST BUG";
  text: string;
  knownBugId?: string;
}

/** One line of the audit table. detail holds counts and ids only (no URL, token, email, title). */
export interface AuditCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AuditResult {
  schema: 1;
  product: AuditProduct;
  prefixLike: string; // the LIKE argument that scoped the audit, e.g. "p6-qa-20261024t010203z-3fa9c0d1-med-load-001-%"
  rowsSeen: number; // run-created rows the audit found; 0 is a TEST BUG
  drainMs?: number; // Documenso only
  checks: AuditCheck[];
  violations: Finding[]; // PRODUCT BUG or TEST BUG; any entry fails the run
  knownBugs: Record<string, number>; // counted separately; never hidden; do not fail the run
  unexpected: string[]; // known bug seen where it should not occur (Documenso double seal with sequential completions)
  pending: string[]; // clauses with no oracle yet (D7); empty today
  leak: string[]; // filled by the cleanup stage's leak check
}

/** What a case's setup stage stores in ctx.config.audit. Plain data, no secrets. */
export type AuditStageConfig =
  | { product: "cal"; userId: number; eventTypeId: number; prefixLike: string }
  | {
      product: "medusa";
      prefixLike: string;
      variantId: string;
      inventoryItemId: string;
      locationId: string;
      stock?: number;
    }
  | {
      product: "documenso";
      prefixLike: string;
      drainTimeoutMs?: number;
      sequentialCompletions: boolean;
    };
```

The client-visible counters come from the k6 summary of the run (`parseK6Summary` custom counters): `p6_bookings_accepted` (Cal), `p6_orders` (Medusa), `p6_docs_completed` (Documenso); `reconcileStage` passes them to the evaluators as `clientCount`. Journeys that do not define the counter pass `undefined` and the corresponding check is skipped and listed in `pending` (never silently dropped).

### 6.3 Cal (`src/load/reconcile/cal.ts`)

```ts
export interface CalSnapshot {
  liveBookings: number;
  nonAccepted: number;
  overlapPairs: number;
  clientAccepted?: number;
}
export async function readCalSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "cal" }>,
  clientAccepted?: number,
): Promise<CalSnapshot> {
  const live = await caseLiveBookings(pool, cfg.prefixLike); // status accepted or pending, attendee LIKE prefix (CASE_LIVE_BOOKINGS_SQL)
  const pairs = await readOverlapPairs(pool, cfg.userId, cfg.prefixLike); // OVERLAP_PAIRS_SQL, waitForStable inside
  return {
    liveBookings: live.length,
    nonAccepted: live.filter((r) => r.status !== "accepted").length,
    overlapPairs: pairs.length,
    clientAccepted,
  };
}
/** Pure. */
export function evaluateCalAudit(s: CalSnapshot, prefixLike: string): AuditResult;
```

Checks, in order (name → rule → on failure):

1. `rows`: `liveBookings ≥ 1` → else `TEST BUG: audit saw no bookings (scope LIKE <prefix>)`.
2. `accepted-only`: `nonAccepted == 0` → else `PRODUCT BUG: N bookings of the run are pending or in another live state` (journey books ACCEPTED slots).
3. `client-matches-db`: when `clientAccepted` is given, `liveBookings == clientAccepted` → else `PRODUCT BUG: client was told ACCEPTED for A bookings, the database holds B` (either direction).
4. `no-overlap`: `overlapPairs == 0`; otherwise **not a violation**: `knownBugs["P6-OBS-CAL-002"] = overlapPairs`, check `ok: false, detail: "N overlapping accepted pairs (P6-OBS-CAL-002)"`.
   `reconcileCal(pool, cfg, clientAccepted)` = read then evaluate. The leak check is `leakCheck(pool, cfg.prefixLike)` from `src/cal/oracle.ts`, run by the case's `cleanup` stage after the sweep (`caseLiveBookings` then `cancelBooking` for each uid, probe: 144 cancels in 7.6 s) and stored in `audit.leak`.

### 6.4 Medusa (`src/load/reconcile/medusa.ts`)

```ts
export interface MedusaPayment {
  amount: number;
  captured: number;
  refunded: number;
}
export interface MedusaSnapshot {
  variant: OversellOracleSnapshot; // readOversellSnapshot(): orderCount, orderQty, reservationQty, stocked, reserved
  liveOrdersByEmail: number; // LEAK_LIVE_ORDER_IDS_SQL with the prefix, length
  payments: MedusaPayment[]; // the SQL of §3.1, amounts through parseWholeAmount()
  ordersWithoutPayment: number;
  stock?: number;
  clientOrders?: number;
}
export async function readMedusaSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "medusa" }>,
  clientOrders?: number,
): Promise<MedusaSnapshot>;
/** Pure. */
export function evaluateMedusaAudit(s: MedusaSnapshot, prefixLike: string): AuditResult;
```

Checks (reusing the existing invariant functions and message wording):

1. `rows`: `variant.orderCount ≥ 1` → else `TEST BUG`.
2. `orders-le-stock` (when `stock` is set): `orderCount ≤ stock` and `orderQty ≤ stock` → else `PRODUCT BUG: oversold, N orders for stock S`.
3. `reservations`: `reservationQty == orderQty` and `reserved == reservationQty` → else `PRODUCT BUG: reservation rows R, orders Q, inventory_level.reserved V` (same logic as `checkOversellInvariants`, which is not reused as a whole because it needs per-response data).
4. `available`: `stocked − reserved ≥ 0` → else `PRODUCT BUG: available negative`.
5. `one-payment-per-order`: `payments.length == orderCount` and `ordersWithoutPayment == 0` → else `PRODUCT BUG`.
6. `balances` (D7, the money oracle on `main`): for every payment `checkCaptureCap({ authorizedAmount: amount, capturedSum: captured })` and `checkRefundCap({ capturedSum: captured, refundedSum: refunded })` are empty, and `captured − refunded ≥ 0`. Messages are the existing `PRODUCT BUG: captured X of Y authorised` / `refunded X of Y captured`.
7. `no-ghost-orders`: `liveOrdersByEmail == orderCount` and, when `clientOrders` is given, `orderCount == clientOrders`. A difference is **not a violation**: `knownBugs["F-M2"] = difference` (F-M2 is labelled PRODUCT BUG; F-M5 is the same mechanism; Phase 2 closeout 6b), check `ok: false`.
   `pending`: `["balances"]` only if `grep` of §5 check 4 fails at build time (the oracle functions disappear); today `[]`.
   Cleanup and leak: the case's cleanup cancels and archives the orders found by `LEAK_LIVE_ORDER_IDS_SQL`, deletes the product, then `leakCheck(pool, likePrefix, [inventoryItemId])` from `src/medusa/oracle.ts` (existing); the leak lines land in `audit.leak`.

### 6.5 Documenso (`src/load/reconcile/documenso.ts`)

```ts
export interface DocumensoEnvelopeRow {
  status: string;
  sealJobs: number;
  stuckJobs: number;
  completedAudit: number;
}
export interface DocumensoSnapshot {
  envelopes: DocumensoEnvelopeRow[];
  clientCompleted?: number;
  sequentialCompletions: boolean;
}
/** Polls the stuck-job count (PENDING or PROCESSING jobs whose payload documentId belongs to the run) every 500 ms until 0 or timeoutMs (default 30 000). */
export async function waitForDrain(
  pool: pg.Pool,
  prefixLike: string,
  timeoutMs?: number,
): Promise<{ drained: boolean; drainMs: number }>;
export async function readDocumensoSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "documenso" }>,
  clientCompleted?: number,
): Promise<DocumensoSnapshot>;
/** Pure. */
export function evaluateDocumensoAudit(
  s: DocumensoSnapshot,
  prefixLike: string,
  drain: { drained: boolean; drainMs: number },
): AuditResult;
```

Checks:

1. `rows`: `envelopes.length ≥ 1` → else `TEST BUG`.
2. `drain`: `drained` → else `PRODUCT BUG: pending jobs after 30000 ms drain (N envelopes)`; `stuckJobs == 0` on every row.
3. `sealed-once`: every `COMPLETED` envelope has `sealJobs == 1` and `completedAudit == 1`. `sealJobs == 0` → `PRODUCT BUG: completed envelope never sealed`. `sealJobs > 1` → **not a violation**: `knownBugs["P6-OBS-DOC-002"] += 1` and, when `sequentialCompletions`, `unexpected.push("double seal with sequential completions")`.
4. `client-matches-db`: when `clientCompleted` is given, the number of `COMPLETED` envelopes equals it → else `PRODUCT BUG`.
5. `no-failed-seal`: no envelope in a non-`COMPLETED` terminal state that the client believes completed (covered by 4).
   Leak: the case's cleanup deletes the run's envelopes through `/api/v2/envelope/delete` (probe: all `deleted live envelopes N of N`), then `leakCheck` and `LIVE_ENVELOPE_LEAK_SQL` from `src/documenso/oracle.ts`. Documenso keeps soft-deleted completed envelopes as residue (reported, not asserted: Phase 1 plan D24).

### 6.6 The stage (`src/load/reconcile/index.ts`)

```ts
export const reconcileStage: Stage = async (ctx) => {
  const cfg = ctx.config.audit as AuditStageConfig | undefined;
  if (cfg === undefined)
    return { ok: true, reasons: [], data: { skipped: "case has no product audit (stub)" } }; // stub cases only
  const pool = createReadOnlyPool(urlFor(cfg.product));
  try {
    const summary = parseK6Summary(readJson(ctx.k6[0].summaryPath));
    const result = await reconcile(cfg, pool, { clientCount: clientCounter(cfg.product, summary) });
    writeFileSync(join(ctx.outDir, "audit.json"), JSON.stringify(result, null, 2));
    const hits = findHits(JSON.stringify(result)); // scripts/evidence-token-scan.mjs
    if (hits.length > 0)
      return {
        ok: false,
        kind: "TEST BUG",
        reasons: ["audit.json matched a token pattern; not kept"],
      };
    const bad = result.violations;
    const surprises = result.unexpected; // owner decision Q1: a known bug where it should not occur fails the run
    return {
      ok: bad.length === 0 && surprises.length === 0,
      kind:
        bad.some((v) => v.kind === "PRODUCT BUG") || surprises.length
          ? "PRODUCT BUG"
          : bad.length
            ? "TEST BUG"
            : undefined,
      reasons: [
        ...bad.map((v) => `${v.kind}: ${v.text}`),
        ...surprises.map((s) => `PRODUCT BUG (SUSPECTED, unexpected known bug): ${s}`),
      ],
      data: {
        audit: "audit.json",
        rowsSeen: result.rowsSeen,
        knownBugs: result.knownBugs,
        unexpected: result.unexpected,
        pending: result.pending,
      },
    };
  } finally {
    await closePool(pool);
  }
};
export async function reconcile(
  cfg: AuditStageConfig,
  pool: pg.Pool,
  counters: { clientCount?: number },
): Promise<AuditResult>;
```

- `composeStages` (NEW in `src/load/stages.ts`):

```ts
/** Runs stages in order. Always runs all of them; ok = every stage ok; kind = the first failing stage's kind; data and reasons are merged. */
export function composeStages(...stages: Stage[]): Stage {
  return async (ctx) => {
    const out: StageResult = { ok: true, reasons: [], data: {} };
    for (const stage of stages) {
      const r = await stage(ctx);
      if (!r.ok && out.ok) {
        out.ok = false;
        out.kind = r.kind;
      }
      out.reasons.push(...r.reasons);
      Object.assign(out.data!, r.data ?? {});
    }
    return out;
  };
}
```

- `urlFor`: `medusaDatabaseUrlFromEnv()`, `calDatabaseUrlFromEnv()`, `documensoDatabaseUrlFromEnv()` (all on `main`).
- A violation of kind `PRODUCT BUG` makes the run `FAIL` through `evaluateVerdict` (Task 3: a stage result of kind `PRODUCT BUG`), with the audit lines as `reasons`. An `unexpected` entry (a known bug seen where it should not occur, e.g. a Documenso double seal with sequential completions) also makes the run `FAIL`, as `PRODUCT BUG (SUSPECTED)`: the owner labels it after rule 13 repeats. Plain `knownBugs` counts never fail the run. `knownBugs`, `unexpected` and `pending` are copied into `verdict.json` under `audit` and shown in the job summary table (a "known bugs" column), so a known bug is always visible.
- Task 4's validity runs before this stage and never reads its output; INVALID cannot hide a violation, and a violation cannot be turned into INVALID (Task 3 precedence).
- The k6 summary's custom counter names are fixed here for Tasks 7 to 10: Cal `p6_bookings_accepted`, Medusa `p6_orders`, Documenso `p6_docs_completed` (each a k6 `Counter`).

### 6.7 `P6-X-LOAD-005` itself

No new k6 script: the case is "every LOAD case's audit". Its evidence is (a) the unit tests with a clean and a violating snapshot per product (this task, no product needed), and (b) the first product run in Task 7, whose `audit.json` is the live proof. Until Task 7 the case is `unit-evidenced` only; the roadmap says the same ("CI change: none on its own").

## 7. Oracles and assertions

| Product   | Invariant (read-only)                                                                    | SQL / oracle                                                                                    | PRODUCT BUG when                                  |
| --------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Cal       | no overlapping accepted pair among the run's bookings                                    | `OVERLAP_PAIRS_SQL` via `readOverlapPairs`                                                      | never a violation: counted under `P6-OBS-CAL-002` |
| Cal       | DB bookings equal what the client was told                                               | `CASE_LIVE_BOOKINGS_SQL` via `caseLiveBookings` vs `p6_bookings_accepted`                       | counts differ                                     |
| Medusa    | orders ≤ stock; reservations = orders = `reserved`; available ≥ 0                        | `readOversellSnapshot` (`ORDERS_FOR_VARIANT_SQL`, `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`) | any inequality                                    |
| Medusa    | balances: captured ≤ authorised, refunded ≤ captured, one payment per order              | the §3.1 SQL, `checkCaptureCap`, `checkRefundCap`                                               | any inequality                                    |
| Medusa    | no order the client never saw                                                            | `LEAK_LIVE_ORDER_IDS_SQL` count vs `p6_orders`                                                  | never a violation: counted under `F-M2`           |
| Documenso | no pending job after drain; one seal and one `DOCUMENT_COMPLETED` audit row per document | the §3.1 SQL (`SEAL_JOBS_SQL` semantics, `DOCUMENT_COMPLETED_AUDIT_SQL`)                        | stuck jobs; 0 seals on a completed document       |
| Documenso | double seal                                                                              | same                                                                                            | never a violation: counted under `P6-OBS-DOC-002` |

All reads go through `createReadOnlyPool` (`default_transaction_read_only=on`) and `selectRows` (`assertSelectOnly`).
**PRODUCT BUG vs TEST BUG, with evidence.** Every `PRODUCT BUG` line carries counts and ids from the audit (`audit.json`). A `TEST BUG` is raised for: zero rows seen (a scoping mistake), a SQL error (`relation does not exist`), a missing counter that the case promised, `audit.json` matching a token pattern.
A product-bug claim is `SUSPECTED` until repeated runs reproduce it (rule 13); the runner records `FAIL` with the evidence, and the owner labels it. No `test.fail()` and no expected-failure verdict exists in this task: known bugs are reported in `knownBugs`, not asserted to fail.
Each audit asserts it saw at least one run-created row; there is no leak assertion that always reads 0 (the leak check is the case's cleanup, Task 7).

## 8. Data isolation, cleanup, leak check

- Scope is the run's prefix only: Cal `Attendee.email LIKE`, Medusa `order.email LIKE` + the case's own variant, Documenso `Envelope.title LIKE`. No global assertion on seed data (pending-job counts are joined to the run's envelopes).
- Cleanup is the case's `cleanup` stage (Tasks 7 to 10): sweep by prefix, then the product's existing `leakCheck`. Its lines go to `audit.leak` (kind `TEST BUG` when data of the run is left).
- The audit itself writes nothing to any database.

## 9. Token scan

New artefact: `audit.json` (counts, check names, ids; `AuditCheck.detail` is built from numbers). `reconcileStage` scans the serialized JSON with `findHits` before keeping it; the runner's `tokenScan` stage and the job step scan the run directory again before upload. Unit test: an `AuditResult` built from a fixture passes `findHits`; a deliberately token-shaped `detail` is refused.
No email, attendee address, document title, URL or uid is copied into the audit (the Cal `pairEvidence` text with uids is **not** used; only the count is).

## 10. CI

None on its own, as the roadmap says: the unit tests run inside `npm run check`; no `perf.yml` change, no job added, no new step (so no step cap or stop rule), no timeout touched. The first product run, and with it the first live `audit.json`, is Task 7's CI.
Budget (one convention for every Phase 3 plan, Task 3 §9): no job changes, so the estimates and the at-caps columns equal the Task 1 to 5 figures; the unit tests add about 1.5 s to `npm run check` (measured 3.6 s for 471 tests). Nothing to add to the worst-case tables.

## 11. Environment changes

None (Cursor Cloud and Claude Code cloud): no tool, host or setting.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-load-reconciliation origin/main` (after Tasks 3 and 4 are merged). Counts relative to B (B = count on main when the build starts; 656 today after Tasks 1 to 5).

| Step | Commit subject                                                              | `git add` paths                                                                                                                                          | `npm run check` expected |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 0    | `docs(plans): bring the phase 3 task 6 plan onto the build branch`          | `docs/plans/2026-10-24-p6-phase3-task6-load-reconciliation.md`                                                                                           | exit 0, B                |
| 1    | `feat(load): define the audit result and the cal reconciliation`            | `src/load/reconcile/types.ts src/load/reconcile/cal.ts tests/unit/reconcile-cal.test.ts`                                                                 | exit 0, **B + 7**        |
| 2    | `feat(load): reconcile medusa stock, reservations and balances after a run` | `src/load/reconcile/medusa.ts tests/unit/reconcile-medusa.test.ts`                                                                                       | exit 0, **B + 18**       |
| 3    | `feat(load): reconcile documenso seals and drain after a run`               | `src/load/reconcile/documenso.ts tests/unit/reconcile-documenso.test.ts`                                                                                 | exit 0, **B + 26**       |
| 4    | `feat(load): run the product audit in the reconcile stage`                  | `src/load/reconcile/index.ts src/load/stages.ts src/load/types.ts src/ci/load-table.ts tests/unit/reconcile-index.test.ts tests/unit/load-table.test.ts` | exit 0, **B + 33**       |
| 5    | `docs: explain what the post-load audit checks`                             | `README.md`                                                                                                                                              | exit 0, B + 33           |

New unit tests, by name (the 33):

- `reconcile-cal` (7): clean snapshot passes; an overlap pair goes to `knownBugs["P6-OBS-CAL-002"]` and is not a violation; client says 5 accepted, database holds 4 (PRODUCT BUG); database holds more than the client was told (PRODUCT BUG); a pending booking (PRODUCT BUG); zero rows (TEST BUG); both SQL strings pass `assertSelectOnly` and take the prefix as a parameter.
- `reconcile-medusa` (11): clean passes; oversold (orders above stock); reservation rows differ from orders; `inventory_level.reserved` differs from reservation rows; available negative; ghost order goes to `knownBugs["F-M2"]`; captured above authorised; refunded above captured; payments not one per order; zero rows (TEST BUG); the payment SQL passes `assertSelectOnly`.
- `reconcile-documenso` (8): clean passes; a stuck job after drain; a double seal goes to `knownBugs["P6-OBS-DOC-002"]` and, with sequential completions, to `unexpected`; a completed envelope with no seal (PRODUCT BUG); client completed count differs; zero rows (TEST BUG); `waitForDrain` returns as soon as the count is 0 (fake pool); `waitForDrain` times out and reports `drained: false`.
- `reconcile-index` (6): `composeStages` runs stages in order and merges their `data`; `composeStages` keeps going after a not-ok stage but reports the first failure kind; violations map to `kind: "PRODUCT BUG"` and `ok: false`; known bugs only keeps `ok: true` and copies them into `data`, while an `unexpected` entry gives `ok: false` with kind `PRODUCT BUG` (the same test, asserting both outcomes; the count is unchanged); `audit.json` with a token-shaped detail is refused; a case without `ctx.config.audit` is skipped. `load-table` (+1): the known-bugs column shows ids and counts.
  Sum: 7 + 11 + 8 + 6 + 1 = **33**. Cumulative: step 1 +7 → B+7; step 2 +11 → B+18; step 3 +8 → B+26; step 4 +7 → B+33.

After step 5: `git push -u origin feat/<build date>-p6-load-reconciliation`, `gh pr create` (rule A3), read CI once (rule 15). Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                                    | Mitigation                                                                                        |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1  | A known product bug drowns the audit                                    | counted separately under its id; never a violation; always shown in the summary                   |
| R2  | A scoping mistake makes the audit pass on nothing                       | `rowsSeen ≥ 1` per audit (TEST BUG otherwise); the client counters are compared with the database |
| R3  | Documenso drain makes the job long                                      | drain contract 30 s (worst measured 3 s); only the run's jobs are polled                          |
| R4  | A journey does not define its counter                                   | the comparison is skipped and listed under `pending`, never silently dropped                      |
| R5  | `F-M2` ghost orders are real under load and make the audit noisy        | counted, not failed; if the owner wants them to fail, flip one flag in `evaluateMedusaAudit` (Q2) |
| R6  | The money clause is vacuous for pure checkouts (captured 0, refunded 0) | stated in §3.2; it becomes active the day a journey captures or refunds                           |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                                    | Probe / grep shows                                     | Effect                          |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------- |
| C1  | "balances ≥ 0 ... pending if none exists (D7)"                                  | the Phase 2 money oracles are on `main` (§3.2)         | the clause is live, not pending |
| C2  | "`P6-OBS-CAL-002` ... a load audit that finds pairs reports them under that ID" | consistent; the plan makes it a count, not a violation | none                            |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-LOAD-015`: an audit of the audit: after a LOAD run, delete one run-created row from a throwaway copy of the snapshot and prove the audit fails (mutation test of the evaluators against real DB rows, not only fixtures).
- `P6-X-LOAD-016`: reconcile the Medusa cart table (`completed_at` set but no order) as a second ghost-order signal.

**Recorded follow-up (no new ID, a BACKLOG item).** When `F-M2` is fixed upstream, flip the `evaluateMedusaAudit` flag so ghost orders fail the run, and update the two unit tests that assert the count-only behaviour.

**Owner decisions (all four questions closed 2026-10-24).**

- **Q1 (closed: count only, but fail on `unexpected`).** Known-bug counts (`P6-OBS-CAL-002`, `P6-OBS-DOC-002`, `F-M2`) are reported but do not fail a LOAD run (proposed). Alternative: fail the run when a known bug appears at a rate above a recorded baseline. Which?
- **Q2 (closed: count `F-M2` until fixed upstream, then flip to fail).** `F-M2` ghost orders under load: count only (proposed) or fail?
- **Q3 (closed: accept 30 s).** Drain contract 30 s for the audit (Task 9 sets its own lag contract): accept?
- **Q4 (closed: accept).** Accept that `P6-X-LOAD-005` is unit-evidenced until Task 7 produces the first live `audit.json`?

## 14. Done when (roadmap, made measurable)

- [ ] Unit tests green with a clean and a violating snapshot per product: `npm run check` exit 0 with **B + 33** (689 on today's chain).
- [ ] The runner calls the audit in the `reconcile` slot and maps a `PRODUCT BUG` violation to a `FAIL` outcome with the evidence lines (`reconcile-index` tests).
- [ ] Known bugs are counted under their ids (`P6-OBS-CAL-002`, `P6-OBS-DOC-002`, `F-M2`) in `audit.json`, `verdict.json` and the job summary column.
- [ ] Each audit asserts at least one run-created row; scope is the run prefix only.
- [ ] `audit.json` passes the token scan; the `balances` clause uses the `main` money oracles (`pending` is empty).
- [ ] `npm run check` green; no CI file changed.

## 15. Rule 20 self-check

- (a) Done-when in §14; gap: the live `audit.json` arrives with Task 7 (Q4).
- (b) Existing names grepped at `5acd2a0`: every function and SQL constant listed in §4 (`src/oracles/pg.ts`, `src/cal/oracle.ts`, `src/medusa/oracle.ts`, `src/medusa/invariants.ts`, `src/medusa/money.ts`, `src/documenso/oracle.ts`, `src/documenso/invariants.ts`, `scripts/evidence-token-scan.mjs`).
  NEW: everything under `src/load/reconcile/` and the four test files.
- (c) CI time: no CI change (§10).
- (d) Skeletons: §6. Steps with `git add` paths, subjects and expected output: §12.
- (e) The owner's answers to Q1 to Q4 are recorded in §1 and §13.
