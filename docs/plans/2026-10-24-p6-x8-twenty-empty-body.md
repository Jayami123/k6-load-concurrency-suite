# P6 X8: guarded spec for P6-OBS-TW-001 (Twenty empty-body hang), build plan

Branch `feat/2026-10-24-p6-twenty-empty-body` from `origin/main` `ad14c6a`. The plan is the first commit on that branch. No PR yet. Source of
truth: [`docs/BACKLOG.md`](../BACKLOG.md) (follow-up X8 and the `P6-OBS-TW-001` entry, PRODUCT BUG, owner label 2026-10-23, not relabelled here).
Structure and depth follow the Task 7 plan, [2026-10-23-p6-phase2-task7-twenty-races.md](2026-10-23-p6-phase2-task7-twenty-races.md)
(§3.9 is the original repro, §8 the job budget). Harness pin stays `v0.2.12`; nothing here reads or pins harness `main` (H3 is Phase 3).

Probe date: 2026-10-23 (cloud VM, Docker, Node 22.23.3, 4 vCPU, 16 GB). Probe scripts and outputs are outside the repo, in the session scratchpad
`/tmp/claude-0/-home-user-k6-load-concurrency-suite/ce2fd330-81dd-5992-9eb8-3a76642ad74d/scratchpad/probe/` (not committed): `probe-x8.mjs`
(the probe), `auth.out`, `unauth.out`, `parallel.out`, `fetchcheck.out`, `watch.out`, `all-since-probe.log` (server log), `exit-codes.txt`,
`check-baseline.log`.

## 0. Status

Version 2 of this plan, after the owner's review of version 1 (`f458060`): **approved**, with the answers in §0.1. The build follows §7 on the feature branch.
**Build status (2026-10-24):** steps 0b to 6 are committed on the feature branch and PR [#50](https://github.com/Jayami123/k6-load-concurrency-suite/pull/50) is open. Unit tests 452 → 470.
Live run: 10 passed (8 expected failures, 2 passes). Details in §12.
Version 1 stopped for review under rule 10 (the plan adds a CI job, and the spec carries a product-bug label).

The live probe found **no difference from the backlog evidence** on the pinned image: the hang reproduces (24 of 24 empty and `{}` requests),
`{"foo":1}` and a valid query answer fast, and the server log has no line for any hang. Two results are new and are reported in §3: the
**unauthenticated** requests hang identically (§3.2), and **10 and 20 held hung requests do not slow a valid query** (§3.3, §3.4), so the
stop condition in the brief ("hung requests DO block valid ones") did not trigger.

### 0.1 Owner decisions applied in this version

Recorded from the owner's review message of this session. Only these are owner answers (rule 20e).

- **Q1** The unauthenticated hang is **confirmed as the same PRODUCT BUG `P6-OBS-TW-001`, with a wider precondition**. All 4 unauthenticated tests stay.
  The BACKLOG entry gains: unauthenticated clients can hold sockets open indefinitely (0 of 20 closed after 400 s, past Node's 300 s `requestTimeout`).
- **Q2** The plan commit is also pushed to `plan/2026-10-24-p6-twenty-empty-body` (rule A10, no PR for it). The build continues on `feat/2026-10-24-p6-twenty-empty-body`.
- **Q3** The existing budget convention stays. **Option (b)**: new job `twenty-obs`, timeout 27, worst case 16.43, margin 10.57. **Option (c) is rejected.**
- **Q4** BACKLOG X8 is flipped to done in the branch's last commit (step 6).
- **Q5** Socket-count check only (D8). No company-row check.
- **Q6** The spec asserts **any 4xx** and says why in a comment (the label is about the hang, any 4xx ends it); the BACKLOG wording changes from "400" to "4xx". The post-abort query stays inside
  the resource test (D7). The README "Known product bugs" table gets rows for `P6-OBS-TW-001` and `P6-TW-RACE-004` (Q7 of version 1, now in scope; §9).
- **Review instructions for the build:** live-run the spec through the harness before the PR and record outcomes and times; `npm run check` exits 0; PR title
  `test(twenty): add the guarded empty-body hang spec (x8)`; no owner name, footers or trailers; `git add` by path; no force-push.

## 1. Goal, scope and the cases covered

- **Goal (BACKLOG X8).** A P6 spec for `P6-OBS-TW-001` that (a) proves, with guards, that the server is otherwise healthy, (b) then asserts, under
  `test.fail()`, that an empty body and `{}` get a 4xx within a 5-second client timeout, never a hang, and (c) checks that a stack of hung
  requests does not stop a valid request from answering. The unauthenticated probe (also in X8 (c)) was run first (§3.2).
- **Done when (BACKLOG X8).** "The spec is merged and CI runs it." The job that runs it is chosen in §8.
- **Cases.** 10 Playwright tests, no unit-test count mixed in:
  - 8 hang tests, one per endpoint × body × auth mode that hangs: `/metadata` and `/graphql` × empty body and `{}` × authenticated and without
    `Authorization`. The 4 authenticated ones are the owner-labelled bug as written. The 4 unauthenticated ones are the same bug with a wider
    precondition and need the owner's confirmation (Q1).
  - 2 resource tests, one per endpoint: ten parallel hung empty-body requests in flight, then a valid query answers 200 under the guard time;
    after the abort a valid query still answers and no socket is left. Passing tests, no `test.fail()`.
- **Not tests (rule: one test per distinct behaviour).** `{"foo":1}` and the valid query are guards inside each test, not separate tests.
  No merging or splitting to hit a count.
- **In scope.** `src/twenty/timed-post.ts` (NEW) with 18 unit tests; `tests/twenty/tw-obs/` (NEW, 3 files); `playwright.config.ts` and
  `package.json` (CHANGED); `.github/workflows/perf.yml` (CHANGED: new job `twenty-obs`); `README.md` and `docs/BACKLOG.md` (CHANGED).
- **Out of scope.** Harness or pin changes; `scripts/evidence-token-scan.mjs` (X6); `twenty-smoke` and `twenty-races` (untouched); the cause of
  the hang (not read in this task); other methods or content types; any change to a job timeout or an existing step cap.

## 2. Assumptions the build depends on

| #   | Assumption                                                                                              | Probe result                                                                              |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A1  | The hang still reproduces on the pinned image (`twentycrm/twenty:v2.44.0`, digest `sha256:01fb6d2c…`)   | **Yes**: 12 of 12 authenticated, 12 of 12 unauthenticated (§3.1, §3.2)                    |
| A2  | `{"foo":1}` gets a 400 and a valid query a 200, each in well under 1 s, with and without auth           | **Yes**: 400 in 2.9 to 14.6 ms, 200 in 2.7 to 15.1 ms in every run (§3.1, §3.2)           |
| A3  | `fetch` with `AbortSignal.timeout(5000)` aborts a hung request at 5 s with `TimeoutError`               | **Yes**: 4 of 4 at 5001 to 5003 ms; other bodies answer (§3.5)                            |
| A4  | Ten held hung requests on an endpoint do not slow a valid query on that endpoint or the other endpoint  | **Yes**: 3.0 to 8.5 ms with 10 held; 5.5 to 14.0 ms with 20 held for 400 s (§3.3, §3.4)   |
| A5  | Aborting the hung requests frees the server: a valid query answers 4.4 to 8.0 ms afterwards             | **Yes** (§3.3, §3.4)                                                                      |
| A6  | The server closes a hung socket by itself at some point                                                 | **No**, 0 of 20 closed in 400 s, past Node's 300 s `requestTimeout` default (§3.4)        |
| A7  | A hung request leaves no server log line                                                                | **Yes** (§3.6)                                                                            |
| A8  | The seed login (`signInWorkspace`) works for the spec and no extra data is needed                       | **Yes**: the probe used `src/twenty/auth.ts` after `npm run seed:twenty`                  |
| A9  | A client built on `node:http` with its own `Agent` can count its in-flight sockets and reach 0 on abort | **Yes** in a scratch prototype: 200 of 200 abort loops ended with 0 active sockets (§6.1) |

## 3. Probe results (2026-10-23, live app)

### 3.0 Commands and exit codes

| #   | Command (in this order)                                           | Exit | Wall time | What it proves                                                                  |
| --- | ----------------------------------------------------------------- | ---- | --------- | ------------------------------------------------------------------------------- |
| 1   | `npm run check` on `origin/main` `ad14c6a` (baseline)             | 0    | 28 s      | **452** unit tests pass (`# tests 452`, `# pass 452`, `# fail 0`)               |
| 2   | `bash scripts/bootstrap.sh twenty`                                | 0    | seconds   | `products/twenty-CRM` was an empty directory; cloned at `TWENTY_REF` `7cbdfec…` |
| 3   | `npm run up:twenty`                                               | 0    | 3 m 07 s  | Stack up (images pulled inside `up`); image digest `sha256:01fb6d2c…`           |
| 4   | `npm run seed:twenty`                                             | 0    | 81 s      | `created=true users=4`                                                          |
| 5   | `probe-x8.mjs auth` (24 requests, 30 s timeout)                   | 0    | 6 m 00 s  | §3.1                                                                            |
| 6   | `probe-x8.mjs unauth` (24 requests, 30 s timeout)                 | 0    | 6 m 00 s  | §3.2                                                                            |
| 7   | `probe-x8.mjs parallel` (N=10 per endpoint, 2 s hold)             | 0    | 4 s       | §3.3                                                                            |
| 8   | `probe-x8.mjs fetchcheck` (`fetch` + `AbortSignal.timeout(5000)`) | 0    | 20 s      | §3.5                                                                            |
| 9   | `probe-x8.mjs watch 400` (10 held per endpoint, 400 s)            | 0    | 6 m 40 s  | §3.4                                                                            |
| 10  | `npm run down:twenty`                                             | 0    | 2.2 s     | Stop; `docker ps -a` shows no container left                                    |

The stack was started and stopped only with `npm run up:twenty` and `npm run down:twenty`. Row 2 is the harness's own bootstrap script (the
checkout was empty in this session). Read-only inspection: `docker logs` (§3.6) and one `docker exec` that counted established connections
(§3.4). The probe is a plain `node:http` client (keep-alive `Agent`, `Content-Length` always sent, so an empty body is `Content-Length: 0`), with
TTFB measured at the `response` event. It never prints a token or the seed password. It printed Node's `MaxListenersExceededWarning` because
it adds socket listeners on reused keep-alive sockets; that is a probe artefact, not a product signal.

### 3.1 P6-OBS-TW-001, authenticated: 3 runs per cell, 30 s client timeout

Workspace bearer token from `signInWorkspace`; `Content-Type: application/json`. Times are total ms; TTFB is the first response byte.

| Endpoint    | Empty body                                         | `{}`                                               | `{"foo":1}`                                            | Valid `{"query":"{ __typename }"}`                         |
| ----------- | -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `/metadata` | **no response** ×3: 30021, 30031, 30028; TTFB none | **no response** ×3: 30028, 30031, 30031; TTFB none | **400** ×3: TTFB 14.0, 7.3, 8.7 (total 14.6, 7.7, 9.4) | **200** ×3: TTFB 12.3, 8.5, 7.5 (total 12.6, 8.8, 7.8)     |
| `/graphql`  | **no response** ×3: 30002, 30030, 30032; TTFB none | **no response** ×3: 30031, 30031, 30031; TTFB none | **400** ×3: TTFB 9.9, 7.0, 9.9 (total 10.2, 7.4, 10.3) | **200** ×3: TTFB 14.8, 10.0, 10.9 (total 15.1, 10.4, 11.1) |

The 400 body is 76 bytes (`{"errors":[{"message":"Unexpected parameter \"foo\" in the request body."}]}`), the 200 body 31 bytes
(`{"data":{"__typename":"Query"}}`). A hung request received 0 bytes. **12 of 12 hang; the backlog evidence is reproduced exactly** (Task 7 §3.9:
12 of 12, 400 in 4 to 9 ms, 200 in 5 to 12 ms).

### 3.2 The same four bodies without `Authorization`

| Endpoint    | Empty body                                         | `{}`                                               | `{"foo":1}`                                          | Valid query                                          |
| ----------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `/metadata` | **no response** ×3: 30018, 30032, 30031; TTFB none | **no response** ×3: 30031, 30001, 30031; TTFB none | **400** ×3: TTFB 6.2, 3.5, 3.9 (total 7.5, 3.8, 4.2) | **200** ×3: TTFB 5.0, 2.8, 4.4 (total 5.3, 3.0, 4.6) |
| `/graphql`  | **no response** ×3: 30001, 30012, 30031; TTFB none | **no response** ×3: 30031, 30016, 30030; TTFB none | **400** ×3: TTFB 4.0, 3.1, 2.3 (total 4.3, 3.3, 2.9) | **200** ×3: TTFB 3.2, 2.5, 2.6 (total 3.5, 2.7, 2.7) |

**Same hang, no precondition on credentials: 12 of 12.** The two guards also hold without auth (the 400 and 200 bodies are identical to §3.1). This
is the "unauth shows the same hang" branch of the brief, so the 4 unauthenticated tests are added under the same pattern. It is the same bug with
a **wider precondition (unauthenticated)**; the owner confirms the label at plan review (Q1). Nothing in the evidence differs from the label's
basis, but the exposure is larger: any anonymous client can hold a connection open.

### 3.3 Parallel check: N=10 empty-body requests held per endpoint, 2 s

For each endpoint: baseline (3 valid queries), then 10 authenticated empty-body requests opened and held 2 s, then 3 valid queries on the same
endpoint, 3 on the other endpoint, one `{"foo":1}`, then all 10 aborted by the client, then 3 valid queries.

| Held on     | Baseline (ms)  | Valid, same endpoint, 10 held (ms) | Valid, other endpoint, 10 held (ms) | `{"foo":1}` with 10 held | Held requests after abort    | Valid after abort (ms)  |
| ----------- | -------------- | ---------------------------------- | ----------------------------------- | ------------------------ | ---------------------------- | ----------------------- |
| `/metadata` | 11.7, 4.9, 5.1 | 6.3, 4.3, 5.1 (all 200)            | 8.5, 8.0, 5.5 (all 200)             | 400 in 4.2 ms            | 10 of 10 `aborted` at 2.05 s | 7.1, 6.2, 5.5 (all 200) |
| `/graphql`  | 5.6, 6.2, 6.6  | 6.8, 4.6, 4.1 (all 200)            | 3.8, 3.7, 3.0 (all 200)             | 400 in 4.1 ms            | 10 of 10 `aborted` at 2.03 s | 6.8, 6.1, 7.9 (all 200) |

**Hung requests do not block valid ones.** Largest valid-query time with 10 held: 8.5 ms.

### 3.4 Does the server ever close a hung socket? 20 held for 400 s

10 empty-body requests on each endpoint (20 sockets), held 400 s, client timeout set above that (460 s) so only the server could end them.

- **Server closed 0 of 20 sockets in 400 s.** No `end` and no `close` from the server side on any of them. 400 s is past Node's default
  `requestTimeout` (300 s), so the hang is not subject to that timer either. Every request stayed open until the client aborted it
  (`aborted` at 400.09 s for all 20).
- **Valid queries at 400 s, with 20 held:** `/metadata` 14.0, 5.5, 6.4 ms; `/graphql` 7.2, 7.0, 6.2 ms (all 200). **Largest valid-query time seen
  with hung requests in flight, anywhere in the probe: 14.0 ms.**
- **After the abort:** `/metadata` 8.0, 4.7, 6.4 ms; `/graphql` 4.6, 4.4, 6.1 ms (all 200).
- **Server side:** after the probe process exited, `docker exec … /proc/net/tcp` counted **0** established connections to the app port, so the aborted
  sockets are closed on the server too (one read, not a continuous trace).
- Consequence for the spec: a hung request that a test does not abort pins a server socket for as long as the client keeps it, so every hung
  request is aborted in `finally` (§4 D8).

### 3.5 The client the spec will use: `fetch` with `AbortSignal.timeout(5000)`

| Endpoint    | Empty body                | `{}`                      | `{"foo":1}`  | Valid query |
| ----------- | ------------------------- | ------------------------- | ------------ | ----------- |
| `/metadata` | `TimeoutError` at 5003 ms | `TimeoutError` at 5001 ms | 400 in 10 ms | 200 in 9 ms |
| `/graphql`  | `TimeoutError` at 5001 ms | `TimeoutError` at 5001 ms | 400 in 13 ms | 200 in 8 ms |

The hang is not an artefact of the probe's raw `node:http` client: a plain `fetch` hangs the same way, and the 5-second timeout turns the hang into
a fast, unambiguous failure (4 × 5 s = 20 s for the whole matrix).

### 3.6 Server log (the hang leaves no line)

`docker logs --since/--until` with whole-second timestamps (the Task 7 note: fractional seconds returned nothing here). From the start of the
probe to the end, **8 lines in total, all of one kind**: `WARN 2 workspaces found in database. In single-workspace mode…` followed by `WARN undefined`.
Four such pairs, at 21:38:54, 21:51:13, 21:51:28 and 21:51:48, which are the second of the `signIn` of each probe process (auth, parallel,
fetchcheck, watch). The unauthenticated run did no sign-in and its 6-minute window (21:44:58 to 21:51:05) has **0 lines**. **No line was written for
any of the 68 hung requests (12 + 12 in the two matrices, 20 held for 2 s, 4 through `fetch`, 20 held for 400 s) or for the 400 and 200 requests.** This also attributes the two WARN lines that Task 7 §3.9 could not attribute: they come from sign-in.

### 3.7 What the probe proves, and what it does not

- **Proves.** The hang reproduces on the pinned image, with and without auth, on both endpoints, for an empty body and `{}`; only those two bodies hang
  of the four tried; the server stays responsive with 10 and 20 hung requests in flight; the server does not end a hung request within 400 s; aborting
  frees the sockets; `fetch` + `AbortSignal.timeout` is a valid client for the spec; no log line marks the hang.
- **Does not prove.** The cause (no source read); behaviour with N above 20 (descriptor or worker limits are untested); other methods, content types or
  paths; a hang longer than 400 s; CI behaviour (runner speed). The 14.0 ms and 8.5 ms figures are one VM's numbers and are used only to set a
  threshold with headroom (§4 D4), never published.

### 3.8 Differences from the backlog evidence

None for the labelled behaviour. New facts: unauthenticated hangs (§3.2); N=10 and N=20 do not block (§3.3, §3.4); server never closes within 400 s
(§3.4); the WARN lines come from sign-in (§3.6). No stop was needed (the brief's stop conditions are "it now answers", "unauth behaves differently" in
the sense of a different outcome, and "hung requests block valid ones"; none occurred).

## 4. Design and decisions (each with a reason)

- **D1 Location: `tests/twenty/tw-obs/`, Playwright project `twenty-tw-obs`, script `test:twenty-obs`.** `tests/twenty/tw-races/` is the race project
  (trial counts, histograms, `RACE_TRIALS`) and `tests/twenty/races/` is the smoke self-test. This spec has no trials and no histogram, so it
  gets its own directory and project, the same reason Task 7 gave for `tw-races`. No better location found. The script is named `test:` (as
  `test:documenso-api`), not `race:`, because it is not a race.
- **D2 One test per endpoint × body × auth mode (8), plus one resource test per endpoint (2).** The 8 hang tests are separate behaviours (each
  can be fixed independently, e.g. a fix for `{}` but not for the empty body). `{"foo":1}` and the valid query are guards, not tests.
- **D3 Client: `node:http` with a per-test keep-alive `Agent`, not `fetch`.** Reason: the leak check needs to count in-flight sockets
  (`Agent.sockets` and `Agent.requests`), and TTFB is wanted. §3.5 shows `fetch` + `AbortSignal.timeout` hangs identically, so nothing is
  hidden by the choice. The 5-second limit is still `AbortSignal.timeout(5000)` (the brief); an explicit `AbortController` is combined with it
  (`AbortSignal.any`) so a test can abort on demand and the helper can tell `timeout` from `aborted`.
- **D4 Time thresholds, with the arithmetic.**
  - **Guard time: 1000 ms** for the valid query and for `{"foo":1}` (brief: "each under 1 s"). Largest guard-type time seen in the whole probe:
    15.1 ms (§3.1, `/graphql` valid query). 1000 / 15.1 = **66×** headroom for a slower CI runner, while a real stall (a hang lasts 5 s or more) is still
    5× or more above the bound.
  - **Resource threshold: the same 1000 ms** for a valid query while 10 requests are hung and after they are aborted. Largest valid-query time with
    hung requests in flight: 14.0 ms (§3.4). 1000 / 14.0 = **71×** headroom. Using the guard value (not a looser one) means the resource test
    asserts "no slower than the healthy server", which is the claim. If the hung requests did block the server, the valid query would not answer
    within its own 5 s client timeout, and the test would fail on `outcome` before the time check.
  - **Hang limit: 5000 ms** (brief). A 4xx must arrive before the `AbortSignal.timeout(5000)` fires.
- **D5 Order inside each hang test (never inside `test.fail()` until the last step).**
  1. Guards: valid query 200 and `{"foo":1}` 400, each under 1 s, same endpoint, same auth mode.
  2. Measure: the empty-body or `{}` request with the 5-second timeout.
  3. Checks that stay red if they fail: no socket is left in flight after the request ended (leak check), and the outcome is either a hang or a 4xx.
     A 5xx, a connection error or a 2xx is a **different finding**, not `P6-OBS-TW-001`, and must not be hidden by `test.fail()`.
  4. The ID-first annotation, `test.info().annotations.push({ type: "issue", description: "P6-OBS-TW-001: PRODUCT BUG …" })`. The text before the
     first colon is the ID, which `src/ci/playwright-json-summary.ts` uses as the issue id, so all eight tests group under one id in the job summary.
  5. `test.fail()`.
  6. The strict assertion: the outcome is a 4xx response (and its time is under 5000 ms). It fails today (the request hangs), so the test is an
     expected failure. A fix makes it pass and Playwright reports "expected to fail but passed" (red), which is the intended signal to remove
     `test.fail()` and the label together (BACKLOG rule, as for F-C1).
- **D6 Unauthenticated tests** use the same pattern and the same ID (`P6-OBS-TW-001: PRODUCT BUG (no Authorization header) …`). Their guards also hold
  without auth (§3.2). They are added as proposed; if the owner rejects Q1 the 4 tests are removed and nothing else changes.
- **D7 Resource test (passing, no `test.fail()`), per endpoint.**
  1. Baseline guards (as D5.1).
  2. Open 10 authenticated empty-body requests (`HELD_REQUESTS = 10`, client timeout 30 s so they cannot end by themselves during the test),
     wait until the client reports 10 sockets in flight (poll 25 ms, up to 2 s, else TEST BUG), then a fixed 500 ms settle so the server has the
     requests (the probe held 2 s; the settle is shorter because the claim is about the server's state after receiving them, and the 10 sockets
     are connected and written to within milliseconds on loopback).
  3. Assert exactly 10 are still in flight, then send a valid query on the same endpoint: 200 and under 1000 ms.
  4. Abort all 10; assert every one ended as `aborted` (none answered or was closed by the server while held), the client has 0 in-flight sockets,
     and a valid query still answers 200 under 1000 ms.
     Steps 3 and 4 share step 2's ten requests, so they are one test (the cost of a second hold is the reason, not a count). Held on one endpoint,
     the valid query goes to the same endpoint (the stricter case); §3.3 also showed the other endpoint is unaffected.
- **D8 Every hung request is aborted in `finally`; no socket leaks between tests.** Each test makes its own client and calls `client.destroy()` in
  `finally` (this destroys any request still in flight). In the resource test the ten handles are also aborted explicitly in `finally`, and the
  leak assertion runs **after** the cleanup. The socket count (`activeSockets()`) is asserted inside the test body, before `test.fail()`, never in an
  `afterEach` hook (an assertion in a hook of a `test.fail()` test would be inverted and could hide a leak).
- **D9 No company-row leak check.** The existing leak check (`companyRowsByPrefix`, Task 7 D16) counts records created by a case. This spec creates
  nothing (no company, no member, no prefix-named row), the same position as the Twenty self-test ("this test writes nothing", D9 there), so that
  check would be a check that cannot fail. The leak that exists for this spec is open sockets, which §D8 asserts on the client side and §3.4 checked on
  the server side once. Q5 asks the owner to confirm.
- **D10 Secrets.** The helper returns status, outcome and times only; it never stores a request or response body, and an error message is the
  `Error.message` of the transport, never a header. The bearer token is held in memory in `ObsContext` and passed as a header. The seed password is read
  by `twentyPasswordFromEnv()` inside `signInWorkspace` and never printed. The new job runs the same token scan as `twenty-races` over the container
  log, the harness log and the Playwright JSON before anything is uploaded.
- **D11 4xx, not only 400.** The brief says "a 4xx". BACKLOG X8 (b) says "a 400". The spec asserts any 4xx: the label is about the hang, and a 411 or
  a 422 would be as good a fix as a 400. Recorded as a deviation in §11.1.
- **D12 One unasserted warm-up query per endpoint** in `setupObs()` (like the race specs' warm-up). The guards that follow assert the same query, so
  nothing is weakened; the warm-up only keeps a cold first request from failing a 1-second guard on a slow runner.
- **D13 Chosen CI home: a new job `twenty-obs` (timeout 27 min).** §8 shows why a new step in `twenty-races` fails the 10-minute rule, and what the
  other options cost.

## 5. Files (exact paths)

| Path                                                            | Status  | Step | Notes                                                                    |
| --------------------------------------------------------------- | ------- | ---- | ------------------------------------------------------------------------ |
| `src/twenty/timed-post.ts`                                      | NEW     | 1    | `createPostClient`, `classify`, types (§6.1)                             |
| `tests/unit/twenty-timed-post.test.ts`                          | NEW     | 1    | 18 tests (§6.2): 13 client, 5 classify                                   |
| `tests/twenty/tw-obs/shared.ts`                                 | NEW     | 2    | constants, `setupObs`, `assertGuards`, `measureHang`, `waitUntil` (§6.3) |
| `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts`        | NEW     | 2    | 8 hang tests (§6.4)                                                      |
| `playwright.config.ts`                                          | CHANGED | 2    | project `twenty-tw-obs`                                                  |
| `package.json`                                                  | CHANGED | 2    | script `test:twenty-obs`                                                 |
| `tests/twenty/tw-obs/tw-obs-001-hung-requests-resource.spec.ts` | NEW     | 3    | 2 resource tests (§6.5)                                                  |
| `.github/workflows/perf.yml`                                    | CHANGED | 4    | new job `twenty-obs` (§8); `twenty-smoke` and `twenty-races` untouched   |
| `README.md`                                                     | CHANGED | 5    | "Twenty empty-body spec" section and run line (§9)                       |
| `docs/BACKLOG.md`                                               | CHANGED | 5, 6 | step 5: describe the spec; step 6: X8 done with the PR number            |
| `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md`              | CHANGED | 6    | closeout filled in (§12)                                                 |

Unchanged: `src/twenty/auth.ts` (`signInWorkspace`), `src/twenty/env.ts` (`twentyBaseUrlFromEnv`, `twentyEmailFromEnv`, `twentyPasswordFromEnv`,
`twentyWorkspaceNameFromEnv`), `src/races/*`, `src/ci/*`, `scripts/*` (including `scripts/ci/compose-pull.sh`, used by the new job as it is),
`tests/twenty/races/`, `tests/twenty/tw-races/`, the harness pin.

## 6. Code skeletons and tests (each new function and test)

Imports use the repo's `.ts` extension style. The skeleton in §6.1 was run in a scratch prototype (outside the repo): `tsc --strict` with the repo's
compiler options exits 0, and against local servers (silent, 400-answering, socket-closing) it gave the outcomes in the tests below, with 0 failures
in a 200-iteration abort loop that asserts `activeSockets() === 0` right after each abort.

### 6.1 `src/twenty/timed-post.ts` (NEW, step 1)

```ts
import http from "node:http";

export type PostOutcome = "response" | "timeout" | "aborted" | "error";

export interface TimedPostResult {
  outcome: PostOutcome;
  status: number | null;
  ttfbMs: number | null;
  totalMs: number;
  /** Transport error text only (never a header or a body). Present when outcome is "error". */
  error?: string;
}

export interface PostOptions {
  authorization?: string;
  timeoutMs: number;
}

export interface PostHandle {
  result: Promise<TimedPostResult>;
  /** No-op once the request has ended. */
  abort(): void;
}

export interface PostClient {
  start(path: string, body: string, opts: PostOptions): PostHandle;
  post(path: string, body: string, opts: PostOptions): Promise<TimedPostResult>;
  /** Sockets in use plus requests waiting for one. Idle keep-alive sockets are not counted. */
  activeSockets(): number;
  /** Destroys every socket, including requests still in flight. */
  destroy(): void;
}

export type PostClass = "hang" | "client-error" | "server-error" | "ok" | "error";

/** hang = the client timeout fired; "error" covers transport errors and a caller abort (neither is a server answer). */
export function classify(r: Pick<TimedPostResult, "outcome" | "status">): PostClass {
  if (r.outcome === "timeout") return "hang";
  if (r.outcome !== "response" || r.status === null) return "error";
  if (r.status >= 500) return "server-error";
  if (r.status >= 400) return "client-error";
  return "ok";
}

const countOf = (m: NodeJS.ReadOnlyDict<unknown[]>): number =>
  Object.values(m).reduce((n, list) => n + (list?.length ?? 0), 0);

/**
 * One keep-alive Agent per client, so a test owns its sockets and can count and destroy them.
 * The result resolves from the request's "close" event plus one setImmediate, after the Agent has
 * released the socket, so activeSockets() is already accurate when the promise settles.
 * `Content-Length` is always sent, so an empty body is `Content-Length: 0`.
 */
export function createPostClient(baseUrl: string): PostClient {
  const url = new URL(baseUrl);
  const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });

  const start = (path: string, body: string, opts: PostOptions): PostHandle => {
    const began = performance.now();
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (opts.authorization) headers.Authorization = opts.authorization;
    let done = false;
    const result = new Promise<TimedPostResult>((resolve) => {
      let status: number | null = null;
      let ttfbMs: number | null = null;
      let ended = false;
      let error: string | undefined;
      const req = http.request({
        host: url.hostname,
        port: url.port,
        path,
        method: "POST",
        headers,
        agent,
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      req.on("response", (res) => {
        status = res.statusCode ?? null;
        ttfbMs = performance.now() - began;
        res.on("end", () => {
          ended = true;
        });
        res.resume();
      });
      req.on("error", (err) => {
        error = err.message;
      });
      req.on("close", () => {
        setImmediate(() => {
          done = true;
          const outcome: PostOutcome = ended
            ? "response"
            : timeout.aborted
              ? "timeout"
              : controller.signal.aborted
                ? "aborted"
                : "error";
          resolve({
            outcome,
            status: ended ? status : null,
            ttfbMs: ended ? ttfbMs : null,
            totalMs: performance.now() - began,
            ...(outcome === "error" && error ? { error } : {}),
          });
        });
      });
      req.end(body);
    });
    return {
      result,
      abort: () => {
        if (!done) controller.abort();
      },
    };
  };

  return {
    start,
    post: (path, body, opts) => start(path, body, opts).result,
    activeSockets: () => countOf(agent.sockets) + countOf(agent.requests),
    destroy: () => agent.destroy(),
  };
}
```

### 6.2 `tests/unit/twenty-timed-post.test.ts` (NEW, step 1): 18 tests

Shared scaffolding (a local `node:http` server on `127.0.0.1:0`, no product needed; every server and client is closed in `afterEach`):

```ts
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { classify, createPostClient, type PostClient } from "../../src/twenty/timed-post.ts";

const servers: http.Server[] = [];
const clients: PostClient[] = [];

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function clientFor(url: string): PostClient {
  const c = createPostClient(url);
  clients.push(c);
  return c;
}
const silent: http.RequestListener = () => {}; // reads the request, never answers
const answer =
  (status: number, body = "{}"): http.RequestListener =>
  (_req, res) => {
    res.statusCode = status;
    res.end(body);
  };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const c of clients.splice(0)) c.destroy();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
});
```

`describe("classify")`, 5 tests (one per class, so a mapping change shows which class moved):

1. `timeout` → `"hang"`: `classify({ outcome: "timeout", status: null })`.
2. A 4xx response → `"client-error"`: `{ outcome: "response", status: 400 }` and `499`.
3. A 5xx response → `"server-error"`: `{ outcome: "response", status: 500 }`.
4. A 2xx response → `"ok"`: `{ outcome: "response", status: 200 }`.
5. A transport error and a caller abort → `"error"`: `{ outcome: "error", status: null }` and `{ outcome: "aborted", status: null }`.

`describe("createPostClient")`, 13 tests:

1. **Reports status and timings for a normal response.** `answer(400)`; `post("/x", "{}", { timeoutMs: 1000 })`; `outcome "response"`, `status 400`,
   `ttfbMs` and `totalMs` numbers, `ttfbMs <= totalMs`, no `error`.
2. **Sends the Authorization header when given.** Handler records `req.headers.authorization`; call with `authorization: "Bearer t"`; assert it equals `"Bearer t"`.
3. **Omits Authorization when none is given.** Same handler, no option; assert `undefined`.
4. **An empty body is `Content-Length: 0` with no body bytes.** Handler records `content-length` and the bytes read; assert `"0"` and `""`.
5. **A non-empty body arrives intact with a JSON content type.** Body `'{"foo":1}'`; assert body equals it, `content-type` is `application/json`, `content-length` is `"9"`.
6. **A silent server ends as `timeout`, never a throw.** `silent`, `timeoutMs: 150`; `outcome "timeout"`, `status null`, `ttfbMs null`, `150 <= totalMs < 1000`.
7. **`abort()` on an in-flight request ends it as `aborted`.** `silent`, `timeoutMs: 5000`; `const h = c.start(...)`; `await wait(50)`; `h.abort()`; `outcome "aborted"`, `totalMs < 1000`.
8. **`abort()` after the request ended is a no-op.** `answer(200)`; `await h.result`; `h.abort()`; the awaited result is still `"response"` and a second `post` on the same client still answers.
9. **A server that closes the socket without answering ends as `error`, with the transport message.** Handler `(req) => req.socket.destroy()`; `outcome "error"`, `status null`, `typeof error === "string"`.
10. **`activeSockets()` counts requests still in flight.** `silent`; start 3; `await wait(100)`; assert `3`.
11. **`activeSockets()` is 0 right after the held requests are aborted.** Start 3 on `silent`, `abort()` each, `await Promise.all(results)`; assert all `aborted` and `activeSockets() === 0` (no extra wait: this is the leak-check contract).
12. **`activeSockets()` is 0 right after a request timed out.** `silent`, `timeoutMs: 100`; after the result, assert `0`.
13. **`destroy()` ends requests still in flight and leaves no socket.** Start 2 on `silent`, `c.destroy()`; both results settle (outcome `error`), `activeSockets() === 0`.

Expected after step 1: `npm run test:unit` → `# tests 470`, `# pass 470`, `# fail 0` (452 + 18). The file is run 20 times in a row
(`for i in $(seq 20); do node --test tests/unit/twenty-timed-post.test.ts || break; done`) with 0 failures before the commit, because tests 6, 7 and 10
to 12 depend on timing; if one is flaky the fix is in the helper's settle (`setImmediate`), never in the assertion.

### 6.3 `tests/twenty/tw-obs/shared.ts` (NEW, step 2)

```ts
import { expect } from "@playwright/test";
import { signInWorkspace } from "../../../src/twenty/auth.ts";
import {
  twentyBaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../../src/twenty/env.ts";
import {
  createPostClient,
  type PostClient,
  type TimedPostResult,
} from "../../../src/twenty/timed-post.ts";

export const ENDPOINTS = ["/metadata", "/graphql"] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

export const VALID_QUERY = '{"query":"{ __typename }"}';
export const UNKNOWN_FIELD_BODY = '{"foo":1}';
/** Guard and resource time limit (plan D4): 66x the largest guard time and 71x the largest valid-query time with hung requests, seen in the probe. */
export const GUARD_MS = 1_000;
/** Client timeout for a request that is expected to hang (brief): a 4xx must arrive before it. */
export const HANG_LIMIT_MS = 5_000;
export const HELD_REQUESTS = 10;
/** Held requests must not end by themselves during a test. */
export const HOLD_TIMEOUT_MS = 30_000;
export const SETTLE_MS = 500;

export interface ObsContext {
  base: string;
  authorization: string; // workspace bearer token, in memory only
}

/** Sign in once per file; one unasserted warm-up query per endpoint (D12). Any failure is a TEST BUG (signInWorkspace throws). */
export async function setupObs(): Promise<ObsContext> {
  const base = twentyBaseUrlFromEnv();
  const session = await signInWorkspace({
    baseUrl: base,
    email: twentyEmailFromEnv(),
    password: twentyPasswordFromEnv(),
    workspaceName: twentyWorkspaceNameFromEnv(),
  });
  const client = createPostClient(base);
  try {
    for (const path of ENDPOINTS) {
      await client.post(path, VALID_QUERY, {
        authorization: session.authorizationHeader,
        timeoutMs: HANG_LIMIT_MS,
      });
    }
  } finally {
    client.destroy();
  }
  return { base, authorization: session.authorizationHeader };
}

/** Guards of every test: the endpoint is healthy for this auth mode. Red on failure, never inside test.fail(). */
export async function assertGuards(
  client: PostClient,
  path: Endpoint,
  authorization: string | undefined,
): Promise<void> {
  const valid = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
  expect(
    { outcome: valid.outcome, status: valid.status },
    `guard: a valid query on ${path} must answer 200`,
  ).toEqual({ outcome: "response", status: 200 });
  expect(valid.totalMs, `guard: valid query time on ${path}`).toBeLessThan(GUARD_MS);
  const unknown = await client.post(path, UNKNOWN_FIELD_BODY, {
    authorization,
    timeoutMs: HANG_LIMIT_MS,
  });
  expect(
    { outcome: unknown.outcome, status: unknown.status },
    `guard: {"foo":1} on ${path} must answer 400`,
  ).toEqual({ outcome: "response", status: 400 });
  expect(unknown.totalMs, `guard: {"foo":1} time on ${path}`).toBeLessThan(GUARD_MS);
}

/** Guards, then the request under test with the 5 s client timeout. The client is destroyed in finally. */
export async function measureHang(
  base: string,
  path: Endpoint,
  body: string,
  authorization: string | undefined,
): Promise<{ result: TimedPostResult; socketsLeft: number }> {
  const client = createPostClient(base);
  try {
    await assertGuards(client, path, authorization);
    const result = await client.post(path, body, { authorization, timeoutMs: HANG_LIMIT_MS });
    return { result, socketsLeft: client.activeSockets() };
  } finally {
    client.destroy();
  }
}

/** Polls until `cond` holds; a miss is a setup error (TEST BUG), never a pass. */
export async function waitUntil(
  cond: () => boolean,
  what: string,
  timeoutMs = 2_000,
  stepMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() >= deadline) throw new Error(`TEST BUG: ${what} within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
```

### 6.4 `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts` (NEW, step 2): 8 tests

```ts
import { expect, test } from "@playwright/test";
import { classify } from "../../../src/twenty/timed-post.ts";
import { ENDPOINTS, HANG_LIMIT_MS, measureHang, setupObs, type ObsContext } from "./shared.ts";

const BODIES = [
  { name: "an empty body", body: "" },
  { name: "{}", body: "{}" },
] as const;
const MODES = [
  { name: "authenticated", withAuth: true },
  { name: "without Authorization", withAuth: false },
] as const;

let ctx: ObsContext;
test.beforeAll(async () => {
  ctx = await setupObs();
});

// P6-OBS-TW-001 is a PRODUCT BUG (owner label, 2026-10-23, BACKLOG). The unauthenticated tests are the same bug with a wider precondition.
for (const mode of MODES) {
  for (const path of ENDPOINTS) {
    for (const { name, body } of BODIES) {
      test(`P6-OBS-TW-001 PRODUCT BUG: POST ${path} with ${name} (${mode.name}) gets a 4xx within ${HANG_LIMIT_MS / 1000} s, never a hang`, async () => {
        const authorization = mode.withAuth ? ctx.authorization : undefined;

        // 1. Guards (inside measureHang) and the request under test. The client is destroyed in finally.
        const { result, socketsLeft } = await measureHang(ctx.base, path, body, authorization);

        // 2. Checks that stay red. A 5xx, a connection error or a 2xx is a different finding, not this bug.
        expect(socketsLeft, "leak check: sockets still in flight after the request ended").toBe(0);
        expect(
          ["hang", "client-error"],
          `neither a hang nor a 4xx (outcome ${result.outcome}, status ${result.status}): not P6-OBS-TW-001`,
        ).toContain(classify(result));

        // 3. Label, then the strict assertion. test.fail() is called only after steps 1 and 2 passed.
        test.info().annotations.push({
          type: "issue",
          description: `P6-OBS-TW-001: PRODUCT BUG${mode.withAuth ? "" : " (no Authorization header)"}, POST ${path} with ${name} gets no response (hang), expected a 4xx`,
        });
        test.fail();
        expect(classify(result), `a 4xx within ${HANG_LIMIT_MS} ms (got ${result.outcome})`).toBe(
          "client-error",
        );
        expect(result.totalMs).toBeLessThan(HANG_LIMIT_MS);
      });
    }
  }
}
```

Behaviour: today `classify(result)` is `"hang"`, so step 2 passes and step 3 fails: the test is green as an expected failure and takes about 5.1 s. If the
product answers 4xx, step 3 passes and Playwright reports the test as unexpectedly passed (red). If the product answers 5xx or 200, step 2 fails (red).

### 6.5 `tests/twenty/tw-obs/tw-obs-001-hung-requests-resource.spec.ts` (NEW, step 3): 2 tests

```ts
import { expect, test } from "@playwright/test";
import {
  createPostClient,
  type PostHandle,
  type TimedPostResult,
} from "../../../src/twenty/timed-post.ts";
import {
  assertGuards,
  ENDPOINTS,
  GUARD_MS,
  HANG_LIMIT_MS,
  HELD_REQUESTS,
  HOLD_TIMEOUT_MS,
  SETTLE_MS,
  VALID_QUERY,
  setupObs,
  waitUntil,
  type ObsContext,
} from "./shared.ts";

let ctx: ObsContext;
test.beforeAll(async () => {
  ctx = await setupObs();
});

// A passing test (no test.fail()): the bug does not make hung requests block valid ones (plan §3.3, §3.4).
for (const path of ENDPOINTS) {
  test(`P6-OBS-TW-001 resource: ${HELD_REQUESTS} hung empty-body requests on ${path} do not stop a valid query (200 under ${GUARD_MS} ms)`, async () => {
    const authorization = ctx.authorization;
    const client = createPostClient(ctx.base);
    const held: PostHandle[] = [];
    let heldInFlight = -1;
    let during: TimedPostResult | undefined;
    let ended: TimedPostResult[] = [];
    let socketsLeft = -1;
    let after: TimedPostResult | undefined;
    try {
      await assertGuards(client, path, authorization); // baseline
      for (let i = 0; i < HELD_REQUESTS; i++) {
        held.push(client.start(path, "", { authorization, timeoutMs: HOLD_TIMEOUT_MS }));
      }
      await waitUntil(
        () => client.activeSockets() === HELD_REQUESTS,
        "all held requests in flight",
      );
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      heldInFlight = client.activeSockets();
      during = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
      for (const h of held) h.abort(); // release the hung requests
      ended = await Promise.all(held.map((h) => h.result));
      socketsLeft = client.activeSockets();
      after = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
    } finally {
      for (const h of held) h.abort(); // safety net if anything above threw (abort is idempotent)
      client.destroy();
    }

    expect(heldInFlight, "all held requests were still in flight").toBe(HELD_REQUESTS);
    expect(
      { outcome: during?.outcome, status: during?.status },
      "valid query while the requests were hung",
    ).toEqual({ outcome: "response", status: 200 });
    expect(during?.totalMs, "valid query time while hung").toBeLessThan(GUARD_MS);
    expect(
      ended.map((r) => r.outcome),
      "every held request stayed hung until our abort (none answered, none closed by the server)",
    ).toEqual(Array(HELD_REQUESTS).fill("aborted"));
    expect(socketsLeft, "leak check: sockets in flight after the abort").toBe(0);
    expect(
      { outcome: after?.outcome, status: after?.status },
      "valid query after the abort",
    ).toEqual({ outcome: "response", status: 200 });
    expect(after?.totalMs, "valid query time after the abort").toBeLessThan(GUARD_MS);
  });
}
```

### 6.6 Playwright project and script (step 2)

```ts
// playwright.config.ts, appended to `projects` after twenty-tw-races
{
  name: "twenty-tw-obs",
  testDir: "tests/twenty/tw-obs",
  retries: 0,
  use: { baseURL: twentyBaseUrlFromEnv() },
},
```

```jsonc
// package.json "scripts", after "race:twenty-tw"
"test:twenty-obs": "playwright test --project=twenty-tw-obs",
```

## 7. Build steps (one commit each)

Each step: `npx prettier --write <the step's files>`, `npm run check` exits 0, `npm run test:unit` prints the count below. A different count means
stop and explain (rule 11); the expected number is never edited to match. Starting count **452** (§3.0 row 1). Playwright specs do not enter the unit count.

| Step | Commit subject (lowercase)                                                   | `git add` paths                                                                                                                   | Unit count after |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0    | `docs(plans): add the x8 twenty empty-body spec plan` (this plan)            | `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md`                                                                                | 452              |
| 1    | `feat(twenty): add the timed post client for hang checks`                    | `src/twenty/timed-post.ts`, `tests/unit/twenty-timed-post.test.ts`                                                                | 470              |
| 2    | `test(twenty): add the P6-OBS-TW-001 empty-body hang specs`                  | `tests/twenty/tw-obs/shared.ts`, `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts`, `playwright.config.ts`, `package.json` | 470              |
| 3    | `test(twenty): add the hung-request resource check`                          | `tests/twenty/tw-obs/tw-obs-001-hung-requests-resource.spec.ts`                                                                   | 470              |
| 4    | `ci(perf): add the twenty-obs job`                                           | `.github/workflows/perf.yml`                                                                                                      | 470              |
| 5    | `docs: describe the twenty empty-body spec in the readme and backlog`        | `README.md`, `docs/BACKLOG.md`                                                                                                    | 470              |
| 6    | `docs(plans): record the x8 build status and closeout` (after the PR exists) | `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md`, `docs/BACKLOG.md`                                                             | 470              |

Commands for every step (repo root; no attribution lines in any commit message, rule A3; `git add` by path only, rule A2):

```bash
export PATH="/usr/local/bin:$PATH"           # Node 22.23 first (AGENTS.md)
npx prettier --write <the files of the step>  # Markdown, YAML and TypeScript must pass format:check
git add <paths from the table>
git commit -m "<subject from the table>"
git log -1 --format=%B                        # check: the message has no attribution line (rule A3)
npm run test:unit                             # expected: "# tests <count>", "# pass <count>", "# fail 0"
npm run check                                 # expected: exit 0 (format:check, lint:actions, typecheck, k6:inspect, test:unit)
```

Expected last lines of `npm run test:unit` after step 1 (and every later step): `# tests 470`, `# suites <n>`, `# pass 470`, `# fail 0`.

Live proof, from step 2 on (local only; the stack is started and stopped with the owner's scripts, rule 14):

```bash
export PATH="/usr/local/bin:$PATH"
npm run up:twenty                 # expected exit 0
npm run seed:twenty               # expected exit 0
npm run test:twenty-obs           # step 2: "8 passed"; step 3: "10 passed" (the 8 hang tests are expected failures, shown as passed)
npm run down:twenty               # expected exit 0, always
```

Expected duration: each hang test about 5.1 s (5 s timeout plus ~50 ms of guards), each resource test about 1 to 2 s, so about 45 s in all plus the two sign-ins.
Local timings prove a test works and are never published (AGENTS.md).

**Control run, not committed (step 2).** To show the strict assertion is live and `test.fail()` does not hide a wrong test: temporarily change the body of one
case in the spec from `""` to `'{"foo":1}'` (a body that answers 400), run that one test (`npx playwright test --project=twenty-tw-obs -g "/metadata with an empty body \(authenticated\)"`),
expect **1 failed** with "Expected to fail, but passed" (the product answers 4xx, so the test is unexpectedly passed), then `git checkout -- tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts`.
The report records this run and that the file was restored (`git status` clean).

**Evidence checks (steps 2 and 3, local).** After the live run: (1) `results/playwright/local.json` contains `expectedStatus` `failed` and `status` `expected` for the 8 hang tests and
the annotation text `P6-OBS-TW-001: PRODUCT BUG`; (2) the token scan used by the job, run by hand over `results/` with the same pattern as `twenty-races` (§8.2 of the Task 7 plan), prints
nothing; (3) the seed password does not appear in any output (`grep -c` for the value returns 0; the value is read from the environment, never typed into a command).

## 8. CI changes and the time budget (gate)

### 8.1 The rule and the numbers it uses

- **Rule.** The worst case must stay at least **10 min** under the job timeout. Job timeouts are never raised to fit tests. Every new step gets `timeout-minutes`.
- **Convention actually used by the existing job.** `twenty-races`: timeout 33, worst case **22.63**, margin 10.37 (Task 7 §8.3). Those 22.63 minutes are the pull at its
  6-minute cap, the race step at its 9-minute cap, first boot (3.05) and seed (1.28) at their measured worst from Task 6, and small steps at estimates. They are **not**
  the sum of every step's `timeout-minutes` (that sum for `twenty-races` is 91 min, for the proposed job 80 min; no job in this repo could pass under that reading). This plan keeps the existing
  convention and counts the new step at its cap. Q3 asks the owner to confirm the convention.
- **Measured (for comparison only, not the budget; two `main` runs, 50 trials, not published).** `twenty-races` in run
  [40006260061](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40006260061) and run
  [40014093546](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40014093546): job 6.12 and 5.48 min; pull 44 s and 44 s; first boot 103 s and 83 s; seed 51 s and 39 s;
  race step 142 s (2.37 min) and 131 s (2.18 min); the other steps 0 to 12 s each.

### 8.2 Option (a): a new step in `twenty-races` (reuse its stack)

New step cap C minutes. Worst case = 22.63 + C. Margin = 33 − (22.63 + C) = 10.37 − C.

| New step cap C | Worst case | Margin | Meets "at least 10"?                                                                    |
| -------------- | ---------- | ------ | --------------------------------------------------------------------------------------- |
| 3.00           | 25.63      | 7.37   | **No**                                                                                  |
| 1.00           | 23.63      | 9.37   | **No**                                                                                  |
| 0.37           | 23.00      | 10.00  | only at a cap under 0.37 min (22 s), below what Playwright start-up plus ten tests need |

Reusing the stack saves a pull, a boot and a seed (about 2.4 minutes of runner time measured) but the budget cannot absorb the step. **Fails** without raising the
timeout (forbidden) or tightening another cap (option (c)).

### 8.3 Option (b): a new job `twenty-obs` with its own pull (6 min cap), up and seed (chosen)

Rows are the `twenty-races` rows, with the race step replaced by the spec step and one upload instead of two (no histogram is written).

| Part                                   | Worst case | Source                                                                                      |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Checkout, verify, setup-node, `npm ci` | 1.50       | estimate, as Task 7 §8.3 (measured 11 s in both main runs)                                  |
| Bootstrap clone                        | 0.25       | as Task 7 (measured 11 to 12 s)                                                             |
| Pull (`compose-pull.sh`, 3 tries)      | **6.00**   | the step cap, not measured (measured 44 s in both main runs)                                |
| First boot (`up`)                      | 3.05       | measured worst 183 s (Task 6), as Task 7                                                    |
| Seed                                   | 1.28       | measured worst 77 s (Task 6), as Task 7                                                     |
| Spec step (`test:twenty-obs`)          | **3.00**   | **the step cap, new.** Work estimate 0.8 min (§8.5)                                         |
| Capture logs                           | 0.10       | estimate, as Task 7                                                                         |
| Token scan                             | 0.50       | estimate, as Task 7                                                                         |
| Job summary                            | 0.50       | estimate, as Task 7                                                                         |
| Upload (container log, 1 step)         | 0.20       | estimate, as Task 7 (0.2 per upload)                                                        |
| Down with volumes                      | 0.05       | measured 2 to 3 s (Task 6)                                                                  |
| **Worst-case total**                   | **16.43**  | sum of the rows: 1.50 + 0.25 + 6.00 + 3.05 + 1.28 + 3.00 + 0.10 + 0.50 + 0.50 + 0.20 + 0.05 |

**Timeout: 27 minutes.** Margin 27 − 16.43 = **10.57 min** (at least 10). `twenty-races` stays at 33 and `twenty-smoke` at 20; no timeout is raised. The job runs in parallel with
the others, so the workflow's wall time is unchanged (the longest job today is `medusa-smoke`, about 18 min of race steps). The cost is one more runner:
expected about 4 to 5 min of runner time per workflow run (pull 0.7 + boot 1.4 + seed 0.7 + spec 0.8 + ~1 for the rest, from the measured `twenty-races` steps; not the budget).

### 8.4 Option (c): tighten an existing cap, then add the step to `twenty-races`

Only with measured evidence. Candidate: the race step cap, 9 min, set by the owner (Task 7 Q3). Worst case with the race cap at X and the new step at 3.00:
22.63 − 9 + X + 3 = 16.63 + X; margin = 33 − (16.63 + X) = 16.37 − X.

| Race cap X | Worst case | Margin | Meets the rule? | Cap as a multiple of the measured 2.18 / 2.37 min |
| ---------- | ---------- | ------ | --------------- | ------------------------------------------------- |
| 9 (today)  | 25.63      | 7.37   | No              | 3.8× to 4.1×                                      |
| 6          | 22.63      | 10.37  | Yes             | 2.5× to 2.8×                                      |
| 5          | 21.63      | 11.37  | Yes             | 2.1× to 2.3×                                      |

Numerically it works at X ≤ 6.37 (6). Evidence today: **two** `main` runs (2.18 and 2.37 min) plus one local run (2.9 min), and the cap is the owner's decision. Two runs are below the
"at least 3" the repo uses for any published timing, and a cap that is too tight turns a slow runner into a red job. Not chosen; available if the owner wants to avoid the extra runner and accepts the evidence.

### 8.5 Decision

**Option (b), job `twenty-obs`, timeout 27 minutes.** It is the only option that meets the rule without touching an existing cap or timeout, so the gate passes and the plan continues.
Spec step cap 3 min: work estimate 0.8 min = 8 hang tests × (5 s timeout + ~0.05 s guards) = 40.4 s, + 2 resource tests × ~2 s = 4 s, + two sign-ins and Playwright start-up ~4 s = ~48 s; the cap is
3.75× that. If every test hit Playwright's 60 s per-test limit the step would run 10 min, but the step cap ends it at 3 (a step that hits its cap has failed, as in Task 7 §8.5).

### 8.6 Job skeleton (step 4)

Append after `twenty-races` (end of `.github/workflows/perf.yml`, currently line 1655). Copy the whole `twenty-races` job (lines 1478 to 1655 today) and change exactly:

1. Header comment and key:

```yaml
# Plan 2026-10-24 X8 (§8): the Twenty empty-body spec (P6-OBS-TW-001), separate from twenty-races.
# Worst-case budget 16.43 min: pull at its 6-min cap, spec step at its 3-min cap, first boot and seed at their measured worst
# (plan §8.3). Margin 27 - 16.43 = 10.57 min. Measured rows are recorded in the plan closeout after the first main run.
twenty-obs:
  name: twenty-obs
  runs-on: ubuntu-24.04
  timeout-minutes: 27
```

2. Replace the step `Twenty race cases (twenty-tw-races)` (id `twenty_races`) with:

```yaml
- name: Twenty empty-body spec (twenty-tw-obs)
  id: twenty_obs
  if: ${{ !cancelled() && steps.twenty_seed.outcome == 'success' }}
  timeout-minutes: 3
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    P6_PLAYWRIGHT_JSON: results/playwright/twenty-tw-obs.json
  run: |
    set -euo pipefail
    npm run test:twenty-obs
```

3. Delete the upload step `race-histograms-twenty-races` (this job writes no histogram). Rename the other upload's `name:` from `twenty-races-container-log` to `twenty-obs-container-log`.
4. Everything else is identical (env block, `TWENTY_REF` check, pull via `scripts/ci/compose-pull.sh`, up, seed, log capture, the same token-scan pattern, job summary, `down` with `always()` and volumes removed). The
   `results/races` branch of the token scan stays; it does nothing when the directory is absent.

`npm run lint:actions` (part of `npm run check`) validates the YAML. The job summary step already copes with no `results/races` directory (`scripts/write-ci-job-summary.ts` lists the files it finds).

### 8.7 Step timeouts (new job)

| Step                                  | timeout-minutes | Reason                             |
| ------------------------------------- | --------------- | ---------------------------------- |
| Checkout, setup-node                  | 5, 5            | as `twenty-races`                  |
| Verify TWENTY_REF                     | 2               | grep only                          |
| `npm ci`                              | 10              | as `twenty-races`                  |
| Bootstrap                             | 10              | clone measured 11 to 12 s          |
| Pull                                  | 6               | the shared script's cap            |
| Start (up)                            | 12              | measured 83 to 183 s               |
| Seed                                  | 10              | measured 39 to 81 s                |
| **Twenty empty-body spec (new)**      | **3**           | estimate 0.8 min; cap 3.75× (§8.5) |
| Capture logs, token scan, job summary | 2, 3, 2         | as `twenty-races`                  |
| Upload container log                  | 5               | as `twenty-races`                  |
| Down                                  | 5               | measured 2 to 3 s                  |

## 9. README and BACKLOG changes (steps 5 and 6)

**README** (`README.md`, "Run Twenty" block and a new "Twenty empty-body spec" subsection after "Twenty races"). In the command block add, after the `race:twenty-tw` line:

```bash
npm run test:twenty-obs            # the P6-OBS-TW-001 empty-body spec (tests/twenty/tw-obs)
```

New subsection text (no timing claims; numbers only come from GitHub Actions runs):

> ### Twenty empty-body spec
>
> Cases in `tests/twenty/tw-obs/` (project `twenty-tw-obs`), run by the `twenty-obs` job. Each hang test first asserts that a valid query answers 200 and `{"foo":1}` answers 400, each under one
> second, then expects a 4xx within a 5-second client timeout.
>
> | Case                                               | What it checks                                                                                              | Status                                                |
> | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
> | `P6-OBS-TW-001` (4 tests, authenticated)           | `POST /metadata` and `POST /graphql` with an empty body or `{}` get a 4xx within 5 s                        | **PRODUCT BUG** (`test.fail()` after the guards)      |
> | `P6-OBS-TW-001` (4 tests, without `Authorization`) | the same four requests without credentials                                                                  | **PRODUCT BUG**, wider precondition (owner-confirmed) |
> | `P6-OBS-TW-001` resource (2 tests)                 | ten hung empty-body requests do not stop a valid query (200 under 1 s); aborting them leaves no open socket | passes in the probe                                   |

(The build runs `npx prettier --write README.md`, which realigns the table. Q1 is confirmed, so the status cell reads "wider precondition (owner-confirmed)" with no "to be confirmed".)

**README "Known product bugs" table** (owner Q6/Q7, step 5): two new rows at the end of the table, in its six columns (ID, Severity, Upstream, What happens, Test, Evidence):

| ID               | Severity                  | Upstream  | What happens                                                                                                                                                            | Test                                                                                                                                              | Evidence                                                                                                                                     |
| ---------------- | ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-TW-001`  | PRODUCT BUG (owner label) | not filed | `POST /metadata` and `POST /graphql` with an empty body or `{}` get no response, with or without `Authorization`; the server never closes the socket (0 of 20 in 400 s) | `tw-obs-001-empty-body-hang.spec.ts`: 8 tests under `test.fail()` after the guards; resource check in `tw-obs-001-hung-requests-resource.spec.ts` | 24 of 24 hangs in the 2026-10-23 probe (plan `2026-10-24-p6-x8-twenty-empty-body.md` §3.1, §3.2, §3.4); 12 of 12 in the Task 7 repro         |
| `P6-TW-RACE-004` | PRODUCT BUG (owner label) | not filed | Ten parallel redemptions of one password-reset token all succeed (check-then-act in `updatePasswordViaResetToken`, no lock)                                             | `tw-race-004-reset-token.spec.ts`: `test.fail()` after the guards                                                                                 | 50 of 50 requests in the Task 7 probe (5 trials, plan `2026-10-23-p6-phase2-task7-twenty-races.md` §3.7); `twenty-races` job green on `main` |

**README sentence** under the new rows' table: none. The evidence cells carry no timing claim.

**BACKLOG** (`docs/BACKLOG.md`).

- Step 5, in the `P6-OBS-TW-001` entry: replace "**Test:** none in Task 7 (it is not a race). The guarded spec is follow-up X8 below." with the spec's location (`tests/twenty/tw-obs/`, 8 hang tests and 2 resource tests,
  X8). Add the new evidence, one sentence each: the unauthenticated requests hang the same way (12 of 12, owner-confirmed as the same PRODUCT BUG with a wider precondition), valid queries still answer in 5.5 to 14.0 ms with
  20 hung requests held, and **unauthenticated clients can hold sockets open indefinitely (0 of 20 closed after 400 s, past Node's 300 s `requestTimeout`)**. Keep the label text unchanged.
- Step 5, in X8: describe what was built (the job is `twenty-obs`), and change "expect `{}` to get a 400" to "a 4xx" (owner Q6).
- Step 6 (after the PR exists): X8 line starts with `**X8 done in [PR #<n>](https://github.com/Jayami123/k6-load-concurrency-suite/pull/<n>)**` and keeps its "Done when" text. It is true on merge; if the owner prefers the flip after
  merge instead, step 6 moves to a `docs/` branch with its own PR (Q4).

## 10. Test strategy, what this does not prove, risks

- **Unit (`tests/unit/twenty-timed-post.test.ts`):** the client's timing, abort, header, body, timeout, transport-error and socket-count behaviour against local servers; the outcome classification. Runs on every `npm run check`.
- **Playwright (`tests/twenty/tw-obs/*.spec.ts`):** against the live stack in `twenty-obs`, on every PR, push to `main`, nightly and dispatch (no trial count; same on PRs and `main`).
- **Does not prove.** The cause; N above 20; other content types; that the bug is exploitable beyond holding a socket (§3.7). A passing resource test is a characterization at N=10 on one stack.

| #   | Risk                                                                                        | Likelihood | Mitigation in this plan                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| R1  | The hang tests stay expected failures until the product fixes it (PRODUCT BUG, owner label) | Known      | `test.fail()` after the guards; a fix shows as unexpectedly passed (D5)                                            |
| R2  | `test.fail()` hides a different failure (5xx, connection error, 2xx)                        | Medium     | D5 step 3: outcome must be hang or 4xx, else red before `test.fail()`                                              |
| R3  | A cold first request fails a 1 s guard on a slow runner                                     | Low        | D12 warm-up; 66× headroom (D4); a real miss is red, not hidden                                                     |
| R4  | A leaked hung request pins a server socket (the server never closes it, §3.4)               | Low        | D8: abort in `finally`, `destroy()`, socket count asserted before `test.fail()`                                    |
| R5  | The 500 ms settle is too short on CI for the server to have all 10 requests                 | Low        | It only affects the "held" claim; `ended` must be 10 × `aborted` or the test is red. Revisit with the first CI run |
| R6  | The extra runner fails on a Docker Hub pull                                                 | Medium     | The shared 3-try pull with the 6-min cap (X5), counted at its cap in §8.3                                          |
| R7  | Unit tests 6, 7, 10 to 12 are timing-sensitive                                              | Low        | Resolve from `close` + `setImmediate`; run the file 20 times before the commit (§6.2)                              |

## 11. Contradictions, proposed extras, open questions

### 11.1 Contradictions and deviations

- **C1 Branch name vs rule A10.** Rule A10 says the plan is committed alone and pushed to `plan/<date>-p6-<topic>`; the brief says to commit and push the plan on `feat/2026-10-24-p6-twenty-empty-body`. This plan follows the brief (first commit on the feature branch, no PR). Q2.
- **C2 BACKLOG X8 (b) says "a 400", the brief says "a 4xx".** The spec asserts any 4xx (D11).
- **C3 BACKLOG X8 lists the unauthenticated probe as part (c).** The probe was run (§3.2) and, because it hangs, it also became 4 tests (D6). The brief anticipated this.
- **C4 The brief's "worst case uses step caps".** The existing 22.63 mixes caps with measured worsts (§8.1). Kept as is; Q3.
- **C5 The brief's "run the existing leak check".** The existing check counts records this spec never creates (D9). Replaced by a socket leak check. Q5.
- **C6 Issue-id format.** `P6-TW-RACE-004`'s annotation is `P6-TW-RACE-004 PRODUCT BUG: …`, so the job summary shows the id as `P6-TW-RACE-004 PRODUCT BUG`; this plan's annotation is `P6-OBS-TW-001: PRODUCT BUG …`, so the id is `P6-OBS-TW-001`. Not changed in `-004` (out of scope); noted.

### 11.2 Open questions of version 1: answered by the owner (§0.1)

The text below is version 1's wording, kept for the record. Each question is closed by the answer in §0.1: Q1 confirmed, Q2 pushed, Q3 option (b) approved and (c) rejected, Q4 flip in the
last commit, Q5 socket check only, Q6 any 4xx and the post-abort query stays, Q7 (README rows) now in scope.

- **Q1 Unauthenticated label.** The same hang with no `Authorization` header is the same bug with a wider precondition. _Proposal:_ keep the label `P6-OBS-TW-001`, state the precondition in the annotation, and keep the 4 unauthenticated tests. The owner confirms or removes them. Not recorded as decided.
- **Q2 Plan branch.** _Proposal:_ keep the plan on the feature branch as instructed; on the owner's word, push the identical commit to `plan/2026-10-24-p6-twenty-empty-body` to satisfy rule A10 (no PR for it).
- **Q3 Budget convention and job.** _Proposal:_ keep the existing convention (§8.1) and take option (b), `twenty-obs`, timeout 27, margin 10.57. Option (c) only after at least 3 `main` runs of `twenty-races` and the owner's agreement.
- **Q4 When X8 is marked done.** _Proposal:_ step 6 sets "done in PR #n" on the branch after the PR exists, so it merges together; if the owner wants it flipped after the merge, a `docs/` branch and PR.
- **Q5 Leak check.** _Proposal:_ no company-row check (nothing is created); the client-side socket check (D8) stands in. Say if the owner wants the company check added anyway (it would always read 0).
- **Q6 One resource test per endpoint includes the post-abort query** (D7), because it needs the same ten held requests. _Proposal:_ keep as one test per endpoint.
- **Q7 README "Known product bugs" table.** It has no row for `P6-OBS-TW-001` (or `P6-TW-RACE-004`). _Proposal (extra, not in scope):_ add both rows in a separate docs PR.

### 11.3 Proposed extras (out of scope until accepted)

- **X9** Read the Twenty server source for why an empty body or `{}` never reaches a handler (the cause, needed for an upstream issue).
- **X10** A higher-N sweep (100, 1000 held) to find where the server stops answering valid queries; not needed for the label.
- **X11** The same probe for other methods and content types (`GET` with a body, `application/x-www-form-urlencoded`).

## 12. Closeout

- **Head SHA at the PR:** `e5ade13`. **PR:** [#50](https://github.com/Jayami123/k6-load-concurrency-suite/pull/50) (opened through the REST API: `gh pr create` fails in this
  environment because it needs GraphQL). **Merge SHA:** not applicable yet (merge only on the owner's word, rule A6).
- **Build commits (step: SHA):** 0b `4f04f4c` owner decisions; 1 `dd49f39` helper and 18 unit tests; 2 `e76c2c3` hang specs, project and script; 3 `6250705` resource check;
  4 `e2c1494` job `twenty-obs`; 5 `e5ade13` README and BACKLOG; 6 this closeout and the X8 flip. The plan is also on `plan/2026-10-24-p6-twenty-empty-body` (owner Q2).
- **Unit tests:** 452 → 470 (+18: 5 `classify`, 13 client). `npm run check` exited 0 after every step with `# tests 470`, `# pass 470`, `# fail 0`. The new unit file also passed 20 runs in a row before its commit.
- **Live run through the harness (cloud VM, proof only, not published):** `npm run up:twenty` exit 0 (1 m 46 s); `npm run seed:twenty` exit 0 (`created=false`: the database volume
  persisted from the probe, so this was not a fresh DB); step 2 alone (8 tests): **8 passed in 42.1 s**, each hang test 5.0 s; step 3 (the whole project, 10 tests): **10 passed in 42.9 s**,
  8 hang tests 5.0 s each (expected failures), 2 resource tests 548 ms and 580 ms; `npm run down:twenty` exit 0, no container left. Playwright JSON: 8 × expected `failed`/`expected`,
  2 × `passed`/`expected`, 8 `issue` annotations starting `P6-OBS-TW-001: PRODUCT BUG`.
- **Control run (not committed):** with the empty-body case changed to `{"foo":1}` (answers 400) the test reported "Expected to fail, but passed", exit 1. The file was restored with `git checkout`; `git status` was clean.
- **Token scan and secrets:** the `twenty-obs` scan pattern found nothing in the container log (4677 lines) or in the Playwright JSON (`suites`, `errors`); `scripts/evidence-token-scan.mjs` over `results/playwright` exited 0; the seed password (13 characters, value not printed) occurs in none of the result files or logs.
- **Leak check:** the client socket count is asserted in every test (0 after each request and after each abort). No company-row check (owner Q5).
- **CI:** `perf.yml` runs on the PR; the jobs and their conclusions are read once after the push and reported in the PR report, not polled. The measured rows of `twenty-obs` for §8.3 (pull, boot, seed, spec step, job) come from the first `main` run and are recorded then.
- **Owner answers recorded:** §0.1 only.
- **Deviations from this plan:**
  1. The unit-test file has a small `recorder()` helper (headers and body of the last request) that the skeleton only described. No test was added, merged or split.
  2. Prettier realigned the width of the README "Known product bugs" table when the two new rows were added; the only non-whitespace change in the existing rows is the separator line.
  3. `gh pr create` failed (GraphQL not available); the REST fallback of rule A3 was used with the same title and body.
  4. The step 2 and step 3 live runs were made on one stack start (step 2 by running the hang file alone), then the commits for steps 3 and 4 followed the run.
- **Rule slips:** my first evidence one-liner failed on the Playwright JSON (an annotation without a description); I fixed the script and re-ran it. No product result or committed file was affected.

## 13. Self-check (rule 20)

- **(a) Roadmap "Done when".** BACKLOG X8: guards (a) §6.3 `assertGuards`; strict 4xx under `test.fail()` within 5 s (b) §6.4; unauthenticated probe (c) §3.2 and tests §6.4; parallel check (c) §3.3, §3.4 and §6.5; "spec merged and CI runs it" §7 and §8. The gap: "merged" needs the owner's word; X8's "400" became "4xx" (C2). Roadmap Phase 2 has no item for X8. Everything else in the brief is in this plan (probe tables §3, tests §4 and §6, budget §8, README and BACKLOG §9, closeout §12, this check, baseline 452 and planned 470).
- **(b) Names and paths (grep-checked in this session).** Existing and present: `playwright.config.ts` (project `twenty-tw-races` is the last), `package.json` (`race:twenty-tw`, `test:documenso-api`), `src/twenty/auth.ts` (`signInWorkspace` line 75), `src/twenty/env.ts` (`twentyBaseUrlFromEnv`, `twentyEmailFromEnv`, `twentyPasswordFromEnv`, `twentyWorkspaceNameFromEnv`), `scripts/ci/compose-pull.sh`, `scripts/write-ci-job-summary.ts`, `scripts/evidence-token-scan.mjs`, `src/ci/playwright-json-summary.ts` (issue id = text before the first colon), `tests/twenty/tw-races/guards.ts`, `tests/twenty/races/twenty-self-test.spec.ts`, `.github/workflows/perf.yml` (`twenty-races` at line 1481, timeout 33; `twenty-smoke` at 1289, timeout 20; file ends at line 1655), `README.md` ("Twenty races" section), `docs/BACKLOG.md` (X8, `P6-OBS-TW-001`). **NEW (each has a skeleton in §6):** `src/twenty/timed-post.ts` (`createPostClient`, `classify`), `tests/unit/twenty-timed-post.test.ts`, `tests/twenty/tw-obs/shared.ts` (`setupObs`, `assertGuards`, `measureHang`, `waitUntil`), `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts`, `tests/twenty/tw-obs/tw-obs-001-hung-requests-resource.spec.ts`, project `twenty-tw-obs`, script `test:twenty-obs`, job `twenty-obs`.
- **(c) CI estimate.** §8.3: worst case 16.43 min with the pull at its 6-minute cap, setup and boot rows as in Task 7, the new step at its 3-minute cap; timeout 27; margin 10.57 min (≥ 10). No rerun is built into the job (X5's pull retry is inside the 6-minute cap; the spec has no rerun); the same figures appear in §8.3, §8.6 and the job comment. `twenty-races` (33, 22.63) and `twenty-smoke` (20) are unchanged. Option (a) fails (7.37 to 9.37 min), option (c) works numerically but lacks evidence.
- **(d) Skeletons and commands.** Every new function (`createPostClient`, `classify`, `setupObs`, `assertGuards`, `measureHang`, `waitUntil`) and every test (18 unit tests in §6.2, 8 hang tests in §6.4, 2 resource tests in §6.5) has a skeleton or an exact description; every step in §7 has its `git add` paths, commit subject, the commands and the expected `npm run check` and unit-count output (470 from step 1 on). Baseline `npm run check` on `ad14c6a`: exit 0, **452** tests (§3.0 row 1).
- **(e) Owner answers.** Recorded in §0.1 only, from the owner's review message of this session (Q1 to Q6 and the build instructions). The earlier decision cited is the one already in `docs/BACKLOG.md`: the `P6-OBS-TW-001` label (PRODUCT BUG, 2026-10-23). Nothing else is attributed to the owner.
