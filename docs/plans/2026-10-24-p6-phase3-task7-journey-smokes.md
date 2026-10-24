# P6 Phase 3 Task 7: journey smokes (`P6-CAL-LOAD-001`, `P6-MED-LOAD-001`, `P6-DOC-LOAD-001`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 7", D1, D5, D6, D9, D10, D11.

**Interfaces assumed from the other Phase 3 plans (pushed on `origin/plan/2026-10-24-p6-phase3-plans`).** They are the exact names of those plans; the build stops at §5 check 3 if the merged code differs, and every item here is marked _must match the Task N plan at build time_:

- Task 3 ([task3](2026-10-24-p6-phase3-task3-load-foundation.md) §6.2 to §6.4): `LoadCase`, `LoadProfile`, `K6RunSpec`, `LoadContext`, `Stage`, `StageResult`, `runLoad`, `defaultStages`, `runK6`, `parseK6Summary`, `caseDataPrefix`, `iterationId`, `attendeeEmail`, `openModelScenario`, `standardOptions`, `preAllocatedVUs`, `runJourney`, `loadLoadConfig`, `request`, `expectStatuses`, `EXIT_CODES`, `loadRepoEnv`, `.k6-version` 2.3.0.
- Task 4 ([task4](2026-10-24-p6-phase3-task4-load-validity.md) §6.6): `READINESS`, `checkReadiness`, `raceLeakFindings` (the preflight); `judgeValidity`, `RunMeta`.
- Task 5 ([task5](2026-10-24-p6-phase3-task5-load-telemetry.md) §6.4): the `samplerStart`/`samplerStop` stages and `resolveAppProcess`.
- Task 6 ([task6](2026-10-24-p6-phase3-task6-load-reconciliation.md) §6.2 and §6.6): `AuditStageConfig`, `reconcileStage`, and the counter names `p6_bookings_accepted`, `p6_orders`, `p6_docs_completed`.
- One small additive change this plan makes to Task 3's contract: `LoadContext.secrets: Record<string, string>` (in memory only; `runK6` forwards the values of `K6RunSpec.secretEnv` names from `{ ...ctx.env, ...ctx.secrets }`; never serialised). Needed because Documenso's API token is minted by setup (§6.6).

## 1. Header

- **Task.** Phase 3 Task 7. Cases: `P6-CAL-LOAD-001`, `P6-MED-LOAD-001`, `P6-DOC-LOAD-001` (all "—" in the roadmap Pri; this plan proposes P1).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-journey-smokes`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3, 4, 5, 6 merged.
- **Harness pin assumed.** `v0.2.12` today; Task 1 may bump it (the Cal bridge stays until Task 1 part B).
- **Environment change.** None beyond Task 3's k6 pin (§11).
- **Unit tests.** B = count on main when the build starts (today's chain: 688 after Tasks 1 to 6). This plan adds **+18** (§12); expected B + 18 (**706** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 556 -> T4 599 -> T5 655 -> T6 688 -> T7 706 -> T8 723 -> T9 747 -> T10 781.
- **Owner decisions taken (2026-10-24, recorded, not open).** **D5 amended: the Medusa LOAD steps run in a new job `medusa-load` (`timeout-minutes: 45`), because `medusa-smoke` has no room.** Q2 accept the rates, pending three dispatch runs on the runner. Q3 priority P1. Q4 accept `LoadContext.secrets`. All closed in §13.
- **Stop for owner review.** Yes (rule 10): `perf.yml` changes (smokes retired, LOAD steps and a job added), `AGENTS.md` and README change; the D5 amendment for Medusa is an owner decision already taken (above).

## 2. What it proves

- **A real business journey completes correctly under a small fixed load, and the books agree afterwards.** Cal: look up the schedule, book a free slot, the booking is ACCEPTED in the database. Medusa: browse, build a cart, check out, one order per iteration, stock down by one per order. Documenso: create a document, distribute it, both recipients sign, the envelope is COMPLETED and sealed once.
- **Finance and healthcare.** The smoke a payments team or a patient-scheduling team runs before any capacity test: the happy path works at a trickle, with the audit of Task 6 and the validity verdict of Task 4 attached. It replaces the health smokes, which proved only that a route answers.

- **What the retired health smokes covered, and why no coverage is lost.** `medusa-order-races` and `medusa-cancel-extras` get **no** readiness preflight and no LOAD step: their race specs already fail on product errors (a 5xx or an unreachable store is a TEST BUG/ENV stop before the first trial), `up:medusa` waits for readiness before the race step starts, and the only extra thing the health smoke proved there, that k6 can reach the product from the runner, survives in `medusa-load` (its preflight and LOAD step use k6 against the same stack). Cal and Documenso get the preflight inside their LOAD steps (Task 4 `READINESS`).

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3 and v24.21.0, 4 vCPU, 16 GB), k6 2.3.0. Timings are **VM, proof only**; CI numbers come from §10. Products were started with `npm run up:<product>` and stopped with `down`. The k6 journeys below are throwaway prototypes (`/tmp/s/probe/{med,cal,doc}-journey.js` with Node orchestrators); the skeletons in §6 are their cleaned-up form on the Task 3 library.

### 3.1 Cal: the schedule route, the booking route, slot supply (roadmap probe item 1)

`src/cal/api.ts` already books through `POST /api/book/event` and reads slots through `GET /api/trpc/slots/getSchedule?input=<url-encoded JSON>` (`getFreeSlots`); the roadmap's "slots route is unverified" is settled: both exist on `CAL_REF c2b7ac44` and the probe used them from k6.

```text
getSchedule 28 days (eventTypeId 3, host "pro", slug "30min", timeZone UTC)   200, 320 slots, first 2026-10-26T09:00:00Z, last 2026-11-20T16:30:00Z, 338 ms (cold); 7-day windows 48 to 86 ms
POST /api/book/event (body = bookingBody(...) of src/cal/payloads.ts)           200, body.status "ACCEPTED", 111 to 243 ms (steady about 115 ms)
k6 journey (getSchedule -> pick slot[iterationInTest] -> book), constant-arrival-rate 2 per second, 20 s:
  iterations 41, dropped 0, vus_max 10, accepted 41, checks 82 passes / 0 fails, http_req_failed 0
  iteration duration median 165 ms, p95 221 ms, max 663 ms; http median 95 ms, p95 142 ms
  database (prefix-scoped): live bookings 41, statuses ["accepted"], overlap pairs 0
k6 journey at 10 per second, 15 s:  iterations 144, dropped 7, iteration median 1258 ms   -> past the knee (not used)
cleanup: 144 cancellations through cancelBooking in 7.6 s (about 53 ms each); leak check empty
```

Slot supply: **320 slots per 28-day window** at `pro/30min`. The journey needs `rate × duration` distinct slots (60 at 2 per second for 30 s, a fifth of the supply), assigned by the scenario's global iteration counter (`exec.scenario.iterationInTest` → slot index), so two iterations never book the same slot. The window length is `ceil(planned / 11.4) + 3` days (11.4 slots per day), written into the config by setup. Cancelled bookings free their slots again (Phase 1 allocator behaviour).
Environment noise seen in `cal-web.log` during these bookings: `ECONNREFUSED 127.0.0.1:1025` (no mail catcher) and `createMeeting failed … daily-video`: known, not failures (Task 5 §3.6).

### 3.2 Medusa: the browse, cart and complete calls (probe item 2)

Phase 1 does these from Node (`src/medusa/store.ts` `prepareReadyCart`, `completeCart`); the same nine calls from k6, with the publishable key header:

```text
GET  /store/products?limit=4                                  200
POST /store/carts {region_id, email, sales_channel_id}        200  cart.id
POST /store/carts/:id/line-items {variant_id, quantity:1}     200   (400 {"code":"insufficient_inventory","type":"not_allowed","message":"Some variant does not have the required inventory"} when stock is gone)
POST /store/carts/:id {email, shipping_address, billing_address}                200
GET  /store/shipping-options?cart_id=:id                      200  pick name "Standard Shipping"
POST /store/carts/:id/shipping-methods {option_id}            200
POST /store/payment-collections {cart_id}                     200  payment_collection.id
POST /store/payment-collections/:id/payment-sessions {provider_id:"pp_system_default"}   200
POST /store/carts/:id/complete                                200 {"type":"order",...}  (400 {"type":"not_allowed","message":"Not enough stock available for item iitem_… at location sloc_…"} when the last unit is taken in between)
```

Rate probe (variant with stock S, one `constant-arrival-rate` scenario, expected statuses 2xx and 400, `vus` = peak VUs in use):

| Rate (journeys/s) | Duration | Iterations | `dropped_iterations` | Iteration median / p95 | Orders (DB) | Runner CPU busy (avg / max)                                  |
| ----------------- | -------- | ---------- | -------------------- | ---------------------- | ----------- | ------------------------------------------------------------ |
| 1                 | 30 s     | 30 (S 25)  | **0**                | 1.5 s / 1.9 s          | 25 = S      | **38.6 % / 47.4 %**; k6 0.018 cores; MemAvailable min 90.6 % |
| 1                 | 30 s     | 31 (S 15)  | **0**                | (peak `vus` 1)         | 15 = S      | 24.1 % / 40.3 %                                              |
| 2                 | 20 s     | 36         | **4**                | 13.4 s / 15.8 s        | 25 = S      | past the knee                                                |
| 3                 | 20 s     | 45         | **16**               | 21.2 s / 23.1 s        | 30 = S      | far past the knee                                            |

So on this VM the Medusa journey is clean at **1 per second** and drops iterations from 2 per second; correctness held even there (orders = S, no 5xx), but a run with drops is INVALID (Task 4). **Fixed rate for `P6-MED-LOAD-001`: 1 journey per second** (half of the lowest rate that dropped), nine requests per iteration. CI recomputes this: build-time probe must confirm that three dispatch runs show `dropped_iterations` 0 at 1 per second on the runner; if not, the rate goes to 0.5 per second (a plan-recorded change, not a threshold change).
Database after the 1-per-second run (S = 25): `orderCount 25`, `orderQty 25`, `reservationQty 25`, `stocked 25`, `reserved 25`, orders by email prefix 25 (status `pending`), 25 payments (`amount=1010 captured=0 refunded=0`), payment collections `authorized` ×25, no order without a payment collection.
Cleanup costs: setup (admin login, seed check, product creation) **5.0 s**; sweeping 15 to 21 orders with `cancelAndArchive` **8.0 to 9.6 s** (about 0.45 s per order); deleting 31 customers by the prefix **0.5 s** (admin `GET /admin/customers?q=<prefix>&limit=100` then `DELETE /admin/customers/:id`). Without the customer sweep the existing `leakCheck` reports `leak customers email LIKE <prefix>` (checked: so the check is not vacuous).

### 3.3 Documenso: create, distribute, sign (probe item 3)

With a verified user and an API token minted by the runner (`signUpVerifiedUser`, `createApiToken` of `src/documenso/account.ts`; 0.45 to 0.85 s), the k6 journey makes the same calls as `prepareDocument` in `src/documenso/run-case.ts`:

```text
POST /api/v2/envelope/create  (multipart: payload {"title","type":"DOCUMENT"} + files = the fork's assets/example.pdf)     200 {"id":"envelope_…"}
POST /api/v2/envelope/recipient/create-many {envelopeId, data:[2 recipients]}                                              200 data[].id
GET  /api/v2/envelope/:id                                                                                                  200 envelopeItems[0].id, secondaryId "document_<n>"
POST /api/v2/envelope/field/create-many {envelopeId, data:[SIGNATURE per recipient]}                                       200 data[].id, recipientId
POST /api/v2/envelope/distribute {envelopeId}                                                                              200 recipients[].signingUrl  -> token = last path segment (a secret)
POST /api/trpc/field.signFieldWithToken        {json:{token,fieldId,value,isBase64:false}}   per recipient                 200
POST /api/trpc/recipient.completeDocumentWithToken {json:{token,documentId}}                  per recipient                 200  result.data.json.status "SIGNED"
```

The PDF is read once in the init context: `open(cfg.pdfPath, "b")` with the path from the config (`$PRODUCTS_ROOT/documenso/assets/example.pdf`); the upload is `http.file(PDF, "example.pdf", "application/pdf")`. Authorization header `Bearer <API token>` comes from the environment (`DOCUMENSO_API_TOKEN`), never from a file.
Runs (two recipients per document, 20 s each, `constant-arrival-rate`):

| Rate (documents/s) | Documents | `dropped_iterations` | Iteration median / p95 | Envelopes `COMPLETED` | Webhook calls `SUCCESS` (receiver deliveries) | Drain after k6 |
| ------------------ | --------- | -------------------- | ---------------------- | --------------------- | --------------------------------------------- | -------------- |
| 0.5                | 10        | 0                    | (0.7 s)                | 10                    | 10 (10)                                       | ≤ 2 s          |
| 1                  | 21        | **0**                | 0.69 s / 0.78 s        | 21                    | 21 (21)                                       | ≤ 2 s          |
| 2                  | 41        | **0**                | 0.84 s / 0.94 s        | 41                    | 41 (41)                                       | ≤ 2 s          |
| 5                  | 85        | **15**               | 4.7 s / 6.1 s          | 85                    | 85 (85)                                       | ≈ 3 s          |
| 10                 | 94        | **106**              | 7.5 s / 8.8 s          | 94                    | 94 (94)                                       | ≈ 3 s          |

All `checks` passed (765 of 765 at 5 per second), `http_req_failed` 0, in every run. **Fixed rate for `P6-DOC-LOAD-001`: 1 document per second** (a fifth of the lowest dropping rate, 5). The in-process job runner competes with request handling: the iteration time grows from 0.85 s at 2 per second to 4.7 s at 5 per second while peak PROCESSING jobs go from 3 to 46 (a finding for Task 9, not a test bug).
Database after each run (prefix-scoped, 258 envelopes in total): `COMPLETED seal=1 stuck=0 audit=1` for all 258. Mail: Inbucket answers 200; messages carry `date` (ISO with nanoseconds) and `posix-millis`.
k6 2.3.0 ran this journey 6 times without a script change (the Documenso **health** smoke on 2.3.0 is covered by the same host and routes: `GET /signin` 200 in 0.027 s, `GET /api/auth/csrf` 200 in 0.003 s; the smoke script itself on 2.3.0: build-time probe must confirm).

### 3.4 What each fixed rate decided, and the job time added (probe item 4)

| Case              | Rate | PR profile | Full profile | Planned iterations (full) | Slots / stock               | Step time on the VM (full): setup + k6 + audit + cleanup + scan                          |
| ----------------- | ---- | ---------- | ------------ | ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `P6-CAL-LOAD-001` | 2 /s | 10 s       | 30 s         | 60                        | 60 of 320 slots per 28 days | 2 + 30 + 1 + 3.2 + 5 ≈ **41 s**                                                          |
| `P6-MED-LOAD-001` | 1 /s | 10 s       | 30 s         | 30                        | S = planned + 20            | 5 + 30 + 1 + 14 + 0.5 + 5 ≈ **56 s**                                                     |
| `P6-DOC-LOAD-001` | 1 /s | 10 s       | 30 s         | 30                        | no supply limit             | 1 + 30 + 3 (drain) + 1 + 5 (30 envelope deletes, webhook, token, account) + 5 ≈ **45 s** |

### 3.5 Facts that change the roadmap text

- The retired smoke steps are **five**, not three: `k6 smoke (GET /health)` exists in `medusa-smoke` (line 156), `medusa-order-races` (352) and `medusa-cancel-extras` (528), plus `k6 smoke (GET /pro/30min)` in `cal-smoke` (722) and the Documenso one in `documenso-smoke` (1175). Their artefacts `k6-summary-medusa-health`, `k6-summary-medusa-budget-health`, `k6-summary-medusa-cancel-extras-health`, `k6-summary-cal-health`, `k6-summary-documenso-health` go with them. Twenty's smoke (`smoke:twenty`, `k6/smoke/twenty-health.js`, `twenty-smoke`) is not in D10's list and stays (Phase 5).
- `medusa-order-races` and `medusa-cancel-extras` use k6 **only** for that smoke; after retiring it their `Install k6` steps (Task 3) have no consumer and are deleted there. `medusa-smoke` keeps the install because `npm run check` runs `k6 inspect` in it.
- The retired scripts: `k6/smoke/medusa-health.js`, `cal-health.js`, `documenso-health.js` (and `package.json` `smoke:medusa`, `smoke:cal`, `smoke:documenso`). `k6/probe/health-load.js` stays (cited by the Phase 0 feasibility report).

### 3.6 What the probe could not confirm ("build-time probe must confirm")

1. The three fixed rates on the GitHub runner (three dispatch runs, `dropped_iterations` 0 and VALID verdicts).
2. The Documenso health smoke script on k6 2.3.0 (the journey ran).
3. The step times of §3.4 on the runner, and the Medusa order-sweep time at 30 orders (about 14 s on the VM).
4. The `ImageOS`/`ImageVersion` variables (Task 4 §3.3) for the run metadata.

## 4. Depends on earlier plans

The interface list at the top of this file, plus from `main` (grepped): `src/cal/{api,oracle,payloads,session}.ts` (`resolveHostSetup`, `caseLiveBookings`, `cancelBooking`, `leakCheck`, `bookingBody`), `src/medusa/{admin,store,oracle,payloads}.ts` (`seedAndLogin`, `loadCatalog`, `createStockedVariant`,
`cancelAndArchive`, `deleteProduct`, `LEAK_LIVE_ORDER_IDS_SQL`, `leakCheck`, `casePrefix`, `prefixedEmail`), `src/documenso/{account,api,env,inbucket,run-case}.ts` (`signUpVerifiedUser`, `createApiToken`, `startRun`, `endRun`, `leakCounts`, `deleteEnvelope`, `readFixturePdf`'s path rule),
`src/receivers/webhook-receiver.ts` (`startWebhookReceiver`), `src/races/prefix.ts` (`p6RunPrefix`), `src/oracles/pg.ts`. Phase 2: the Medusa money oracles (Task 6), `rerun-on-spread` is unused here.

## 5. Build-time recheck

| #   | Check                          | Command                                                                                                                                                    | Expected                                                                                |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Base                           | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                              | descendant of `5acd2a0`                                                                 |
| 2   | Baseline                       | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                        | exit 0, `# tests` = B (688 once Tasks 1 to 6 are merged)                                |
| 3   | Earlier tasks merged, names ok | `grep -n "export async function runLoad\|export const READINESS\|export const reconcileStage\|export function startSampler" src/load/*.ts src/load/*/*.ts` | all four found; if a signature differs, stop and report                                 |
| 4   | k6 pin                         | `k6 version; cat .k6-version`                                                                                                                              | `k6 v2.3.0`, `2.3.0`                                                                    |
| 5   | Smoke steps to retire          | `grep -n "npm run smoke:" .github/workflows/perf.yml`                                                                                                      | medusa ×3, cal ×1, documenso ×1, twenty ×1 (lines may have moved)                       |
| 6   | Cal slots                      | with Cal up: the `getSchedule` call of §3.1 for 28 days                                                                                                    | HTTP 200 and ≥ 300 slots                                                                |
| 7   | Rates                          | the first CI runs of the three cases (PR profile)                                                                                                          | `dropped_iterations` 0, validity VALID; otherwise lower the rate per §3.2 and record it |
| 8   | Documenso Node                 | `ls /opt/node24/bin/node` (cloud) and the CI step `Documenso Node 24`                                                                                      | present; `scripts/harness.mjs` picks it for Documenso                                   |

## 6. Design

### 6.1 File tree

```text
k6/journeys/cal-book.js                NEW     steps getSchedule, book; exports runCalBook(cfg)
k6/journeys/med-checkout.js            NEW     steps browse, cart, line item, address, shipping, payment, complete; exports runMedCheckout(cfg, opts)
k6/journeys/doc-sign.js                NEW     steps create, recipients, envelope, fields, distribute, sign+complete per recipient; exports runDocSign(cfg)
k6/cases/cal-load-001.js               NEW     scenario + thresholds; default function calls the journey
k6/cases/med-load-001.js               NEW
k6/cases/doc-load-001.js               NEW
k6/cases/cal-load-001.example.json     NEW     input for the standalone command (D6)
k6/cases/med-load-001.example.json     NEW
k6/cases/doc-load-001.example.json     NEW
k6/smoke/medusa-health.js cal-health.js documenso-health.js        DELETED (D10); k6/smoke/twenty-health.js and k6/probe/health-load.js stay
src/load/products/cal.ts               NEW     calSetup, calCleanup
src/load/products/medusa.ts            NEW     medusaSetup, medusaCleanup, deleteCustomersByPrefix
src/load/products/documenso.ts         NEW     documensoSetup, documensoCleanup
src/load/cases.ts                      CHANGED + the three cases
src/load/types.ts                      CHANGED + LoadContext.secrets
src/load/k6-process.ts                 CHANGED forwards secretEnv from { ...env, ...secrets }
package.json                           CHANGED smoke:medusa|cal|documenso removed; load:cal, load:medusa, load:documenso added
.github/workflows/perf.yml             CHANGED five smoke steps and their uploads removed; LOAD steps; new job medusa-load (D5 amended)
AGENTS.md, README.md                   CHANGED (D10)
tests/unit/load-products-*.test.ts, load-journey-cases.test.ts     NEW
```

`k6/lib` (Task 3) is imported by relative path from the journeys. Nothing in `k6/` imports from `src/` (k6 cannot run TypeScript from `src/` and the oracle stays in TypeScript, D6); the cleaned journeys below duplicate request bodies from `src/*/payloads.ts` on purpose, and a unit test (§12) compares the two so they cannot drift.

### 6.2 Medusa journey (`k6/journeys/med-checkout.js`, from the working prototype)

```js
import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { iterationId } from "../lib/pure/prefix.js";
import { request, expectStatuses } from "../lib/http.js";

export const ordersCounter = new Counter("p6_orders"); // names fixed by the Task 6 plan
const refusedAtLineItem = new Counter("p6_refused_at_line_item");
const refusedAtComplete = new Counter("p6_refused_at_complete");
const otherStatus = new Counter("p6_other_status");

const ADDRESS = {
  first_name: "P6",
  last_name: "QA",
  address_1: "Teststr 1",
  city: "Berlin",
  country_code: "de",
  postal_code: "10115",
}; // = STORE_ADDRESS in src/medusa/payloads.ts

/** cfg: { baseUrl, publishableKey, regionId, salesChannelId, variantId, prefix } (written by the runner's setup, no secrets). */
export function runMedCheckout(cfg, opts = {}) {
  expectStatuses(400); // a clean refusal is not a failed request (D9)
  const email = `${iterationId(cfg.prefix, exec.scenario.iterationInTest)}@qa.local`; // lower-case, [a-z0-9-] prefix, unique per iteration
  const H = { "Content-Type": "application/json", "x-publishable-api-key": cfg.publishableKey };
  const call = (method, path, body, name) =>
    request(method, `${cfg.baseUrl}/store${path}`, name, body, { headers: H, timeout: "30s" });
  const steps = [
    {
      name: "browse",
      run: () => ({
        ok: call("GET", "/products?limit=4", undefined, "GET /store/products").status === 200,
      }),
    },
    {
      name: "cart",
      run: () => {
        const r = call(
          "POST",
          "/carts",
          { region_id: cfg.regionId, email, sales_channel_id: cfg.salesChannelId },
          "POST /store/carts",
        );
        return { ok: r.status === 200, data: { cartId: r.json("cart.id") } };
      },
    },
    {
      name: "line item",
      run: (s) => {
        const r = call(
          "POST",
          `/carts/${s.cartId}/line-items`,
          { variant_id: cfg.variantId, quantity: 1 },
          "POST /store/carts/:id/line-items",
        );
        if (r.status === 400) {
          refusedAtLineItem.add(1);
          return { ok: true, stop: true };
        } // out of stock: a clean end of the journey, not a failure
        return { ok: r.status === 200 };
      },
    },
    {
      name: "address",
      run: (s) => ({
        ok:
          call(
            "POST",
            `/carts/${s.cartId}`,
            { email, shipping_address: ADDRESS, billing_address: ADDRESS },
            "POST /store/carts/:id",
          ).status === 200,
      }),
    },
    {
      name: "shipping options",
      run: (s) => {
        const r = call(
          "GET",
          `/shipping-options?cart_id=${s.cartId}`,
          undefined,
          "GET /store/shipping-options",
        );
        const o =
          r.status === 200 &&
          r.json("shipping_options").find((x) => x.name === "Standard Shipping");
        return { ok: Boolean(o), data: { optionId: o && o.id } };
      },
    },
    {
      name: "shipping method",
      run: (s) => ({
        ok:
          call(
            "POST",
            `/carts/${s.cartId}/shipping-methods`,
            { option_id: s.optionId },
            "POST /store/carts/:id/shipping-methods",
          ).status === 200,
      }),
    },
    {
      name: "payment collection",
      run: (s) => {
        const r = call(
          "POST",
          "/payment-collections",
          { cart_id: s.cartId },
          "POST /store/payment-collections",
        );
        return { ok: r.status === 200, data: { pcId: r.json("payment_collection.id") } };
      },
    },
    {
      name: "payment session",
      run: (s) => ({
        ok:
          call(
            "POST",
            `/payment-collections/${s.pcId}/payment-sessions`,
            { provider_id: "pp_system_default" },
            "POST /store/payment-collections/:id/payment-sessions",
          ).status === 200,
      }),
    },
    {
      name: "complete",
      run: (s) => {
        const r = call(
          "POST",
          `/carts/${s.cartId}/complete`,
          undefined,
          "POST /store/carts/:id/complete",
        );
        if (r.status === 200 && r.json("type") === "order") {
          ordersCounter.add(1);
          return { ok: true };
        }
        if (r.status === 400) {
          refusedAtComplete.add(1);
          return { ok: true };
        } // the last unit was taken between add-to-cart and complete
        otherStatus.add(1);
        return { ok: false };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (n, ok) => check(null, { [n]: () => ok }), sleep, now: Date.now },
  });
}
```

`runJourney` (Task 3) is extended by one rule used here: a step result with `stop: true` ends the journey as completed (not failed). That is a Task 3 pure-function change owned by this plan: one added branch and one added unit test (§12, counted).
Case script `k6/cases/med-load-001.js`:

```js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
const cfg = loadLoadConfig([
  "baseUrl",
  "publishableKey",
  "regionId",
  "salesChannelId",
  "variantId",
  "prefix",
  "rate",
  "durationSec",
  "maxLatencyMs",
]);
export const options = standardOptions({
  scenarios: {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      tags: { case: "P6-MED-LOAD-001", journey: "med-checkout" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // correctness only (D9)
});
export default function () {
  runMedCheckout(cfg);
}
```

### 6.3 Cal journey (`k6/journeys/cal-book.js`)

```js
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { iterationId, attendeeEmail } from "../lib/pure/prefix.js";
import { request } from "../lib/http.js";
export const acceptedCounter = new Counter("p6_bookings_accepted");
const DAY = 86400000;

/** cfg: { baseUrl, eventTypeId, eventTypeSlug, host, prefix, windowDays } */
export function runCalBook(cfg) {
  const n = exec.scenario.iterationInTest; // global, unique across VUs: the slot index
  const from = Math.floor(Date.now() / DAY) * DAY + 2 * DAY; // same rule as createSlotAllocator in src/cal/api.ts
  const input = {
    json: {
      eventTypeId: cfg.eventTypeId,
      startTime: new Date(from).toISOString(),
      endTime: new Date(from + cfg.windowDays * DAY).toISOString(),
      timeZone: "UTC",
      isTeamEvent: false,
      usernameList: [cfg.host],
      eventTypeSlug: cfg.eventTypeSlug,
      orgSlug: null,
    },
  };
  const steps = [
    {
      name: "getSchedule",
      run: () => {
        const r = request(
          "GET",
          `${cfg.baseUrl}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`,
          "GET getSchedule",
        );
        if (r.status !== 200) return { ok: false };
        const slots = Object.values(r.json("result.data.json.slots"))
          .flat()
          .map((s) => s.time)
          .sort();
        return { ok: slots.length > n, data: { start: slots[n] } };
      },
    }, // fewer slots than iterations = TEST BUG (supply)
    {
      name: "book",
      run: (s) => {
        const end = new Date(Date.parse(s.start) + 30 * 60000).toISOString();
        const body = {
          responses: {
            name: "P6 Load",
            email: attendeeEmail(cfg.prefix, `i${n}`),
            guests: [],
            location: { value: "integrations:daily", optionValue: "" },
          },
          user: cfg.host,
          start: s.start,
          end,
          eventTypeId: cfg.eventTypeId,
          eventTypeSlug: cfg.eventTypeSlug,
          timeZone: "UTC",
          language: "en",
          metadata: {},
          hasHashedBookingLink: false,
        }; // = bookingBody() of src/cal/payloads.ts
        const r = request("POST", `${cfg.baseUrl}/api/book/event`, "POST book", body, {
          headers: { "Content-Type": "application/json" },
        });
        const ok = r.status === 200 && r.json("status") === "ACCEPTED";
        if (ok) acceptedCounter.add(1);
        return { ok };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (nme, ok) => check(null, { [nme]: () => ok }), sleep: () => {}, now: Date.now },
  });
}
```

`attendeeEmail(prefix, leaf)` yields `<prefix>-i<n>@example.com`, which the audit's `Attendee.email LIKE '<prefix>%'` matches. The case script mirrors §6.2 with `scenario tags {case:"P6-CAL-LOAD-001", journey:"cal-book"}`, thresholds `checks == 1`, `http_req_failed == 0`.

### 6.4 Documenso journey (`k6/journeys/doc-sign.js`)

```js
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { iterationId } from "../lib/pure/prefix.js";
import { request } from "../lib/http.js";
export const completedCounter = new Counter("p6_docs_completed");
const TOKEN = __ENV.DOCUMENSO_API_TOKEN; // secret: environment only, never the config file, never logged
let PDF; // opened once per VU in init context by the case script: pdf = open(cfg.pdfPath, "b")

export function runDocSign(cfg, pdf) {
  const n = exec.scenario.iterationInTest;
  const A = { authorization: `Bearer ${TOKEN}` },
    J = { ...A, "content-type": "application/json" };
  const post = (path, body, name) =>
    request("POST", `${cfg.baseUrl}${path}`, name, body, { headers: J });
  const steps = [
    {
      name: "create",
      run: () => {
        const r = http.post(
          `${cfg.baseUrl}/api/v2/envelope/create`,
          {
            payload: JSON.stringify({
              title: `${iterationId(cfg.prefix, n)} journey`,
              type: "DOCUMENT",
            }),
            files: http.file(pdf, "example.pdf", "application/pdf"),
          },
          { headers: A, tags: { name: "POST envelope/create" } },
        );
        return { ok: r.status === 200, data: { envelopeId: r.json("id") } };
      },
    },
    {
      name: "recipients",
      run: (s) => {
        const r = post(
          "/api/v2/envelope/recipient/create-many",
          {
            envelopeId: s.envelopeId,
            data: [0, 1].map((i) => ({
              email: `${iterationId(cfg.prefix, n)}-r${i}@example.com`,
              name: `P6 Signer ${i}`,
              role: "SIGNER",
              accessAuth: [],
              actionAuth: [],
            })),
          },
          "POST recipient/create-many",
        );
        return { ok: r.status === 200, data: { recipientIds: r.json("data").map((x) => x.id) } };
      },
    },
    {
      name: "envelope",
      run: (s) => {
        const r = request(
          "GET",
          `${cfg.baseUrl}/api/v2/envelope/${s.envelopeId}`,
          "GET envelope",
          undefined,
          { headers: A },
        );
        const m = /^document_(\d+)$/.exec(r.json("secondaryId"));
        return {
          ok: r.status === 200 && Boolean(m),
          data: { itemId: r.json("envelopeItems.0.id"), documentId: Number(m && m[1]) },
        };
      },
    },
    {
      name: "fields",
      run: (s) => {
        const r = post(
          "/api/v2/envelope/field/create-many",
          {
            envelopeId: s.envelopeId,
            data: s.recipientIds.map((recipientId, i) => ({
              recipientId,
              envelopeItemId: s.itemId,
              type: "SIGNATURE",
              page: 1,
              positionX: 10,
              positionY: 10 + i * 20,
              width: 20,
              height: 5,
            })),
          },
          "POST field/create-many",
        );
        return { ok: r.status === 200, data: { fields: r.json("data") } };
      },
    },
    {
      name: "distribute",
      run: (s) => {
        const r = post(
          "/api/v2/envelope/distribute",
          { envelopeId: s.envelopeId },
          "POST envelope/distribute",
        );
        const tokens = {};
        if (r.status !== 200) return { ok: false, data: { tokens } };
        const recipients = r.json("recipients");
        if (!Array.isArray(recipients)) return { ok: false, data: { tokens } }; // malformed 200: a failed step, not a TypeError
        for (const rc of recipients) {
          const m = /\/sign\/([A-Za-z0-9_-]+)$/.exec(rc?.signingUrl ?? "");
          if (!m) return { ok: false, data: { tokens } };
          tokens[rc.id] = m[1];
        }
        return { ok: true, data: { tokens } };
      },
    },
    {
      name: "sign and complete",
      run: (s) => {
        let ok = true;
        s.recipientIds.forEach((rid, i) => {
          const f = s.fields.find((x) => x.recipientId === rid);
          ok =
            post(
              "/api/trpc/field.signFieldWithToken",
              {
                json: {
                  token: s.tokens[rid],
                  fieldId: f.id,
                  value: `P6 Signer ${i}`,
                  isBase64: false,
                },
              },
              "POST signFieldWithToken",
            ).status === 200 && ok;
          ok =
            post(
              "/api/trpc/recipient.completeDocumentWithToken",
              { json: { token: s.tokens[rid], documentId: s.documentId } },
              "POST completeDocumentWithToken",
            ).status === 200 && ok;
        });
        if (ok) completedCounter.add(1);
        return { ok };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (nme, ok) => check(null, { [nme]: () => ok }), sleep: () => {}, now: Date.now },
  });
}
```

(`let PDF;` in the skeleton is unused: remove it; the case script opens the file and passes the bytes.) Request bodies equal `recipientBodies`, `signatureFieldBodies`, `signFieldBody`, `completeBody` of `src/documenso/payloads.ts`; the two recipients complete **sequentially** in one iteration (the Phase 1 race is parallel, so `P6-OBS-DOC-002` must not appear; Task 6 flags it as unexpected).
The `url` system tag is dropped (Task 3), and every request has a fixed `name`, so the signing token in `/sign/<token>` and in the tRPC body never becomes a metric label.

### 6.5 Product setup, cleanup and the runner cases (`src/load/products/*.ts`, `src/load/cases.ts`)

```ts
// src/load/cases.ts (additions)
const FUNCTIONAL = "functional load, not capacity" as const;
export const CAL_LOAD_001: LoadCase = {
  id: "P6-CAL-LOAD-001",
  title: "Cal journey smoke: getSchedule, book",
  product: "cal",
  label: FUNCTIONAL,
  profiles: {
    pr: { rate: 2, durationSec: 10, maxLatencyMs: 1000 },
    full: { rate: 2, durationSec: 30, maxLatencyMs: 1000 },
  },
  runs: (ctx) => [{ label: "main", script: "k6/cases/cal-load-001.js", env: {} }], // inputs reach k6 through k6-config.json (ctx.config), Task 3 runK6
  stages: { setup: calSetup, cleanup: calCleanup },
};
export const MED_LOAD_001: LoadCase = {
  id: "P6-MED-LOAD-001",
  /* ... */ profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
  },
  stages: { setup: medusaSetup, cleanup: medusaCleanup },
};
export const DOC_LOAD_001: LoadCase = {
  id: "P6-DOC-LOAD-001",
  /* ... */ profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-001.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: { setup: documensoSetup, cleanup: documensoCleanup },
};
```

`maxLatencyMs` feeds the Little's-law sizing (`preAllocatedVUs`): journeys are far slower than one request (Medusa iteration p95 1.9 s, Documenso 0.8 s), so 4000 and 3000 ms give a generous pool (Medusa: ceil(1 × 4 × 1.25) = 5 VUs; probe peak `vus` was 1 to 3).

`calSetup(ctx)`: `loadRepoEnv`, `pool = createReadOnlyPool(calDatabaseUrlFromEnv())`, `{ userId, eventTypeId } = await resolveHostSetup(pool)` (TEST BUG if the seed changed), `dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id)`, `planned = round(rate × durationSec)`,
`windowDays = ceil(planned / 11.4) + 3`; `ctx.config = { baseUrl: calBaseUrlFromEnv(), eventTypeId, eventTypeSlug: "30min", host: "pro", prefix: dataPrefix, windowDays, rate, durationSec, maxLatencyMs }`; `ctx.config.audit = { product: "cal", userId, eventTypeId, prefixLike: likeLiteralPrefix(dataPrefix) }`. Returns `{ ok: true }`.
`calCleanup(ctx)`: `rows = await caseLiveBookings(pool, prefixLike)`; for each `uid`: `cancelBooking(uid)` (continue on error, collect `TEST BUG: cancel <id> failed`); `leakCheck(pool, prefixLike)` → findings; close the pool. **The sweep reads uids from the database, not from k6**: a client that timed out never learns its uid (probe: one booking was left when cleanup relied on returned uids).

`medusaSetup(ctx)`: `token = await seedAndLogin()`, `catalog = await loadCatalog(token)`, `S = planned + 20`, `stocked = await createStockedVariant({ token, catalog, prefix: dataPrefix, leaf: "load", s: S, onCreated: ... })` (ids stored for cleanup even on partial failure), `ctx.config = { baseUrl, publishableKey: catalog.publishableKey, regionId, salesChannelId, variantId, prefix: dataPrefix, rate, durationSec, maxLatencyMs }`;
the admin token goes to `ctx.secrets.MEDUSA_ADMIN_TOKEN` (never k6). `ctx.config.audit = { product: "medusa", prefixLike: `${dataPrefix}-%` ... , variantId, inventoryItemId, locationId, stock: S }`. `medusaCleanup`: orders by `LEAK_LIVE_ORDER_IDS_SQL` with the email prefix → `cancelAndArchive` each; `deleteProduct`; **`deleteCustomersByPrefix(token, prefix)`** (new, §3.2: list `q=<prefix>` pages of 100, delete those whose email starts with the prefix); `leakCheck(pool, likePrefix, [inventoryItemId])`.
`documensoSetup(ctx)`: `startRun({ baseUrl, inbucketUrl, runPrefix, pool, webhookHost })` of `src/documenso/run-case.ts` (it signs up the owner, mints the token and creates a webhook against a loopback receiver; Task 9 uses the receiver, this task only needs the token), `ctx.secrets.DOCUMENSO_API_TOKEN = run.apiToken`, `ctx.config = { baseUrl, prefix: dataPrefix, pdfPath: <PRODUCTS_ROOT>/documenso/assets/example.pdf, rate, durationSec, maxLatencyMs }`,
`ctx.config.audit = { product: "documenso", prefixLike: `${dataPrefix}%`, sequentialCompletions: true }`; the `RunContext` is kept in `ctx.handles.documensoRun` (Task 5 added `handles`). `documensoCleanup`: read the run's live envelope ids (`SELECT id FROM "Envelope" WHERE title LIKE $1 AND "deletedAt" IS NULL`), put them into `run.envelopeIds`, call `endRun(run, mailboxes)` (deletes envelopes, webhook, token, mailboxes, account, receiver), then `leakCounts(run, mailboxes)`.
Every cleanup step records failures as `TEST BUG: cleanup <step> failed: <message ≤ 200 chars>` and never throws (the existing `endRun` pattern).

Node version: Documenso code in the runner process runs under the Node that started `run-load.ts` (22.23); the **product** runs under Node 24 (`scripts/harness.mjs`). `startRun` and the API clients are plain `fetch` code, proven under 22 in the Phase 1 specs.

### 6.6 `package.json`, `AGENTS.md`, README (D10)

`package.json`: remove `smoke:medusa`, `smoke:cal`, `smoke:documenso`; add

```json
"load:cal": "node scripts/load/run-load.ts --case P6-CAL-LOAD-001",
"load:medusa": "node scripts/load/run-load.ts --case P6-MED-LOAD-001",
"load:documenso": "node scripts/load/run-load.ts --case P6-DOC-LOAD-001"
```

(`--profile pr|full`, default `full`; CI passes `pr` on pull requests.) `AGENTS.md` line 9: ``- Bring Medusa up with `npm run up:medusa`, run `npm run smoke:medusa`, and always finish with `` becomes ``- Bring Medusa up with `npm run up:medusa`, run `npm run load:medusa -- --profile pr`, and always finish with ``. README: "Run the smoke check locally" (line 12) is renamed "Run the journey smoke locally" with `npm run load:medusa -- --profile pr`; "Run Cal" (line 130) and "Run Documenso" (line 208) replace `npm run smoke:cal` / `npm run smoke:documenso` by `npm run load:cal -- --profile pr` / `npm run load:documenso -- --profile pr`;
each gets the standalone command (below) and the sentence "functional load, not capacity; numbers from a cloud VM are never published". Line 7 ("Phase 0 proved the harness and k6 smoke") stays.
Standalone (D6), Medusa: with a stack up and a stocked variant, `P6_LOAD_CONFIG=k6/cases/med-load-001.example.json k6 run k6/cases/med-load-001.js` where the example JSON lists `baseUrl`, `publishableKey` (placeholder), `regionId`, `salesChannelId`, `variantId`, `prefix`, `rate`, `durationSec`, `maxLatencyMs` (placeholders, no secrets); Documenso adds `DOCUMENSO_API_TOKEN=<token> ` in front of the command.

### 6.7 `perf.yml` (exact)

1. **Delete** the five smoke steps and their five `upload-artifact` steps (artefacts `k6-summary-*-health`): `k6 smoke (GET /health)` in `medusa-smoke`, `medusa-order-races`, `medusa-cancel-extras`; `k6 smoke (GET /pro/30min)` in `cal-smoke`; `k6 smoke (GET /signin, /api/auth/csrf)` in `documenso-smoke`. Delete the `Install k6` step in `medusa-order-races` and `medusa-cancel-extras` (no consumer left). Keep `twenty-smoke` untouched.
2. **`cal-smoke`**, after the last race step and before the job summary:

```yaml
- name: LOAD journey P6-CAL-LOAD-001 (functional load, not capacity)
  if: ${{ !cancelled() && steps.cal_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  timeout-minutes: ${{ github.event_name == 'pull_request' && 4 || 6 }}
  run: |
    set -euo pipefail
    status=0
    npm run load:cal -- --profile "${{ github.event_name == 'pull_request' && 'pr' || 'full' }}" || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::LOAD run INVALID; excluded from medians (P6-RULE-005)"; status=0; fi
    exit "$status"
```

plus, before the upload steps of that job, a token scan of `results/load` (`node scripts/evidence-token-scan.mjs results/load`, `timeout-minutes: 2`) and `upload-artifact` `load-cal` with path `results/load/` (the existing "Job summary" step already reads it, Task 4). 3. **`documenso-smoke`**: the same step for `P6-DOC-LOAD-001` after the races and the Documenso API step, before "Check Documenso artefacts for tokens" (which keeps its own greps; the new `results/load` scan is added next to it); `timeout-minutes` 3 on PRs and 4 otherwise (estimate 1.5, 80 % stop rule 3.2; one Documenso rule for all four Documenso LOAD steps of Tasks 7, 9 and 10); artefact `load-documenso`. 4. **Medusa (D5 amended, owner decision): a new job `medusa-load`** instead of a step in `medusa-smoke`: same checkout, pins, caches (restore only), pull, harness up as `medusa-order-races`; then the LOAD steps of Tasks 7, 8 and 10 (this plan adds only `P6-MED-LOAD-001`):

```yaml
medusa-load:
  name: medusa-load
  runs-on: ubuntu-24.04
  timeout-minutes: 45
  env: { ...the medusa-order-races env block... }
  steps:
    [
      checkout,
      Medusa fork checkout + verify,
      stub roots,
      setup-node,
      npm ci,
      install k6,
      pnpm,
      pnpm store restore,
      Medusa deps,
      build cache restore,
      admin password,
      pull,
      Start Medusa,
      LOAD P6-MED-LOAD-001 (timeout-minutes: PR 4 / main 6),
      token scan,
      upload load-medusa,
      Stop Medusa (always),
    ]
```

Every new step gets `timeout-minutes` (checkout 2, fork checkout 6, install k6 2, npm ci 5, deps 8, pull 6, start 10, scan 2, upload 3, stop 3). D5 as written (the same LOAD step inside `medusa-smoke`) was rejected by the owner: its budget is shown in §10 for the record. 5. Trial counts: not applicable (no races). PR profile 10 s, full profile 30 s, as in §3.4. The LOAD step runs on every event.

## 7. Oracles and assertions

Per-response contract (k6 `checks`, correctness only, D9) and the post-load audit (Task 6, run by the case's `reconcile` slot):

| Case              | k6 checks (rate == 1) and thresholds                                                                                        | Audit (Task 6)                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-CAL-LOAD-001` | `getSchedule` 200 with enough slots; `book` 200 and `status == "ACCEPTED"`; `http_req_failed == 0`                          | live bookings of the prefix equal `p6_bookings_accepted`; all `accepted`; overlap pairs 0 (else counted under `P6-OBS-CAL-002`); leak check empty                                   |
| `P6-MED-LOAD-001` | every step 200; `complete` is `200 type=order` (stock is `planned + 20`, so no refusal is expected); `http_req_failed == 0` | orders equal `p6_orders`; one order per iteration; `reserved` equals orders (stock down by exactly one per order); one payment per order, `captured − refunded ≥ 0`; no ghost order |
| `P6-DOC-LOAD-001` | every request 200; `completeDocumentWithToken` ×2 per document; `http_req_failed == 0`                                      | envelopes `COMPLETED` equal `p6_docs_completed`; one seal and one `DOCUMENT_COMPLETED` audit row each; no stuck job after drain; leak counts 0                                      |

The Medusa journey tolerates the clean 400 refusals (they are counted by `p6_refused_at_*`), but with `S = planned + 20` a refusal means the stock model is wrong, so the case also asserts `p6_refused_at_line_item + p6_refused_at_complete == 0` through the audit's `clientOrders`/`stock` comparison (`orders == iterations completed`).
**PRODUCT BUG vs TEST BUG.** A 5xx from a product or an audit violation is a PRODUCT BUG (evidence: the status counts of `k6-main-summary.json` and `audit.json`); a setup error (host seed changed, supply too small, product not ready, token not minted, cleanup failure) is TEST BUG or ENV and stops before the load. A run with `dropped_iterations` is INVALID (Task 4), not FAIL. No `test.fail()`, no skip, no loosened check; rates change only with new probe data.

## 8. Data isolation, cleanup, leak check

- Prefix: `caseDataPrefix(runPrefix, caseId)`, e.g. `p6-qa-20261024t010203z-3fa9c0d1-p6-cal-load-001`; every attendee, order email, product handle, document title and recipient address starts with it (`attendeeEmail`, `iterationId`).
- Cleanup sweeps by prefix from the database, so a request whose reply the client never saw (timeouts in Task 10) is still removed. Cal: cancel by uid read from `caseLiveBookings`. Medusa: orders by email prefix, product, customers by prefix. Documenso: envelopes by title prefix, webhook, token, mailboxes, account.
- Leak check per product after cleanup (existing functions); **no leak assertion is skipped**: each can read non-zero (the Medusa customer check did in the probe).
- Before any LOAD step, the preflight (Task 4) reads `results/races/*.json` of the same job and refuses to start if a race left a leak violation.

## 9. Token scan

New artefacts per run: `k6-main-summary.json`, `k6-main.json.gz`, `k6-main.log`, `k6-config.json`, `run-meta.json`, `verdict.json`, `audit.json`, `telemetry-*.json`, `chart-*.html`. `k6-config.json` holds ids and the run prefix, **not** the API token, the publishable key is a public store key but is still left out of `verdict.json`; the Documenso token travels only as an environment variable of the k6 process (`secretEnv`) and the `url` tag is dropped.
The runner's `tokenScan` stage and the job's `node scripts/evidence-token-scan.mjs results/load` run before every upload; Documenso's job also keeps its own pattern greps for `/sign/<token>` and `Bearer`. Unit test (§12): a built `k6-config.json` for each case passes `findHits`, and the Documenso config contains no `token`/`Bearer` text.

## 10. CI budget

Convention (one for every Phase 3 plan, Task 3 §9): worst case = Phase 2 closeout §2.7 worst case (slowest green `main` job + rerun allowance; runs 39927945708 `medusa-smoke` 26.2, 39923528658 `medusa-order-races` 21.3, 40037355173 `medusa-cancel-extras` 7.7, 39741411392 `cal-smoke` 9.7, 39821517901 `documenso-smoke` 6.9) + the cold start after the Task 1 suffix bump (Medusa +1.1, Cal +3.0, Documenso +2.0 estimate) + the image pull at its 6-minute cap minus the measured 0.3 (+5.7) + each new step, "estimates" at its measured/estimated duration and "at caps" at its `timeout-minutes`. LOAD step estimate = VM full-profile step time of §3.4 doubled for runner speed (an estimate until the first CI run). At least 10 minutes under the job timeout; no timeout raised.

Per-job bases (§2.7 + cold + pull): `cal-smoke` 9.7 + 3.0 + 5.7 = **18.4**; `documenso-smoke` 6.9 + 2.0 + 5.7 = **14.6**; `medusa-smoke` 26.2 + 1.1 + 5.7 = **33.0**; `medusa-order-races` 28.1; `medusa-cancel-extras` 14.5.

| Job                                            | Base (min) | Task 3 install (estimate / cap)     | Retired smoke (min) | This plan's LOAD step (estimate / cap)                      | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| ---------------------------------------------- | ---------- | ----------------------------------- | ------------------- | ----------------------------------------------------------- | ---------------------- | -------------------- | ------- | ------------- |
| `cal-smoke`                                    | 18.4       | 0.04 / 2.0                          | −0.02               | 41 s × 2 = 1.4 / 6 main, 4 PR                               | 19.8                   | 26.4                 | 60      | 33.6          |
| `documenso-smoke`                              | 14.6       | 0.04 / 2.0                          | −0.02               | 45 s × 2 = 1.5 / **4 main, 3 PR**                           | 16.1                   | 20.6                 | 45      | 24.4          |
| `medusa-smoke` (unchanged by this task)        | 33.0       | 0.04 / 2.0                          | −0.02               | none (the job keeps k6 for `k6 inspect` in `npm run check`) | 33.0                   | 35.0                 | 45      | 10.0          |
| `medusa-order-races`                           | 28.1       | install removed again (no consumer) | −0.02               | none                                                        | 28.1                   | 28.1                 | 45      | 16.9          |
| `medusa-cancel-extras`                         | 14.5       | install removed again               | −0.02               | none                                                        | 14.5                   | 14.5                 | 30      | 15.5          |
| **`medusa-load` (new; this task's step only)** | n/a        | install 0.04 / 2.0                  | n/a                 | 56 s × 2 = 1.9 / 6 main, 4 PR                               | 7.2                    | 19.1                 | **45**  | 25.9          |

`medusa-load` rows, in minutes. Estimates: install 0.04 + pull 0.3 + Start Medusa 0.9 + job overhead 2.0 + LOAD step 1.9 + scan and upload 1.0 + cold start 1.1 = 7.2. At caps: install 2.0 + pull cap 6.0 + start 1.0 + overhead 2.0 + LOAD step 6.0 + scan and upload 1.0 + cold 1.1 = 19.1. **With all three Medusa LOAD steps (Tasks 7, 8, 10) the job reaches 10.4 (estimates: Task 8 adds 1.7, Task 10 adds 1.5) and 31.1 at caps (three steps × 6.0; 32.1 if the install step kept its old 3-minute cap) against 45, margin 13.9.**

**D5 as written (rejected, kept for the record).** Putting the Medusa LOAD steps in `medusa-smoke`: this task alone gives 34.9 (estimates) and 41.0 (at caps: 33.0 + 2.0 − 0.02 + 6.0), margin 4.0; with Tasks 7, 8 and 10 it reaches 38.1 (estimates) and 53.0 (at caps), over the timeout. Its race step also sits at 24.1 minutes against a 24.0 stop rule (Phase 2 Q7, F12). Hence the owner's amendment: a new job `medusa-load`.

**Phase 2 follow-ups that stack on the existing Medusa jobs (listed so the budget is read together; this task adds nothing to these jobs).**

- `medusa-cancel-extras`, PR only: the `test.fail()` annotation for F-M4 in `P6-MED-RACE-014` with 5 PR trials (about 5 × 1.80 s = 9 s, under 0.2 min).
- `medusa-smoke` race step, PR only: `P6-MED-RACE-009` PR trials 13 → 20 (about 7 × 1.12 s = 8 s, 0.13 min), inside the PR step cap of 10 min.
- `medusa-smoke` race step 24.1 vs the 24.0 stop rule stays a BACKLOG item; Phase 3 adds nothing to it.

Every new step, with its estimate and its 80 % stop rule (80 % of `timeout-minutes`):

| Step                                   | `timeout-minutes`                                       | Estimate (min) | 80 % stop rule (min) |
| -------------------------------------- | ------------------------------------------------------- | -------------- | -------------------- |
| LOAD `P6-CAL-LOAD-001`                 | 6 main, 4 PR                                            | 1.4            | 4.8 main, 3.2 PR     |
| LOAD `P6-DOC-LOAD-001`                 | 4 main, 3 PR                                            | 1.5            | 3.2 main, 2.4 PR     |
| LOAD `P6-MED-LOAD-001` (`medusa-load`) | 6 main, 4 PR                                            | 1.9            | 4.8 main, 3.2 PR     |
| Install k6 (every job)                 | 2                                                       | 0.04           | 1.6                  |
| Token scan (three jobs)                | 2                                                       | 0.1            | 1.6                  |
| Uploads (three jobs)                   | 3                                                       | 0.2            | 2.4                  |
| `medusa-load` set-up steps             | as `medusa-order-races` (the measured 2.0 min overhead) | 2.0 in total   | n/a                  |

`medusa-order-races` (21.3) and `medusa-cancel-extras` (7.7) lose their k6 install (Task 3 added it, this task removes it again) and their smoke step (−0.02 each).

## 11. Environment changes

None beyond the k6 pin of Task 3. `/opt/node24` is needed for Documenso as today. No new tool, host or setting for Cursor Cloud or Claude Code cloud.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-journey-smokes origin/main` (after Tasks 3 to 6 are merged). Counts relative to B (B = count on main when the build starts; 688 today after Tasks 1 to 6).

| Step | Commit subject                                                           | `git add` paths                                                                                                                 | `npm run check` expected                       |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 7 plan onto the build branch`       | `docs/plans/2026-10-24-p6-phase3-task7-journey-smokes.md`                                                                       | exit 0, B                                      |
| 1    | `feat(k6): let a journey step end the journey cleanly`                   | `k6/lib/pure/journey.js tests/unit/k6-lib-journey.test.ts`                                                                      | exit 0, **B + 1**                              |
| 2    | `feat(k6): add the cal booking journey and case`                         | `k6/journeys/cal-book.js k6/cases/cal-load-001.js k6/cases/cal-load-001.example.json`                                           | exit 0 (`k6 inspect` ok), B + 1                |
| 3    | `feat(k6): add the medusa checkout journey and case`                     | `k6/journeys/med-checkout.js k6/cases/med-load-001.js k6/cases/med-load-001.example.json tests/unit/load-journey-cases.test.ts` | exit 0, **B + 4**                              |
| 4    | `feat(k6): add the documenso signing journey and case`                   | `k6/journeys/doc-sign.js k6/cases/doc-load-001.js k6/cases/doc-load-001.example.json tests/unit/load-journey-cases.test.ts`     | exit 0, B + 6                                  |
| 5    | `feat(load): add cal setup and cleanup that sweep by prefix`             | `src/load/products/cal.ts tests/unit/load-products-cal.test.ts src/load/types.ts src/load/k6-process.ts`                        | exit 0, **B + 10**                             |
| 6    | `feat(load): add medusa setup and cleanup, including the customer sweep` | `src/load/products/medusa.ts tests/unit/load-products-medusa.test.ts`                                                           | exit 0, **B + 15**                             |
| 7    | `feat(load): add documenso setup and cleanup`                            | `src/load/products/documenso.ts tests/unit/load-products-documenso.test.ts`                                                     | exit 0, **B + 18**                             |
| 8    | `feat(load): register the three journey smokes`                          | `src/load/cases.ts package.json`                                                                                                | exit 0, B + 18                                 |
| 9    | `ci(perf): replace the health smokes by the journey smokes`              | `.github/workflows/perf.yml`                                                                                                    | exit 0 (actionlint silent), B + 18             |
| 10   | `chore(k6): remove the retired health smokes`                            | `k6/smoke/medusa-health.js k6/smoke/cal-health.js k6/smoke/documenso-health.js` (deleted)                                       | exit 0 (`k6 inspect` count drops by 3), B + 18 |
| 11   | `docs: point the readme and agents notes at the journey smokes`          | `README.md AGENTS.md`                                                                                                           | exit 0, B + 18                                 |

New unit tests, by name (the 18): `k6-lib-journey` (+1: a `stop: true` step ends the journey as completed and skips the rest); `load-journey-cases` (5: a 200 distribute reply without a `recipients` array gives a failed step result and no throw; a 200 reply whose `signingUrl` does not match `/sign/<token>` gives a failed step result and no throw; the Medusa journey's request bodies equal `cartCreateBody`, `lineItemBody`, `paymentSessionBody` and `STORE_ADDRESS` of `src/medusa/payloads.ts`; the Cal booking body equals `bookingBody(...)`; the Documenso recipient, field and sign bodies equal `recipientBodies`, `signatureFieldBodies`, `signFieldBody`, `completeBody` — comparing the k6 source text by extracting the literals is fragile, so the test evaluates the journey modules in Node with a fake `k6/http` through a loader stub and diffs the captured requests);
`load-products-cal` (4: window length `ceil(planned/11.4)+3`; config has no secret; the cleanup sweeps uids read from the database (fake pool and fake `cancelBooking`); a failed cancel becomes a `TEST BUG` line and the sweep continues); `load-products-medusa` (5: stock is `planned + 20`; the customer sweep pages and deletes only emails starting with the prefix; orders swept by email prefix; the admin token goes to `ctx.secrets` and not to `ctx.config`; a failed delete becomes a `TEST BUG` line);
`load-products-documenso` (3: the API token goes to `ctx.secrets` only; `secretEnv` names it; cleanup collects the live envelope ids by title prefix before `endRun`). Sum: 1 + 5 + 4 + 5 + 3 = **18**. Cumulative: step 1 +1 → B+1; step 3 +3 → B+4; step 4 +2 (the two distribute tests, with the Documenso journey) → B+6; step 5 +4 → B+10; step 6 +5 → B+15; step 7 +3 → B+18.

After step 11: `git push -u origin feat/<build date>-p6-journey-smokes`, `gh pr create` (rule A3), read CI once (rule 15): the three LOAD steps VALID and green with their audits; the five smoke steps gone. Then one `workflow_dispatch` on `main` after merge. Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                                                 | Mitigation                                                                                                    |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| R1  | k6 cannot reuse the TypeScript clients                                               | the journeys are rewritten in k6 JavaScript; a unit test diffs their requests against the TS payload builders |
| R2  | Cal slot supply                                                                      | 60 of 320 per window; `windowDays` computed from the plan; supply shortfall is a TEST BUG before the load     |
| R3  | Documenso sealing per iteration slows the job; in-process jobs compete with requests | rate 1 per second (a fifth of the first dropping rate); the drain is bounded (Task 6: 30 s)                   |
| R4  | Job timeouts                                                                         | §10: separate Medusa job; every new step has a cap                                                            |
| R5  | A fixed rate that is clean on the VM drops iterations on the runner                  | INVALID, not FAIL; three dispatch runs before merge; the rate falls to 0.5 per second with a plan note        |
| R6  | A cleanup failure leaves rows that corrupt the next run's audit                      | prefix scoping per run; cleanup failures are TEST BUG; leak checks per product                                |
| R7  | The Documenso token appears in a log or label                                        | `secretEnv` only; no `url` tag; fixed request names; token scans                                              |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                        | Probe shows                                                                                | Effect                                                                                                                                |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | "the three CI k6 smoke steps" (D10)                                 | five steps (Medusa in three jobs, Cal, Documenso) and five artefact uploads                | all five are retired (§3.5); Twenty's stays                                                                                           |
| C2  | "the slots route is unverified"                                     | `getSchedule` is used by `src/cal/api.ts` since Phase 1 and works from k6                  | settled (§3.1)                                                                                                                        |
| C3  | "Task 7 depends on 4, 5, 6" and the runner skeleton comes in Task 4 | the runner core is Task 3's; Task 4 adds validity                                          | no effect on this plan                                                                                                                |
| C4  | D5: LOAD steps inside the product jobs after the races              | `medusa-smoke` would reach 41.0 min at caps with Task 7 alone and 53.0 with Tasks 7, 8, 10 | **D5 amended (owner decision taken): Medusa LOAD steps run in `medusa-load`, a new job with timeout 45**; Cal and Documenso follow D5 |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-CAL-LOAD-011`: the Cal journey with a second event type (60 minutes) interleaved, to exercise host-level exclusivity under load without an overlap (the Phase 1 overlap race at a trickle).
- `P6-X-LOAD-017`: a `workflow_dispatch` input `load_profile` (`pr` or `full`) so a maintainer can run the full profile on a branch without merging.

**Owner decisions (all four questions closed 2026-10-24).**

- **Q1 (closed: new job `medusa-load`; D5 amended and recorded as an owner decision taken, in §1, §10 and C4).** Medusa LOAD steps in a new job `medusa-load` or inside `medusa-smoke` per D5.
- **Q2 (closed: accept the rates, pending three dispatch runs on the runner).** Fixed rates: Cal 2 per second, Medusa 1 per second, Documenso 1 per second, 10 s on PRs and 30 s on `main`: accept? (§3.2 to §3.4)
- **Q3 (closed: P1).** Priority P1 for the three journey cases (the roadmap gives none)?
- **Q4 (closed: accept).** `LoadContext.secrets` (additive change to Task 3's contract): accept, or pass secrets through a root-only temp file instead?

## 14. Done when (roadmap, made measurable)

- [ ] All three journeys VALID and green with their audits in CI on the PR and once on `main` (jobs `cal-smoke`, `documenso-smoke`, `medusa-load`); each `verdict.json` outcome `PASS`, `audit.json` present.
- [ ] Every run ships summary, telemetry, chart, `run-meta.json` and audit (artefacts `load-cal`, `load-documenso`, `load-medusa`) after a clean token scan.
- [ ] `k6/smoke/medusa-health.js`, `cal-health.js`, `documenso-health.js`, the three `smoke:*` scripts and the five CI smoke steps with their uploads are gone; the readiness preflight runs instead (visible in each `verdict.json` stage list).
- [ ] `AGENTS.md` and README updated (no remaining `smoke:medusa|cal|documenso`: `grep -rn "smoke:medusa\|smoke:cal\|smoke:documenso" README.md AGENTS.md package.json .github` finds nothing; `docs/plans` is excluded because the plans quote the old names).
- [ ] Each journey runs standalone with plain `k6 run` (commands in README; the example JSON files).
- [ ] `npm run check` exit 0 with **B + 18** (706 on today's chain); no job timeout raised; every new step has `timeout-minutes`.

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: the three rates on the runner (§3.6 item 1), settled by three dispatch runs before merge.
- (b) Existing names grepped at `5acd2a0`: `src/cal/{api,oracle,payloads,session}.ts`, `src/medusa/{admin,store,oracle,payloads}.ts`, `src/documenso/{account,api,env,inbucket,run-case}.ts`, `src/receivers/webhook-receiver.ts`, `src/races/prefix.ts`, `perf.yml` smoke steps (lines 156, 352, 528, 722, 1175), `README.md` lines 12, 130, 208, `AGENTS.md` line 9, `package.json` `smoke:*`.
  NEW: everything under `k6/journeys`, `k6/cases`, `src/load/products`, and the Task 3 to 6 names listed at the top (checked at build time, §5 check 3).
- (c) CI time: §10; at caps every job is at least 10.0 minutes under its timeout (`medusa-smoke` 10.0, `medusa-load` 13.9 with all three Medusa LOAD steps); the rejected D5-as-written layout is shown for the record.
- (d) Skeletons: §6. Steps with `git add` paths, subjects and expected output: §12.
- (e) The owner's answers to Q1 to Q4 are recorded in §1 and §13.
