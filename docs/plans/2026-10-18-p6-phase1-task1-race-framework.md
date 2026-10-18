# P6 Phase 1 Task 1: race framework (plan only)

This is the implementation plan a weaker model will build from. Do not write framework code
until Jayami approves this document.

Structure and depth follow
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md)
(copied unchanged from P1). P1 UI-assertion and page-object rules do **not** apply. P6 asserts
through the HTTP API and the database.

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite).
  P6.
- Branch: `feat/2026-10-18-p6-race-framework` from `origin/main` at
  `45e33dee53f634a28a102cbd16240d928d253dee` (PR #3 merge: p1 plan reference). Local `main` at probe
  start was stale `b89bcf4`; always branch from fetched `origin/main`.
- Harness: `qa-portfolio-harness#v0.2.11` = `f96038f951c8d62521ac60098661a851df9f65bb` (`npm ls`).
- Medusa fork: `Jayami123/medusa-dtc-starter` @ `f677db438f27294fc50e4c7c6612e71ff38eeff5`
  (`@medusajs/medusa` 2.21.2). Never edit the fork. Never start, stop or edit the product by hand;
  the harness owns it.
- Phase 1 has 7 tasks, one PR each. This is Task 1 only. Mapped IDs that this PR must **not** invent
  or implement: `P6-MED-RACE-001` (Task 2), Cal wiring (Task 3), `P6-CAL-RACE-001/002/003` (Task 4),
  Documenso wiring + `P6-DOC-RACE-001/002` (Task 5), CI races job per product (Task 6), closeout
  (Task 7).
- Call the live spec **framework self-test (unmapped)**. Histogram `caseId` is `framework-self-test`
  (OQ1, accepted). That is not a mapped RTM id.
- PATH before every harness command: `export PATH="/usr/local/bin:$PATH"` (Cursor puts Node 22.14
  first; Medusa needs 22.23).
- Status: Step 1 probe done once in this session. Review answers OQ1–OQ4 applied. **Not built.**
  Probe scripts lived only in `/tmp` and were not written to the repo, harness or fork. Medusa was
  stopped with `npm run down:medusa` (exit 0).

Master-plan names used as-is ([docs/master-plan.html](../master-plan.html) §§2, 3, 4, 5, 7, 9):

- `playwright.config.ts` with `*-race` projects (API, no browser)
- `src/races/` helpers (parallel POST / barrier, histogram) and `src/oracles/pg.ts`
- `tests/<product>/races/*.spec.ts`
- JSON status histograms; `pg` row-count oracles
- Phase 1 later: Cal identical+overlap, Medusa oversell, Documenso double-complete — **not this PR**

The empty top-level `races/` `.gitkeep` stays unused. Code goes under `src/races/` and
`tests/medusa/races/` as the master plan says.

## 1. Header

- Probe date: 2026-10-18, this cloud VM. Node after PATH: **v22.23.3** at `/usr/local/bin/node`.
  Without PATH: **v22.14.0** at `/exec-daemon/node`.
- `npm ci` was **not** needed: `node_modules` already present (`qa-portfolio-harness@0.2.11`,
  Prettier 3.9.10, TypeScript 5.9.3).
- Docker already running (`start-user.status` 0). Product tree: `PRODUCTS_ROOT=/home/ubuntu/products`.
- Timings here prove a test works. They are never published as performance numbers (AGENTS.md /
  README).

## 2. Probe findings (required; no guessed values)

### 2.1 Bring-up

Command:

```bash
export PATH="/usr/local/bin:$PATH"
node --version   # v22.23.3
TIMEFORMAT=$'real %R\nuser %U\nsys %S'
time npm run up:medusa
```

Observed (exit 0):

- Wrapper: `harness up medusa (PRODUCTS_ROOT=/home/ubuntu/products)`
- Compose project `qa-harness-medusa`, image `postgres:15`, container
  `qa-harness-medusa-postgres-1`, port `127.0.0.1:5433->5432/tcp`, healthcheck healthy
- Harness: `Medusa GET /health returned HTTP 200 in 4.0 s (http://127.0.0.1:9000/health).`
- Harness: Medusa backend is up at http://127.0.0.1:9000 (production, 4.0 s from spawn to HTTP 200).
- `MEDUSA_SKIP_STOREFRONT=1; storefront not started.`
- Wall: **real 54.483** (user 36.091, sys 4.226)

Backend base URL and port (from live harness output, not from docs): **`http://127.0.0.1:9000`**.

### 2.2 `GET /health`

```bash
curl -sS -D - -o /tmp/health.body http://127.0.0.1:9000/health
```

- Status line: `HTTP/1.1 200 OK`
- `Content-Type: text/html; charset=utf-8`
- `Content-Length: 2`
- Body: `OK` (exactly two bytes, not JSON)
- Follow-up:
  `curl -sS -o /dev/null -w "http_code=%{http_code} time_total=%{time_total}\n"` →
  `http_code=200 time_total=0.001850`

If a later self-test sees anything other than HTTP 200 + body `OK`, label it **PRODUCT BUG** and
paste status + body. Do not retry.

### 2.3 Postgres (harness compose, confirmed live)

Compose file `node_modules/qa-portfolio-harness/docker/medusa.compose.yml` says
`127.0.0.1:5433:5432`, db/user `medusa`. Confirmed:

- `docker ps`: `qa-harness-medusa-postgres-1` `127.0.0.1:5433->5432/tcp` Up (healthy)
- TCP: `127.0.0.1:9000` OPEN, `127.0.0.1:5433` OPEN, `127.0.0.1:5432` closed
- Connected with Node `pg` 8.23.1 (already a transitive dep of the harness; Task 1 will add it as a
  **direct** dep)
- `SELECT current_database(), current_user, version()` → db `medusa`, user `medusa`,
  `PostgreSQL 15.19`
- 148 public tables

Task 2 oracle tables **exist** (names are lowercase, unquoted except `"order"` which is a SQL
keyword):

**`"order"`** (20 cols): `id` text, `region_id` text, `display_id` integer, `customer_id` text,
`version` integer, `sales_channel_id` text, `status` `order_status_enum` (`pending`, `completed`,
`draft`, `archived`, `canceled`, `requires_action`), `is_draft_order` boolean, `email` text,
`currency_code` text, `shipping_address_id` text, `billing_address_id` text, `no_notification`
boolean, `metadata` jsonb, `created_at` timestamptz, `updated_at` timestamptz, `deleted_at`
timestamptz, `canceled_at` timestamptz, `custom_display_id` text, `locale` text.

**`reservation_item`** (14 cols): `id`, `created_at`, `updated_at`, `deleted_at`, `line_item_id`,
`location_id`, `quantity` numeric, `external_id`, `description`, `created_by`, `metadata`,
`inventory_item_id`, `allow_backorder`, `raw_quantity`.

**`inventory_level`** (13 cols): `id`, `created_at`, `updated_at`, `deleted_at`,
`inventory_item_id`, `location_id`, `stocked_quantity` numeric, `reserved_quantity` numeric,
`incoming_quantity` numeric, `metadata`, `raw_stocked_quantity`, `raw_reserved_quantity`,
`raw_incoming_quantity`.

Related (Task 2, not queried as oracles in Task 1): `inventory_item`, `product_variant`,
`product_variant_inventory_item`, `cart`, `order_item`.

Live row counts after a fresh `up` (seed only): `"order"` **0**, `reservation_item` **0**,
`inventory_level` **20**. Sample `inventory_level.stocked_quantity` = `1000000`,
`reserved_quantity` = `0`.

Public harness default URL (already in `.github/workflows/perf.yml` as “not a secret”):
`postgres://medusa:medusa@127.0.0.1:5433/medusa`. Never log a non-default URL (it could contain
credentials). Histogram must not include the connection string.

### 2.4 Barrier timing (20 concurrent `GET /health`, 15 rounds)

Scratchpad only (`node --input-type=module`, `performance.now()`, global `fetch`).

**What `dispatchSpreadMs` is.** It is `max(startedAtMs) - min(startedAtMs)`, and `startedAtMs` is
`performance.now()` taken in this Node process **immediately before the `fetch` / `makeRequest`
call**. It measures when Node started each request, **not** when Medusa accepted the socket, **not**
when the handler ran, and **not** when the response arrived. A small spread means the client
released the burst together. It does not prove the server processed the 20 requests at the same
instant. Write this sentence in `README.md` as well.

- **A plain `Promise.all`:** spreads_ms
  `[4.37, 0.76, 0.496, 0.414, 0.668, 0.599, 0.564, 0.328, 0.314, 0.457, 0.398, 0.733, 0.301, 0.324, 0.272]`
  → min 0.272, p50 0.457, mean 0.733, **max 4.37** (first/cold round).
- **B gate + warm:** prepare 20 waiters on one shared promise, warm 20 `fetch` first, then release →
  `[0.879, 0.651, 0.457, 0.485, 0.654, 0.42, 0.398, 0.399, 0.472, 0.515, 0.318, 0.465, 0.297, 0.298, 0.301]`
  → min 0.297, p50 0.457, mean 0.467, **max 0.879**.
- **B gate, no warm (diagnostic):** max 0.748, similar to B.
- **CONTROL sequential `for await`:** min **12.687**, p50 15.925, mean 16.912, max 28.423.
- Last A/B/sequential statuses/bodies: `[200]` / `['OK']`.

Sequential start offsets last round: 0, 0.757, …, 15.925 ms (one request after another). Gated start
offsets last round: 0 … 0.301 ms.

**Pick B (gated + warmed Node `fetch`).** Default self-test spread threshold: **5 ms**, read from
`RACE_MAX_SPREAD_MS` (OQ2). Evidence: gated max 0.879 ms; sequential min 12.687 ms. 5 ms is a “not
sequential” correctness bound, not a published SLO. GitHub Actions runners may be noisier than this
VM; raise the env value, not the code. If a run is 200 + body `OK` but spread ≥ the env limit, label
**TEST BUG** (barrier ran sequentially or was not a gate). If spread is fine but status ≠ 200,
**PRODUCT BUG**.

The probe warmed by calling the same `fetch('/health')` that was the race request. That is safe for
Task 1. It is **not** safe for Task 2, where `makeRequest` will complete a cart. Warm-up must be a
**separate function** (D1).

Playwright `APIRequestContext` was **not** measured (package not installed; installing it would have
been framework work). See D1.

### 2.5 Node TypeScript runner

After `export PATH="/usr/local/bin:$PATH"`:

- `node --version` → `v22.23.3`
- `node /tmp/probe-typestrip.ts` (`const x: number = 1`) → `native-ts 1` **with no flag**.
  `--experimental-strip-types` also works. `--no-experimental-strip-types` exists (stripping is on
  by default).
- `node --test /tmp/probe-node-test.ts` → pass 1.
- ESM `import { n } from "./probe-mod.ts"` → works.
- ESM `import { n } from "./probe-mod.js"` → **`ERR_MODULE_NOT_FOUND`**. Unit-test and helper
  imports must use **`.ts` extensions**.
- `node --test <directory>` did **not** recurse `.ts` files (it tried to load the directory as a
  module). Working form: `node --test tests/unit/*.test.ts` (bash glob). Keep unit tests **flat** in
  `tests/unit/`.
- Node type stripping does **not** support TypeScript `enum`. Use string-union types.
- Harness itself compiles tests then `node --test dist-test/**/*.test.js`. We skip that extra
  tsconfig because this Node already runs `.ts`.

### 2.6 Tear-down

```bash
export PATH="/usr/local/bin:$PATH"
time npm run down:medusa
```

Exit 0, real **0.578** s. `Medusa backend stopped and compose stack torn down (volumes kept).` After
down: curl `/health` connection refused; `docker ps` empty. Postgres volumes kept (harness
`compose down` without `-v`). Probe created **no** application rows (read-only SQL + GET `/health`
only).

## 3. Resolved decisions

Lead with the industry-standard approach, then the rejected alternative.

- **D1 Barrier = start-line gate over Node `fetch`; warm is a separate function, never
  `makeRequest`.** Industry standard for concurrency tests is a start-line / cyclic barrier: N
  waiters, one release. Warm TCP/keep-alive **before** the gate with a cheap, side-effect-free
  function (`options.warm`), called `n` times. `makeRequest` is called **exactly `n` times** (once
  per racing request after the gate). Task 2’s `makeRequest` will be “complete cart”; warming with
  it would place 20 real orders before the race. Rejected: `options.warm: boolean` that reuses
  `makeRequest` (the probe did this; it is unsafe for later tasks). Rejected: plain `Promise.all`
  (cold max 4.37 ms, no explicit barrier). Rejected: Playwright `APIRequestContext` as the racing
  client (unmeasured extra HTTP stack; harder to warm N sockets and release together). Playwright is
  still the **runner**. Rejected: `worker_threads` (master plan mentions them; N HTTP calls in one
  isolate is enough). Rejected: a timer (`setTimeout` / `waitForTimeout`) as a stand-in for a gate.

- **D2 HTTP client inside `makeRequest` = global `fetch` (undici 6.28.1 bundled in Node 22.23.3).**
  Industry standard: own the client so the barrier is honest. Specs call:

```ts
fireTogether(20, (i) => fetch(raceUrl).then(...), { warm: () => fetch(`${base}/health`) });
```

Playwright’s `request` fixture may be used later for cookie/auth setup (Cal/Documenso), not for
the simultaneous burst.

- **D3 Unit runner = `node --test` on `.ts` files, same family as the harness.** Probe: Node 22.23.3
  strips types natively. Script: `"test:unit": "node --test tests/unit/*.test.ts"`. Rejected:
  `tsx` (extra dep). Rejected: compile-then-`node --test` (harness pattern; extra
  `tsconfig.test.json` for no gain). Imports use `.ts` suffixes (D3a). No `enum`.

- **D4 Layout follows the master plan, Task 1 files only.** Shared helpers in
  `src/races/{types,fire-together,run-trials,histogram,env,prefix}.ts` and `src/oracles/pg.ts`. Live
  spec: `tests/medusa/races/framework-self-test.spec.ts`. Do **not** add empty
  `src/races/{cal,doc,med,tw}.ts` (OQ3; those are Tasks 2–5). Do **not** put code in top-level
  `races/`.

- **D5 Env.** `RACE_TRIALS` integer ≥ 1, default **5** locally. CI ≥ 50 is Task 6; do not set it in
  this PR’s workflow. `RACE_MAX_SPREAD_MS` integer ≥ 1, default **5** (OQ2). Same parser as
  `RACE_TRIALS`. GitHub Actions may be noisier; change the env value, not the code. Database URL:
  `P6_MEDUSA_DATABASE_URL` if non-empty, else `MEDUSA_DB_URL` (harness/CI already set this), else
  the probed public default `postgres://medusa:medusa@127.0.0.1:5433/medusa`. Base URL:
  `MEDUSA_BASE_URL` or `http://127.0.0.1:9000` (never `localhost`).

- **D6 Playwright project `medusa-race`: `retries: 0`, `workers: 1`.** A retry hides a race.
  Concurrency is inside the test via `fireTogether`. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in
  `.npmrc` and CI env so `npm ci` does not fetch Chromium. No browser project.

- **D7 Histogram is always written** (`try/finally` in the spec), including on failure. Create it
  with `createHistogram(...)` so the object is complete (`verdict: "fail"`, empty arrays, zeroed
  counts) **before** the `try`. Never `{} as RaceHistogram`. Path `results/races/<caseId>.json`
  (already gitignored via `results/*`). CI artefact upload is Task 6.

- **D8 Oracle is a read-only `pg.Pool` at the connection, plus a SELECT-only keyword guard.**
  Industry standard is a dedicated read-only role **or** a read-only transaction
  (`default_transaction_read_only=on`). We do not add a harness role (that would edit compose /
  harness). Set it on every connection:

  `new pg.Pool({ connectionString, max: 5, allowExitOnIdle: true, options: "-c default_transaction_read_only=on" })`

  Keep `assertSelectOnly` as a second guard on `selectRows`. Rejected: keyword checks alone
  (`pool.query("INSERT ...")` would bypass them). `waitForStable` polls until N consecutive equal
  JSON-stable values (async workflows finish after HTTP). Pool closed in Playwright teardown. Tests
  never successfully write. The live self-test proves Postgres rejects an `INSERT` with SQLSTATE
  **`25006`** (`read_only_sql_transaction`); record the code, never the URL. Leak check: Task 1
  creates no rows; after the self-test the three table counts match the pre-test snapshot. A count
  change sets histogram `verdict: "fail"` **and** pushes an `invariantViolations` entry, not only
  an `expect` failure.

- **D9 Unique run prefix `p6-qa-<utc>-<8 hex>`** from `src/races/prefix.ts`, unit-tested. Task 1
  does not insert data; Task 2 will stamp carts/emails with this prefix. Isolation is “one Medusa at
  a time” plus prefix, not DB truncate.

- **D10 Direct dependencies:** `@playwright/test@1.64.1` (npm view at probe), `pg@^8.23.1`,
  `@types/pg@^8.23.1`. Do not import `pg` from the harness package. Do not add `tsx`, `undici`, or a
  browser.

- **D11 Product vs test bugs.** Every hard failure in a live spec prints `PRODUCT BUG` or
  `TEST BUG` with HTTP status and body (or SQLSTATE, never the connection string). `/health` ≠
  200+`OK` → PRODUCT BUG. Spread ≥ `RACE_MAX_SPREAD_MS` with 200s → TEST BUG. Histogram schema fail
  → TEST BUG. `SELECT 1` fail with Postgres up → TEST BUG. `INSERT` through the pool that is **not**
  SQLSTATE `25006` → TEST BUG (read-only GUC missing).

- **D12 `npm run check` includes `test:unit`. CI runs unit tests only through that Check step
  (OQ4).** Existing CI job `medusa-smoke` in `.github/workflows/perf.yml`: rename
  “Check (format, typecheck, k6 inspect)” to “Check (format, typecheck, k6 inspect, unit tests)”.
  Command stays `npm run check`. Do **not** add a separate “Unit tests (no product)” step. That is
  not a new required check/job (Task 6).

- **D13 Typecheck split.** Keep current `tsconfig.json` for `scripts/**/*.mjs` + `k6/**/*.js`
  (`types: ["node","k6"]`). Add `tsconfig.races.json` for `src/**/*.ts`, `tests/**/*.ts`,
  `playwright.config.ts` (`types: ["node"]`, `module: NodeNext`, `strict` same as root).
  `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.races.json"`. Prevents k6 globals from
  leaking into race helpers.

## 4. Goal and scope

**In:**

- `@playwright/test` API-only runner, `playwright.config.ts` project `medusa-race`
- Helpers: `fireTogether` (separate `warm` fn), `runTrials`, `createHistogram` / `writeHistogram`,
  connection-level read-only `pg` oracle, `RACE_TRIALS`, `RACE_MAX_SPREAD_MS`, run prefix
- Unit tests (no product) for every helper, including the extra risky checks
- One unmapped live spec: 20 concurrent GET `/health` through `fireTogether`, `SELECT 1`, real
  table counts, INSERT rejected with `25006`, histogram file
- Scripts `test:unit` and `race:medusa`; `test:unit` added to `npm run check`; CI Check step renamed
- README section on running races, including what `dispatchSpreadMs` measures
- `.env.example` names for `P6_MEDUSA_DATABASE_URL`, `RACE_TRIALS`, `RACE_MAX_SPREAD_MS` (empty
  values)

**Out:**

- Every mapped case ID (see Context)
- k6 changes, thresholds, dashboards
- Cal / Documenso / Twenty wiring
- Empty `src/races/{cal,doc,med,tw}.ts` stubs (OQ3)
- New CI job `races` / required check (Task 6)
- A separate CI “Unit tests (no product)” step (OQ4)
- Browser install, page objects, UI assertions
- Successful writes to Postgres from tests
- Edits to the Medusa fork or harness source
- Top-level `races/` implementation

## 5. Test-case mapping

Task 1 has **no** mapped RTM IDs.

- Name: **framework self-test (unmapped)**
- File: `tests/medusa/races/framework-self-test.spec.ts`
- Project: `medusa-race`
- Histogram `caseId`: `framework-self-test` (OQ1)
- Title: `framework self-test (unmapped)`
- Oracle: `SELECT 1 AS ok`; `SELECT COUNT(*)::int AS n FROM "order"`; `COUNT(*)` on
  `reservation_item` and `inventory_level`; INSERT probe → SQLSTATE `25006`
- Cleanup: none (no successful writes). Leak snapshot: the three counts unchanged. A mismatch is an
  `invariantViolations` entry **and** `verdict: "fail"`.

## 6. Extra risky checks (inside the framework, required)

All of these are **unit tests** except the INSERT `25006` check (live self-test):

- Barrier that silently ran sequentially: feed sequential fake start timestamps;
  `dispatchSpreadMs` ≥ default 5; `assert.ok(spread >= 5)` so the production assertion
  (`spread < raceMaxSpreadMsFromEnv()`) would fail. Also a unit that computes spread from
  `[10, 10.2, 12]` → `2`.
- Warm does not call `makeRequest`: `fireTogether(4, makeRequest, { warm })` with counters.
  `makeRequest` called **exactly 4 times**; `warm` called **exactly 4 times**. A boolean-warm
  implementation that reused `makeRequest` would fail this (8 calls).
- `runTrials` continues after a throw: 3 trials, trial 2 throws; results length 3; trial 2
  `ok: false` with message; trials 1 and 3 `ok: true`.
- Non-JSON / 5xx body: `summariseBody(500, "<html>nope")` does not throw, returns a short string
  containing `500` and a prefix of the body.
- Pool leak: `createReadOnlyPool` + `closePool` (against a fake `Pool` with `end` spy) calls `end`
  exactly once; a second close is a no-op. Constructor is called with
  `options: "-c default_transaction_read_only=on"`.
- `createHistogram` returns a complete `RaceHistogram`: `verdict === "fail"`, `perTrial` `[]`,
  `invariantViolations` `[]`, `statusCounts` `{}`, `dispatchSpreadMs` all `0`, required fields
  present. No type assertion needed to assign it.
- Histogram written on failure: `writeHistogram` in a simulated `finally` after
  `verdict: "fail"` still creates the JSON file with `verdict: "fail"` and non-empty
  `invariantViolations`.
- `waitForStable` with a fake query: value 1, then 2, then 2 → returns 2; a query that never
  repeats times out.
- Env defaults: unset `RACE_TRIALS` → 5; `RACE_TRIALS=3` → 3; `RACE_TRIALS=0` / `-1` / `abc`
  throw. Unset `RACE_MAX_SPREAD_MS` → 5; `RACE_MAX_SPREAD_MS=10` → 10; `0` / `-1` / `abc` throw.
  URL fallback order as D5.
- Live (self-test, not unit): `INSERT` through `pool.connect()` + `client.query` is rejected with
  SQLSTATE `25006`. Record `code` on the histogram oracle. Never log the connection string. Do
  **not** send that INSERT through `selectRows` / `assertSelectOnly` — the point is that Postgres,
  not the keyword guard, rejects it.

## 7. Architecture (every file touched, one responsibility each)

New:

- `playwright.config.ts` — project `medusa-race` (`testDir: tests/medusa/races`), `retries: 0`,
  `workers: 1`, `fullyParallel: false`, `forbidOnly: !!process.env.CI`, reporter `list`.
  `use.baseURL` from `MEDUSA_BASE_URL` default `http://127.0.0.1:9000`. No `projects` with
  `browserName`.
- `src/races/types.ts` — histogram and result types only (exact type below).
- `src/races/fire-together.ts` — `fireTogether`, `summariseBody`, `dispatchSpreadMs`.
- `src/races/run-trials.ts` — `runTrials`.
- `src/races/histogram.ts` — `createHistogram`, `writeHistogram`, `readHistogram` (test helper),
  `histogramPath`.
- `src/races/env.ts` — `raceTrialsFromEnv`, `raceMaxSpreadMsFromEnv`, `medusaBaseUrlFromEnv`,
  `medusaDatabaseUrlFromEnv`.
- `src/races/prefix.ts` — `p6RunPrefix`.
- `src/oracles/pg.ts` — Pool factory (read-only GUC), `assertSelectOnly`, `selectRows`,
  `waitForStable`, `closePool`.
- `tests/unit/fire-together.test.ts`
- `tests/unit/run-trials.test.ts`
- `tests/unit/histogram.test.ts`
- `tests/unit/pg-oracle.test.ts`
- `tests/unit/env.test.ts`
- `tests/unit/prefix.test.ts`
- `tests/medusa/races/framework-self-test.spec.ts`
- `tsconfig.races.json`
- `docs/plans/2026-10-18-p6-phase1-task1-race-framework.md` (this plan)

Modified:

- `package.json` / `package-lock.json` — deps + scripts `test:unit`, `race:medusa`; `check`
  appends `test:unit`; `typecheck` runs both tsconfigs
- `.npmrc` (create) — `playwright_skip_browser_download=1`
- `.env.example` — `P6_MEDUSA_DATABASE_URL=`, `RACE_TRIALS=`, `RACE_MAX_SPREAD_MS=` comments
- `.github/workflows/perf.yml` — env `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"` on the job; rename
  Check step to mention unit tests; **no** extra unit-test step
- `README.md` — how to run unit tests and one Medusa race locally; what `dispatchSpreadMs` measures
- `tsconfig.json` — unchanged include (k6/scripts only) except if the `typecheck` script changes

Not changed: fork, harness, k6 scripts, top-level `races/`, `thresholds/`, master-plan HTML.

```mermaid
sequenceDiagram
  participant Spec as medusa_race_spec
  participant Barrier as fireTogether
  participant Warm as warm_fn
  participant Fetch as Node_fetch
  participant Medusa as Medusa_9000
  participant Oracle as pg_Pool
  participant Hist as results_races_json

  Spec->>Hist: createHistogram verdict fail
  Spec->>Oracle: snapshot counts
  Spec->>Barrier: n waiters
  Barrier->>Warm: n times never makeRequest
  Warm->>Medusa: GET /health
  Barrier->>Barrier: release shared promise
  par request_0
    Barrier->>Fetch: start
    Fetch->>Medusa: GET /health
  and request_N
    Barrier->>Fetch: start
    Fetch->>Medusa: GET /health
  end
  Barrier-->>Spec: statuses plus dispatchSpreadMs
  Spec->>Oracle: SELECT 1 and COUNT
  Spec->>Oracle: INSERT expect SQLSTATE 25006
  Spec->>Hist: writeHistogram always
  Spec->>Oracle: closePool
```

## 8. Histogram schema (exact TypeScript)

Put this in `src/races/types.ts` unchanged (field names are the contract Task 2+ will write):

```ts
export type RaceProduct = "medusa" | "cal" | "documenso" | "twenty" | "framework";
export type RaceVerdict = "pass" | "fail";

export type RaceOracleValue = number | string | boolean | null;

export interface RaceRequestResult {
  index: number;
  status: number | null;
  bodySummary: string;
  startedAtMs: number;
  endedAtMs: number;
  error?: string;
}

export interface RaceTrialResult {
  trial: number;
  ok: boolean;
  statuses: Array<number | null>;
  statusCounts: Record<string, number>;
  dispatchSpreadMs: number;
  oracle: Record<string, RaceOracleValue>;
  invariantViolations: string[];
  error?: string;
  requests?: RaceRequestResult[];
}

export interface RaceHistogram {
  caseId: string;
  title: string;
  product: RaceProduct;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  trials: number;
  concurrency: number;
  statusCounts: Record<string, number>;
  perTrial: RaceTrialResult[];
  oracle: Record<string, RaceOracleValue>;
  dispatchSpreadMs: { min: number; max: number; mean: number };
  invariantViolations: string[];
  verdict: RaceVerdict;
}
```

Rules:

- `caseId` for this PR is `framework-self-test`. `title` is `framework self-test (unmapped)`.
  `product` is `framework`.
- `commitSha` from `process.env.GITHUB_SHA` if set, else `git rev-parse HEAD` (sync, ignore git
  errors → `"unknown"`).
- `statusCounts` keys are `"200"`, `"409"`, `"500"`, `"error"` (for thrown/no status). Never drop a
  key that appeared.
- `dispatchSpreadMs` on the histogram is the min/max/mean of per-trial spreads (one trial of 20 has
  min=max=mean). Each per-trial `dispatchSpreadMs` is when **Node started** those requests, not
  when the server received them (§2.4).
- `verdict` is `fail` if any trial `ok === false` **or** any `invariantViolations` non-empty
  (including leak-check mismatches). Start at `fail` via `createHistogram`; set `pass` only after
  trials, leak check and read-only INSERT check all succeed.
- `createHistogram` must return every field above. `writeHistogram` may be called on that object
  with no further assignment if the test dies in `try`.

## 9. Oracle design

`src/oracles/pg.ts` skeletons (implement exactly these exports):

```ts
import pg from "pg";
import { medusaDatabaseUrlFromEnv } from "../races/env.ts";

export function assertSelectOnly(sql: string): void {
  // trim, strip leading comments -- and /* */, first word must be SELECT (case-insensitive)
  // else throw Error("TEST BUG: oracle query is not SELECT-only")
}

export function createReadOnlyPool(connectionString = medusaDatabaseUrlFromEnv()): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 5,
    allowExitOnIdle: true,
    options: "-c default_transaction_read_only=on",
  });
}

export async function selectRows<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertSelectOnly(sql);
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

export async function waitForStable<T>(
  queryFn: () => Promise<T>,
  opts?: { intervalMs?: number; stableReads?: number; timeoutMs?: number },
): Promise<T> {
  // defaults: intervalMs 50, stableReads 2, timeoutMs 10_000
  // compare with JSON.stringify
  // on timeout throw TEST BUG with last values, never hang
}

export async function closePool(pool: pg.Pool | undefined): Promise<void> {
  // end() once; tolerate undefined
}
```

Self-test SQL (parameterless, exact):

- `SELECT 1 AS ok` → assert `Number(rows[0].ok) === 1` (pg may return string `"1"` for some ints).
  Record the raw value in the histogram.
- `SELECT COUNT(*)::int AS n FROM "order"`
- `SELECT COUNT(*)::int AS n FROM reservation_item`
- `SELECT COUNT(*)::int AS n FROM inventory_level`

Read-only live check (the only intentional non-SELECT through the pool). Use `pool.connect()` then
`client.query`, **not** `selectRows`:

```ts
const client = await pool.connect();
try {
  await client.query("INSERT INTO inventory_item (id) VALUES ('iitem_p6_readonly_probe')");
  throw new Error("TEST BUG: read-only pool accepted INSERT");
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  histogram.oracle.readOnlySqlstate = code;
  if (code !== "25006") {
    throw new Error(`TEST BUG: expected SQLSTATE 25006, got ${code || "no code"}`);
  }
} finally {
  client.release();
}
```

Postgres checks `default_transaction_read_only` before row-level constraints, so a short INSERT is
enough. If the code is `23502` (not-null) or similar, the GUC was not applied — TEST BUG. Never
print `connectionString` or `client.connectionParameters`.

`waitForStable` is not required for `/health` (sync). Still call it once on `SELECT 1 AS ok` in the
self-test so the helper is wired live.

## 10. Test data, isolation, cleanup and leak check

- Run prefix: `p6-qa-20261018T124929Z-a1b2c3d4` (`p6-qa-` + UTC `YYYYMMDDTHHMMSSZ` + `-` + 8 hex
  from `crypto.randomBytes(4)`). Unit-test the format. Task 1 does not write it to the DB.
- Isolation: `workers: 1`; one Medusa stack; do not truncate seed tables (`inventory_level` has 20
  seed rows).
- Leak check in the live spec: snapshot the three counts before `fireTogether`; after, the same
  three queries must match. On mismatch: push
  `TEST BUG: <table> count <before> -> <after>` onto `histogram.invariantViolations`, set
  `verdict` to `"fail"`, **then** `expect` so Playwright also fails. `GET /health` must not create
  orders; an increase is TEST BUG. If the counts cannot be read, TEST BUG (oracle).
- Cleanup: `closePool` in `finally`. No product `down` inside the spec (the human/CI script runs
  `down:medusa`).
- Do not use harness seed customers or admin password in Task 1.

## 11. Known-bug handling

None expected. `/health` 200 `OK` was observed. If the self-test fails:

- Status/body mismatch → PRODUCT BUG, paste `HTTP <code>` and body, stop.
- Spread ≥ `RACE_MAX_SPREAD_MS` → TEST BUG, paste `dispatchSpreadMs` and the 20 start offsets, stop.
- INSERT not `25006` → TEST BUG, paste SQLSTATE only, stop.
- Do not `test.fail()`, retries, or sleeps to “make it pass”.

## 12. CI (extend existing `medusa-smoke`, no new required check)

File: `.github/workflows/perf.yml`. Job stays `medusa-smoke`.

- Job `env`: add `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"`. Do **not** set `RACE_TRIALS=50` (Task 6).
  Do **not** set `RACE_MAX_SPREAD_MS` unless Actions later proves 5 ms is too tight; default is 5.
- Rename “Check (format, typecheck, k6 inspect)” to “Check (format, typecheck, k6 inspect, unit
  tests)”. Command stays `npm run check` (now includes `test:unit`).
- Do **not** add a separate “Unit tests (no product)” step (OQ4).
- Do **not** add `race:medusa`, a `races` matrix job, artefacts for histograms, or a new workflow.
  Do **not** mark a new GitHub required status.

## 13. Risks and unknowns (each with a probe)

- **R1 Playwright ESM + `.ts` import suffixes.** Probe: Node needs `.ts`. Playwright’s loader may
  want `.js` or extensionless. Mitigation: write helpers with `.ts` imports; if
  `npx playwright test --list` fails with `ERR_MODULE_NOT_FOUND`, stop and report the exact error
  (do not silently switch to `tsx`). Playwright `module: "commonjs"` is **not** allowed
  (`"type": "module"`).
- **R2 Native type stripping vs `tsc`.** Node runs `.ts`; `tsc` still typechecks. Keep both. If
  `tsc` rejects `.ts` import specifiers under `NodeNext`, set `allowImportingTsExtensions: true` and
  keep `noEmit: true` in `tsconfig.races.json`. Probe this in Build Step 2; if `tsc` fails, that
  flag is the allowed fix.
- **R3 Default fetch connection pool serialises bodies.** Last gated durations climbed ~1 ms each
  (0.966 … 11.157). Starts were still ≤ 0.3 ms apart, so the **client** barrier holds. This is why
  `dispatchSpreadMs` is defined as Node start times, not server receive times. Task 2 POSTs may need
  a larger undici `Agent`; out of scope here. Do not treat duration climb as a barrier failure.
- **R4 `node --test <dir>` does not pick up `.ts`.** Probed. Use `tests/unit/*.test.ts` glob. npm
  script runs with `sh` on CI; glob works. If zero files, the glob stays literal and Node fails —
  good.
- **R5 Postgres `"order"` quoting.** Probed: unquoted `order` would be SQL syntax. Always `"order"`.
- **R6 `COUNT(*)::int` vs pg string.** Assert `Number(...)`. Record raw in histogram.
- **R7 Browser download in `npm ci`.** Mitigated by `.npmrc` + CI env (D6). Verify `--list` does not
  require Chromium.
- **R8 Stale local `main`.** Always `git fetch origin main` and branch from `45e33de`.
- **R9 `default_transaction_read_only` vs a read-only role.** Session GUC is standard and does not
  need harness changes. If `25006` is not observed, stop and report the SQLSTATE; do not fall back
  to keyword-only.
- **R10 Actions spread noise.** Default 5 ms is from this VM. Tune `RACE_MAX_SPREAD_MS` in Task 6 if
  needed; do not change the helper.

## 14. Build steps (repo root; PATH export first; on any differing output: stop and report, paste it)

Do not start these until Jayami approves this plan. Then implement in this order. Never
`git add -A`.

### Step 0. Branch

The plan-only commit already lives on `feat/2026-10-18-p6-race-framework` @ the plan SHA. After
approval:

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin feat/2026-10-18-p6-race-framework
git checkout feat/2026-10-18-p6-race-framework
git rev-parse --abbrev-ref HEAD   # feat/2026-10-18-p6-race-framework
```

Continue with implementation commits below. Do not recreate the branch from `main` (that would drop
this plan).

### Step 1. Dependencies and scripts

`package.json` scripts (exact):

```json
"test:unit": "node --test tests/unit/*.test.ts",
"race:medusa": "playwright test --project=medusa-race",
"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.races.json",
"check": "npm run format:check && npm run typecheck && npm run k6:inspect && npm run test:unit"
```

Install (from repo root, with skip-browser env):

```bash
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --save-dev @playwright/test@1.64.1 pg@8.23.1 @types/pg@8.23.1
```

Create `.npmrc` with a single line `playwright_skip_browser_download=1`.

`tsconfig.races.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "playwright.config.ts"]
}
```

Commit: `build: add playwright, pg and race typecheck project` (paths: `package.json`,
`package-lock.json`, `.npmrc`, `tsconfig.races.json`).

### Step 2. Types + env + prefix + unit tests (no product)

Implement `src/races/types.ts` (schema §8), `src/races/env.ts`, `src/races/prefix.ts`.

`env.ts` skeleton:

```ts
function positiveIntFromEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`TEST BUG: ${name} must be an integer >= 1, got ${raw}`);
  }
  return n;
}

export function raceTrialsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_TRIALS", 5);
}

export function raceMaxSpreadMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_MAX_SPREAD_MS", 5);
}

export function medusaBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MEDUSA_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "http://127.0.0.1:9000").replace(/\/$/, "");
}

export function medusaDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const p6 = env.P6_MEDUSA_DATABASE_URL?.trim();
  if (p6) return p6;
  const harness = env.MEDUSA_DB_URL?.trim();
  if (harness) return harness;
  return "postgres://medusa:medusa@127.0.0.1:5433/medusa";
}
```

`.env.example` add three empty names with comments (never values): `P6_MEDUSA_DATABASE_URL`,
`RACE_TRIALS`, `RACE_MAX_SPREAD_MS`. Comment on `RACE_MAX_SPREAD_MS`: default 5; client-start spread
limit in ms; raise in CI if runners are noisier, do not change the helper.

Unit `tests/unit/env.test.ts` / `prefix.test.ts` as §6.

Command: `npm run test:unit` → all new tests pass (count = however many you wrote in this step;
record it). `npx tsc --noEmit -p tsconfig.races.json` → exit 0.

Commit: `feat(races): add env, prefix and histogram types`.

### Step 3. `fireTogether` + `runTrials` + histogram writer

`fireTogether` skeleton (`src/races/fire-together.ts`):

```ts
export function summariseBody(status: number | null, body: string): string {
  // never JSON.parse; collapse whitespace; cap 200 chars; prefix with status
}

export function dispatchSpreadMs(starts: number[]): number {
  if (starts.length === 0) return 0;
  return Math.max(...starts) - Math.min(...starts);
}

export async function fireTogether(
  n: number,
  makeRequest: (index: number) => Promise<{ status: number; body: string }>,
  options?: { warm?: () => Promise<unknown> },
): Promise<{ requests: RaceRequestResult[]; dispatchSpreadMs: number }> {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("TEST BUG: fireTogether n must be integer >= 1");
  }
  // Warm is a separate function. Never call makeRequest here.
  if (options?.warm) {
    await Promise.all(Array.from({ length: n }, () => options.warm!()));
  }
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const starts: number[] = Array.from({ length: n }, () => 0);
  const pending = Array.from({ length: n }, (_, i) =>
    gate.then(async (): Promise<RaceRequestResult> => {
      const startedAtMs = performance.now();
      starts[i] = startedAtMs;
      try {
        const { status, body } = await makeRequest(i);
        return {
          index: i,
          status,
          bodySummary: summariseBody(status, body),
          startedAtMs,
          endedAtMs: performance.now(),
        };
      } catch (err) {
        return {
          index: i,
          status: null,
          bodySummary: summariseBody(null, err instanceof Error ? err.message : String(err)),
          startedAtMs,
          endedAtMs: performance.now(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  await Promise.resolve(); // queue every waiter on the gate
  release();
  const requests = await Promise.all(pending);
  return { requests, dispatchSpreadMs: dispatchSpreadMs(starts) };
}
```

`runTrials` skeleton (`src/races/run-trials.ts`):

```ts
export async function runTrials<T>(
  trials: number,
  trialFn: (trial: number) => Promise<T>,
): Promise<Array<{ trial: number; ok: boolean; value?: T; error?: string }>> {
  const out = [];
  for (let trial = 1; trial <= trials; trial++) {
    try {
      const value = await trialFn(trial);
      out.push({ trial, ok: true, value });
    } catch (err) {
      out.push({ trial, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
```

`createHistogram` / `writeHistogram` (`src/races/histogram.ts`):

```ts
export function createHistogram(input: {
  caseId: string;
  title: string;
  product: RaceProduct;
  concurrency: number;
  trials: number;
}): RaceHistogram {
  return {
    caseId: input.caseId,
    title: input.title,
    product: input.product,
    commitSha: commitShaFromEnv(),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    trials: input.trials,
    concurrency: input.concurrency,
    statusCounts: {},
    perTrial: [],
    oracle: {},
    dispatchSpreadMs: { min: 0, max: 0, mean: 0 },
    invariantViolations: [],
    verdict: "fail",
  };
}

export async function writeHistogram(histogram: RaceHistogram): Promise<string> {
  // set finishedAt if empty; mkdir results/races; write JSON.stringify(hist, null, 2) + "\n"
  // path results/races/${caseId}.json; never print secrets
}
```

Unit tests §6, including: warm vs `makeRequest` call counts; `createHistogram` completeness.

Command: `npm run test:unit` → previous + new passing.

Commit: `feat(races): add fireTogether, runTrials and histogram writer`.

### Step 4. Postgres oracle (unit tests with a fake Pool)

Implement `src/oracles/pg.ts` as §9. Unit tests must **not** start Postgres. Stub `pg.Pool` and
assert the constructor received `options: "-c default_transaction_read_only=on"`. Test
`assertSelectOnly` / `waitForStable` / `closePool` with stubs.

`assertSelectOnly` cases: `SELECT 1` ok; `  select 1` ok; `INSERT INTO "order"` throw;
`SELECT 1; DELETE FROM "order"` throw (first-statement check is not enough — also reject if `;`
appears after stripping a trailing semicolon, or if
`\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT)\b` matches). Prefer: allow a single
statement, optional trailing `;`, first keyword SELECT, no other SQL keywords.

Commit: `feat(oracles): add read-only pg pool and waitForStable`.

### Step 5. Playwright config + live self-test

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
import { medusaBaseUrlFromEnv } from "./src/races/env.ts";

export default defineConfig({
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  projects: [
    {
      name: "medusa-race",
      testDir: "tests/medusa/races",
      retries: 0,
      use: { baseURL: medusaBaseUrlFromEnv() },
    },
  ],
});
```

If Playwright cannot import `./src/races/env.ts` from the config, inline the default URL in the
config and keep `medusaBaseUrlFromEnv` for the spec. Stop and report if `--list` fails.

Live spec skeleton (`tests/medusa/races/framework-self-test.spec.ts`):

```ts
import { test, expect } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import { createHistogram, writeHistogram } from "../../../src/races/histogram.ts";
import {
  raceTrialsFromEnv,
  raceMaxSpreadMsFromEnv,
  medusaBaseUrlFromEnv,
} from "../../../src/races/env.ts";
import {
  createReadOnlyPool,
  selectRows,
  waitForStable,
  closePool,
} from "../../../src/oracles/pg.ts";
import { readFile } from "node:fs/promises";

const CONCURRENCY = 20;

test.describe.configure({ timeout: 60_000 });

test("framework self-test (unmapped): 20 concurrent GET /health plus oracle", async () => {
  const trials = raceTrialsFromEnv();
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = medusaBaseUrlFromEnv();
  const pool = createReadOnlyPool();
  const histogram = createHistogram({
    caseId: "framework-self-test",
    title: "framework self-test (unmapped)",
    product: "framework",
    concurrency: CONCURRENCY,
    trials,
  });
  try {
    const before = await snapshot(pool);
    const trialResults = await runTrials(trials, async (trial) => {
      const { requests, dispatchSpreadMs } = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}/health`);
          const body = await res.text();
          return { status: res.status, body };
        },
        { warm: () => fetch(`${base}/health`) },
      );
      // per request: status 200 and body OK, else throw
      //   PRODUCT BUG: GET /health HTTP ${status} body=${bodySummary}
      // if dispatchSpreadMs >= spreadLimit throw
      //   TEST BUG: dispatchSpreadMs ${spread} >= ${spreadLimit}
      return { requests, dispatchSpreadMs };
    });

    const one = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    expect(Number(one[0]?.ok)).toBe(1);

    // INSERT probe: SQLSTATE 25006; set histogram.oracle.readOnlySqlstate (see §9)

    const after = await snapshot(pool);
    const leaks: string[] = [];
    for (const table of ["order", "reservation_item", "inventory_level"] as const) {
      if (after[table] !== before[table]) {
        leaks.push(`TEST BUG: ${table} count ${before[table]} -> ${after[table]}`);
      }
    }
    histogram.invariantViolations.push(...leaks);
    histogram.oracle.orderCount = after.order;
    histogram.oracle.reservationItemCount = after.reservation_item;
    histogram.oracle.inventoryLevelCount = after.inventory_level;

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
    // assemble statusCounts, perTrial, dispatchSpreadMs min/max/mean from trialResults
    // Playwright still expect()s trialsOk and leaks.length === 0 so the test fails too
    expect(leaks, leaks.join("; ")).toEqual([]);
    expect(trialsOk).toBe(true);
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
    await closePool(pool);
  }
  const raw = JSON.parse(await readFile("results/races/framework-self-test.json", "utf8"));
  expect(raw.caseId).toBe("framework-self-test");
  expect(raw.title).toBe("framework self-test (unmapped)");
  expect(raw.verdict).toBe("pass");
  expect(raw.trials).toBe(trials);
  expect(raw.concurrency).toBe(20);
  expect(raw.oracle.readOnlySqlstate).toBe("25006");
});
```

`npx playwright test --list --project=medusa-race` → **1 test** in 1 file.

Commit: `test(races): add medusa-race project and unmapped framework self-test`.

### Step 6. CI, README, env example

CI §12 (rename Check only). README: add “Run a race locally” with:

```bash
export PATH="/usr/local/bin:$PATH"
npm run test:unit
npm run up:medusa
RACE_TRIALS=3 npm run race:medusa
npm run down:medusa
```

README must also say, in plain language:

> `dispatchSpreadMs` is how far apart Node started the requests (max start minus min start, in ms).
> It is not the time at which the server received them. A small spread means the client released
> the burst together.

Also: retries 0; histogram under `results/races/` (gitignored); `/health` 200 vs 5xx is PRODUCT
BUG; spread ≥ `RACE_MAX_SPREAD_MS` (default 5) is TEST BUG; mapped cases start in Task 2;
`RACE_MAX_SPREAD_MS` is how CI would loosen the bound without a code change.

Commit: `ci: run unit tests via check and document races`.

## 15. Verification gate (hard gate before any implementation push; paste real output)

PATH export first. Then:

1. `npm run check` → exit 0 (format, both tsc, k6 inspect, unit tests). Record unit pass count.
2. `npm run test:unit` → same pass count, 0 fail. Must include tests named for: spread maths,
   sequential spread, warm does not call `makeRequest`, `createHistogram` schema, histogram-on-fail,
   runTrials-continues, waitForStable fake query, env defaults for `RACE_TRIALS` and
   `RACE_MAX_SPREAD_MS`, select-only reject, pool constructor read-only option, pool close.
3. `npx playwright test --list --project=medusa-race` → 1 test, name contains
   `framework self-test (unmapped)`.
4. `npm run up:medusa` → health 200 as in the probe.
5. `RACE_TRIALS=3 npm run race:medusa` → **1 passed**, 0 failed, 0 flaky, retries not mentioned.
   `results/races/framework-self-test.json` exists, `trials` is 3, `concurrency` is 20,
   `statusCounts["200"]` is 60 (3×20), `verdict` is `pass`, `dispatchSpreadMs.max` <
   `RACE_MAX_SPREAD_MS` (5 unless overridden), `oracle.readOnlySqlstate` is `"25006"`, `oracle` has
   the three counts.
6. `npm run down:medusa` → exit 0.
7. `git diff --name-only` must not include `products/`, harness source, or the Medusa fork.

If step 5 fails, classify PRODUCT BUG vs TEST BUG with status+body or SQLSTATE, stop, do not retry.

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

Plan-only commit (this Cursor task):

1. `docs: add p6 phase 1 task 1 race framework plan` —
   `docs/plans/2026-10-18-p6-phase1-task1-race-framework.md` only

After Jayami approves the plan (implementation, later commits on this branch):

2. `build: add playwright, pg and race typecheck project`
3. `feat(races): add env, prefix and histogram types`
4. `feat(races): add fireTogether, runTrials and histogram writer`
5. `feat(oracles): add read-only pg pool and waitForStable`
6. `test(races): add medusa-race project and unmapped framework self-test`
7. `ci: run unit tests via check and document races`

No merge, tag or force-push. No Co-Authored-By. No `Generated with` / attribution lines. No
CodeRabbit from the builder (Jayami runs review). Never the Bridge-bss account.

## 17. Docs

- This plan file.
- `README.md` section §14 Step 6 (how to run races; histogram path; what `dispatchSpreadMs`
  measures; PRODUCT BUG vs TEST BUG; `RACE_MAX_SPREAD_MS`; Task 2 starts mapped cases).
- `.env.example` names only.
- No ADR in Task 1. No master-plan HTML edits.

## 18. Will NOT do

- No mapped case IDs, no `P6-MED-RACE-001`, no Cal/Documenso/Twenty race specs
- No empty `src/races/{cal,doc,med,tw}.ts` stubs (OQ3)
- No new required GitHub check, no `races` CI job, no histogram artefact upload (Task 6)
- No separate CI unit-test step (OQ4); unit tests run through `npm run check` only
- No k6 scenario/threshold/dashboard work
- No fork or harness edits; no `medusa develop` by hand; no compose edits
- No browser download, page objects, UI assertions, `waitForTimeout`, retries, or `workers` > 1 on
  race projects
- No successful writes to Postgres; no `TRUNCATE`; no logging of database URLs
- No inventing RTM IDs; self-test stays unmapped
- No published RPS/p95 from this VM
- No Co-Authored-By / Generated-with / force-push / merge
- No `options.warm: boolean` that reuses `makeRequest`
- No `{} as RaceHistogram`

## 19. Open questions for Jayami

None remaining. OQ1–OQ4 were answered 2026-10-18 and are recorded as:

1. **OQ1** Histogram `caseId` `framework-self-test` (file `results/races/framework-self-test.json`)
   is OK.
2. **OQ2** Keep 5 ms as the default via `RACE_MAX_SPREAD_MS`. Raise the env in CI later if Actions
   is noisier; do not change the helper.
3. **OQ3** No empty `cal` / `doc` / `med` / `tw` stubs. Product files belong to Tasks 2–5.
4. **OQ4** Run unit tests only through `npm run check` in CI. Drop the separate “Unit tests (no
   product)” step; rename the Check step.

Probe is done. Building waits on approval of this plan.
