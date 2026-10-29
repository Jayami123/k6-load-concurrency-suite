# P6 Phase 5 Task 1: harness telemetry tier (H1, H2, H4): build guide

This is the **build guide for the harness repo** `Jayami123/qa-portfolio-harness`. There is **no separate
harness-repo plan file**: this file lives in P6 because the roadmap asks for the build guide here. The build
session works in the harness clone and changes only harness files. P6 changes come later in
[Task 2](2026-10-29-p6-phase5-task2-telemetry-bump.md). Planning only: this file changes no code.

| Field                               | Value                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan date                           | 2026-10-29 (Asia/Colombo)                                                                                                                                                                                                                                                                                              |
| Plan branch                         | `plan/2026-10-29-p6-phase5-lane-a`                                                                                                                                                                                                                                                                                     |
| Build repo                          | harness `Jayami123/qa-portfolio-harness` (not P6)                                                                                                                                                                                                                                                                      |
| Build branches                      | `feat/2026-10-29-harness-twenty-rate-limits` (PR A, H4); `feat/<date>-harness-pg-stats` (PR B, H1); `feat/<date>-harness-el-preload` (PR C, H2). Each is cut from `main` after the previous merge. Releases: `chore/<date>-harness-release-0-2-16` (after PR A) and `chore/<date>-harness-release-0-2-17` (after PR C) |
| Mapped case IDs                     | none (infrastructure). Feeds `P6-X-LOAD-002` extension and `P6-X-LOAD-009` (Task 2), and the functional Twenty profile for Task 3 (`P6-TW-LOAD-004`, `-005`, `-008`)                                                                                                                                                   |
| Roadmap section                     | [2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md) "Task 1: Harness telemetry release (H1 + H2 + H4)", lines 217–271; Note 1 lines 187–198; Note 3 lines 202–207; D1 lines 538–543; D6 lines 555–557; D7 lines 558–560                                                                                 |
| Base (P6 main)                      | `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 09:18 Asia/Colombo)                                                                                                                                                                                                                                             |
| Base (harness)                      | tag `v0.2.15` = `43dc0da7874a50d709b328bfb492e1e091a9fc64` (merge of harness PR #29); `CHANGELOG.md` has an empty `## Unreleased` at line 3                                                                                                                                                                            |
| Harness baseline                    | `npm run check` on `v0.2.15`: exit 0; `# tests 243`, `# suites 92`, `# pass 242`, `# skipped 1` (the skip is `src/adapters/medusa-env.test.ts:310`)                                                                                                                                                                    |
| Harness tags (DECIDED by the owner) | `v0.2.16` = H4 only (unblocks Lane B). `v0.2.17` = H1 + H2                                                                                                                                                                                                                                                             |

Stale facts in the roadmap, corrected here (see the conflicts table): it cites harness `v0.2.11`, and it
cites `src/adapters/cal.adapter.ts` lines 89–93 and Medusa lines 253–259. The live values are in the probe
table below.

## 1. What it proves

No case ID is mapped. The question this release answers: **can an operator switch on deeper evidence
(Postgres query statistics, event-loop delay, Twenty limiter values) without changing any default run?**

- **Oracle:** unit tests in the harness repo. Each flag has a test that proves the default-off path leaves
  every env map and compose file list exactly as in `v0.2.15`, and a test that proves the opt-in path adds
  exactly the named keys and nothing else.
- **Verdict words for this task:** the harness `npm run check` is PASS or FAIL. A flag that is not set exactly
  as documented is OFF (H1, H2), or an error (H4). No INCONCLUSIVE, no NOT RUN in a release.
- **Transfer:** the same evidence a bank or a hospital asks for in a performance review (which query and which
  event-loop stall explains a saturation), gathered by a tool that stays off for normal users.

## 2. Live probe evidence (2026-10-29, read-only, one-shot container commands only)

Every row is either a path:line in the harness clone at `v0.2.15` (`$HOME/harness`), a command with its output,
or NOT PROBED with the reason and the build-time re-check.

| #   | fact                                            | evidence (path:line, command + output)                                                                                                                                                                                                                                                                                                                                                     | what it changes in the design                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Harness baseline is green at the tag            | `git rev-parse v0.2.15^{commit}` gives `43dc0da7874a50d709b328bfb492e1e091a9fc64`; `npm ci && npm run check` exit 0; `# tests 243 / # suites 92 / # pass 242 / # skipped 1`                                                                                                                                                                                                                | HB0 = 243                                                                                                                                                                                                                                                                                                             |
| 2   | Changelog has an empty Unreleased section       | `CHANGELOG.md:3` `## Unreleased` then blank; `CHANGELOG.md:5` `## v0.2.15 — 2026-10-24`                                                                                                                                                                                                                                                                                                    | The feature PRs add bullets under line 3; each release PR turns them into a dated section (the date is that release PR's merge date)                                                                                                                                                                                  |
| 3   | Harness version                                 | `package.json:3` `"version": "0.2.15"`                                                                                                                                                                                                                                                                                                                                                     | Each release PR bumps this line                                                                                                                                                                                                                                                                                       |
| 4   | Release and branch rules                        | `CONTRIBUTING.md:7` branch `<type>/YYYY-MM-DD-short-name`; `:13` merge commits only, never squash; `:14` bump version, dated CHANGELOG, maintainer tags `vX.Y.Z` on `main`                                                                                                                                                                                                                 | Branch names and release steps copied from here                                                                                                                                                                                                                                                                       |
| 5   | Env reading style for switches                  | `src/adapters/medusa.adapter.ts:110` `parseMedusaHarnessSwitches(process.env)`; `src/adapters/medusa-env.ts:172–181`: `MEDUSA_REDIS === "1"`, blank `MEDUSA_LOCK` means default; `src/adapters/documenso-env.ts:276–278`: `DANGEROUS_BYPASS_RATE_LIMITS === "true"`; `src/config.ts:26–77` holds URLs, paths and tags only                                                                 | Flags are read from `process.env` in small modules, exact strings. `src/config.ts` is NOT changed (see conflicts table)                                                                                                                                                                                               |
| 6   | Cal app env is a fixed object                   | `src/adapters/cal.adapter.ts:101–106`: `nodeHeapEnv()` returns exactly `NEXT_TELEMETRY_DISABLED` and `NODE_OPTIONS: process.env.NODE_OPTIONS?.trim() \|\| "--max-old-space-size=8192"`; callers at `:228, :247, :255, :445, :463` pass it as `env`. `:463` is the web-server spawn (`logFile`, `spec.detached`), the `next start` caller                                                   | A P6 variable never reaches Cal's processes. H2 adds its keys explicitly, only for the `:463` caller, and keeps the heap flag                                                                                                                                                                                         |
| 7   | Medusa backend env comes from `.env` only       | `src/adapters/medusa.adapter.ts:274–281` `backendProcessEnv()` parses `<backend>/.env` and does not spread `process.env`; used at `:385` (`runPnpm`: build, migrate, seed), `:939` (backend), `:1030` (second backend, `PORT`), `:1314`                                                                                                                                                    | `backendProcessEnv()` stays byte-identical. H2 adds `serverProcessEnv(role)` for `:939` and `:1030` only                                                                                                                                                                                                              |
| 8   | Documenso app env is a fixed object             | `src/adapters/documenso.adapter.ts:95–97` `appEnv()` returns `buildDocumensoAppEnv(this.cfg)`; `src/adapters/documenso-env.ts:248–279` builds a fixed object, with only `DANGEROUS_BYPASS_RATE_LIMITS` read from `process.env` (`:276–278`); precedent test `src/adapters/documenso-env.test.ts:110–125` (unset, `1`, `true`)                                                              | H2 adds keys in `appEnv()` when set. The precedent test is the pattern for the off-by-default tests                                                                                                                                                                                                                   |
| 9   | Twenty compose sets env explicitly              | `docker/twenty.compose.yml:27–40` server `environment:` (`SERVER_URL`, `IS_MULTIWORKSPACE_ENABLED`, SMTP, `IS_EMAIL_VERIFICATION_REQUIRED`); `:41–52` worker `environment:` (same keys); `db` port remap; no `NODE_OPTIONS`, no `API_RATE_LIMITING_*`, no passthrough                                                                                                                      | H4 and the Twenty half of H2 need an override file; the base overlay is NOT edited                                                                                                                                                                                                                                    |
| 10  | process.env reaches compose substitution only   | `src/adapters/twenty.adapter.ts:73–75` `composeOpts().env` is `{...process.env, TAG}`; `dockerComposeArgs` at `:116–118`                                                                                                                                                                                                                                                                   | Compose substitution sees the caller's env; containers do not. A `${KEY:-}` entry is therefore the wrong tool (row 11)                                                                                                                                                                                                |
| 11  | Empty-value trap in compose                     | one-shot `docker compose -f x.yml config` with `API_RATE_LIMITING_SHORT_LIMIT: ${API_RATE_LIMITING_SHORT_LIMIT:-}` and the variable **unset** renders `API_RATE_LIMITING_SHORT_LIMIT: ""`; with the variable set to `500` it renders `"500"`                                                                                                                                               | The override file writes a key only when the caller set it. Never `${K:-}`                                                                                                                                                                                                                                            |
| 12  | Twenty image config (v2.44.0, pulled, 1.84 GB)  | `docker image inspect twentycrm/twenty:v2.44.0`: `Entrypoint=["/app/entrypoint.sh"]`, `Cmd=["node","dist/main"]`, `WorkingDir=/app/packages/twenty-server`, `User=1000`, Env `NODE_ENV=production`, `NODE_VERSION=24.19.0`, `APP_VERSION=v2.44.0`, **no `NODE_OPTIONS`**                                                                                                                   | Preload via `NODE_OPTIONS` is possible without a product change (Note 3)                                                                                                                                                                                                                                              |
| 13  | Entrypoint ends in exec                         | `docker run --rm --entrypoint sh twentycrm/twenty:v2.44.0 -c 'cat /app/entrypoint.sh'`: DB setup, cron registration, then the last line `exec "$@"`                                                                                                                                                                                                                                        | Entrypoint passes the command through, so `NODE_OPTIONS` set on the container reaches `node dist/main`                                                                                                                                                                                                                |
| 14  | Node version for the preload                    | `docker run --rm --entrypoint node twentycrm/twenty:v2.44.0 -v` prints `v24.19.0`                                                                                                                                                                                                                                                                                                          | `perf_hooks.monitorEventLoopDelay` is available (Node 24)                                                                                                                                                                                                                                                             |
| 15  | Worker command                                  | `/app/packages/twenty-server/package.json:9` `"start:prod": "node dist/main"`, `:11` `"worker:prod": "node dist/queue-worker/queue-worker"`. The harness overlay has NO `command:` for `worker` (`docker/twenty.compose.yml:41–52`). The fork compose sets the worker command (roadmap cites fork line 66)                                                                                 | **NOT PROBED** for the fork compose (fork is outside this session's repository scope). Build-time re-check in the P6 Twenty job. Only the command matters for H2's mount target                                                                                                                                       |
| 16  | yarn passes NODE_OPTIONS to its child           | one-shot: `docker run --rm -e NODE_OPTIONS=--require=/probe/pre.cjs -v <dir>:/probe -w /probe --entrypoint sh twentycrm/twenty:v2.44.0 -c 'yarn -s run p'` where `pre.cjs` prints `PRELOAD-LOADED pid=N` and `p` prints `CHILD NODE_OPTIONS=...`. Output: `PRELOAD-LOADED pid=1`, `PRELOAD-LOADED pid=27`, `CHILD NODE_OPTIONS=--require=/probe/pre.cjs`, exit 0                           | The worker child inherits `NODE_OPTIONS`. The probe directory had to be mode 755 (a `mktemp` dir is 0700 and UID 1000 cannot read it; the first attempt failed with `Permission denied`). So the preload file must be readable by UID 1000, and the out directory must be writable by it (section 5.5, Twenty bullet) |
| 17  | Limiter names and defaults in the image         | `dist/engine/core-modules/twenty-config/config-variables.js:188–193`: `API_RATE_LIMITING_SHORT_TTL_IN_MS = 1000`, `API_RATE_LIMITING_SHORT_LIMIT = 100`, `API_RATE_LIMITING_LONG_TTL_IN_MS = 60000`, `API_RATE_LIMITING_LONG_LIMIT = 100`, `APPLICATION_API_RATE_LIMITING_TTL_IN_MS = 60000`, `APPLICATION_API_RATE_LIMITING_LIMIT = 500`; decorators `:1889–1929` (group `RATE_LIMITING`) | Same values as the fork pin (roadmap Context). The H4 allowlist is the six names in 5.4 (four `API_RATE_LIMITING_*` plus the two `APPLICATION_API_RATE_LIMITING_*` names; Q4 DECIDED yes)                                                                                                                             |
| 18  | How the image reads a number                    | `dist/engine/core-modules/twenty-config/decorators/cast-to-positive-number.decorator.js`: `toNumber("")` returns `0` because `isNaN(+"")` is false. Probe of the real config class (one-shot `node` with `NODE_PATH`, Appendix A): `unset` gives `SHORT_LIMIT 100`; `""` gives `0`; `"   "` gives `0`; `"abc"` gives `null`; `"500"` gives `500`                                           | Confirms the danger: an empty value makes the limit 0. H4 never writes an empty value, and rejects 0, text and blanks-as-values                                                                                                                                                                                       |
| 19  | Consumer of the limiter names                   | `grep` of the image's `dist` for the six full names finds only `config-variables.js`, its map, and the group metadata. The guard that reads them was NOT located                                                                                                                                                                                                                           | **NOT PROBED** for the consumer (Task 3 and Task 6 concern: keying, routes). H4 does not need it                                                                                                                                                                                                                      |
| 20  | Postgres images ship the extensions             | one-shot `docker run --rm --entrypoint sh postgres:15 -c 'ls /usr/share/postgresql/*/extension \| grep pg_stat_statements'`: `pg_stat_statements.control` and versions `1.0`–`1.10`; same for `postgres:16`; `auto_explain.so` present in `/usr/lib/postgresql/*/lib` for both                                                                                                             | H1 needs no image change. `auto_explain` needs no `CREATE EXTENSION` (it is a preload module); it is deferred (Q3)                                                                                                                                                                                                    |
| 21  | How the server takes the flags                  | one-shot `docker run --rm postgres:15 postgres --describe-config \| grep -E '^(shared_preload_libraries\|track_io_timing)'`: `shared_preload_libraries` is `postmaster` (restart), `track_io_timing` is `superuser`, default `FALSE`; same for `postgres:16`                                                                                                                               | Set both with `command:` in an opt-in overlay. Upstream defaults stay as they are (CONTRIBUTING safety rules)                                                                                                                                                                                                         |
| 22  | Overlay pattern already in the harness          | `docker/medusa.redis.compose.yml` (11 lines) is an opt-in overlay file for Medusa's Redis switch; `docker/medusa.compose.yml:11` `image: postgres:15`, no `command:`; `docker/documenso.compose.yml:13` `image: postgres:15`, no `command:`                                                                                                                                                | H1 copies the opt-in overlay pattern: one static file per product, added to the compose file list only when the flag is set. The build reads how `medusa.adapter.ts` appends the Redis overlay and copies that                                                                                                        |
| 23  | POSTGRES_USER is the superuser                  | `docker/medusa.compose.yml` `POSTGRES_USER: medusa`; `docker/documenso.compose.yml` `POSTGRES_USER: documenso`. The official image makes that user the superuser                                                                                                                                                                                                                           | Lets the harness run `CREATE EXTENSION` as that user (roadmap H1 text). **Superuser status NOT live-probed.** Build-time re-check: `select rolsuper from pg_roles where rolname = current_user` after `up`                                                                                                            |
| 24  | Cal and Twenty databases come from fork compose | Cal: `docker/cal.compose.yml:1–15` overlays `<cal>/packages/prisma/docker-compose.yml`; Twenty: `docker/twenty.compose.yml` overlays `<twenty>/packages/twenty-docker/docker-compose.yml`. Their service names, images and any `command:` are in the fork files                                                                                                                            | **NOT PROBED here** (the forks are outside this session's repository scope). Read in build step S0, before PR B (section 11). The roadmap says Twenty's fork uses `postgres:16` (roadmap lines 50–51, to verify)                                                                                                      |
| 25  | Live `pg_stat_statements` behaviour             | `CREATE EXTENSION`, role grants, cost of a snapshot, auto_explain log volume                                                                                                                                                                                                                                                                                                               | **NOT PROBED**: needs a running product started by the harness (products are not in this session, and P2 forbids starting one by hand). Build-time re-check in the Task 2 medusa-load run; auto_explain is deferred (Q3)                                                                                              |
| 26  | Harness runtime folder is ignored               | `.gitignore:5` `.harness/`; `src/paths.ts:5` `HARNESS_ROOT`; `src/adapters/medusa.adapter.ts:126` `path.join(HARNESS_ROOT, ".harness", "medusa-backend.log")`                                                                                                                                                                                                                              | Generated override files go in `path.join(HARNESS_ROOT, ".harness", ...)`, the same pattern as Medusa's log file, which git ignores                                                                                                                                                                                   |
| 27  | Off by default means byte-identical             | the existing `documenso-env.test.ts:110–125` asserts `undefined` for unset, `1` and `true` (without the exact value); `medusa-env` tests assert `skip` and reasons                                                                                                                                                                                                                         | Each new flag gets the same three-way test (unset, near-miss, exact), and an empty value is tested as off                                                                                                                                                                                                             |
| 28  | Consumers pinning the harness                   | `CONTRIBUTING.md:3` names P1, P2, P5, P6. `README.md:10` names the roles only, no repo names. Their pins are NOT in this session                                                                                                                                                                                                                                                           | **NOT PROBED** for P1, P2, P5: outside this session's repository scope and the repo names are not in the harness docs. Owner step: send the three current pins                                                                                                                                                        |
| 29  | Precedent for an opt-in passthrough             | `CHANGELOG.md:48–51` (v0.2.6): `DANGEROUS_BYPASS_RATE_LIMITS=true` forwarded into the Documenso app env only when the value is exactly `true`                                                                                                                                                                                                                                              | Same style for H4: exact value rules, unset = no key                                                                                                                                                                                                                                                                  |

## 3. Depends on

| Item                                                                                                                             | Kind       | Blocks                                                  | Status                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Phase 3 Task 1 release pattern                                                                                                   | precedent  | nothing (read only)                                     | `docs/plans/2026-10-24-p6-phase3-task1-harness-bump.md` exists |
| Owner merges each harness PR (merge commit)                                                                                      | owner step | the CI of the next PR and each tag                      | blocks the start of PR B (after A) and PR C (after B)          |
| Owner tags `v0.2.16` on harness `main` after release PR A (Releases, Draft a new release, Choose a tag `v0.2.16`, Target `main`) | owner step | Task 2a (pin), Lane B Task 3 (starts from this tag)     | blocks Task 2a and Lane B                                      |
| Owner tags `v0.2.17` after release PR C                                                                                          | owner step | Task 2b-ii (flag env lines)                             | blocks Task 2b-ii only                                         |
| Owner sends the P1, P2, P5 pins and runs P1 on the tag                                                                           | owner step | the done-when item "P1 green on the tag", not the build | blocks closeout only                                           |

## 4. Build-time re-check (run first, in the harness clone)

| fact                              | how to re-check at build start                                                                                                                                                      | if it changed                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| harness `main` and tags           | `git ls-remote --tags origin` and `git log --oneline -3 origin/main`                                                                                                                | if a newer tag exists, the next version number moves; keep the rules and recount    |
| baseline count                    | `npm ci && npm run check` (expect `# tests 243`)                                                                                                                                    | if it differs, stop and explain (rule 11 of section C of the repo's agent rules)    |
| Twenty image config               | `docker image inspect twentycrm/twenty:v2.44.0 --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{.Config.WorkingDir}} {{.Config.User}}'`                                 | a new entrypoint or user changes the mount path and the UID rule                    |
| limiter names                     | `docker run --rm --entrypoint sh twentycrm/twenty:v2.44.0 -c 'grep -n "API_RATE_LIMITING_" /app/packages/twenty-server/dist/engine/core-modules/twenty-config/config-variables.js'` | any rename changes the H4 allowlist; add it, never a wildcard                       |
| empty value behaviour             | run Appendix A                                                                                                                                                                      | if the image now treats `""` as unset, keep the validator anyway (defence in depth) |
| compose substitution              | `docker compose -f <file> config` with an unset variable (Appendix A)                                                                                                               | if compose changed, nothing changes: the design never writes an empty value         |
| Postgres extension files          | `docker run --rm --entrypoint sh postgres:15 -c 'ls /usr/share/postgresql/*/extension \| grep pg_stat_statements'`                                                                  | if missing, H1 is unavailable for that product: drop it, record it                  |
| Twenty worker command             | in the P6 Twenty job checkout: `grep -n 'command' <fork>/packages/twenty-docker/docker-compose.yml`                                                                                 | if the worker is not `yarn worker:prod`, H2's preload target changes                |
| Cal `next start` caller           | read `src/adapters/cal.adapter.ts:455–470` in the harness: confirm the spawn at `:463` runs the `start` script (`cal-web-process.ts:31–35`)                                         | if another caller runs `next start`, move the preload to it                         |
| Medusa and Documenso env builders | `src/adapters/medusa.adapter.ts:274`, `src/adapters/documenso.adapter.ts:95`, `src/adapters/cal.adapter.ts:101`                                                                     | if the lines moved, re-read before editing; the functions are the same              |
| consumer pins                     | owner sends the three pins                                                                                                                                                          | a consumer on a tag older than `v0.2.16` is not affected by H4 (opt-in); record it  |

## 5. Design

### 5.0 File ownership (build), copied from the Phase 5 planning prompt

This plan keeps to the **Lane A, Task 1** row. The other rows belong to the other build sessions.

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                         | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                       | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### 5.1 Scope of each change (three PRs, merge commits, in order)

- **H4 (PR A, first):** allowlisted `API_RATE_LIMITING_*` passthrough to the Twenty server and worker. Release `v0.2.16` straight after it.
- **H1 (PR B):** opt-in `pg_stat_statements` for the four harness-owned databases, plus one `CREATE EXTENSION` after start.
- **H2 (PR C):** opt-in event-loop preload through `NODE_OPTIONS`: the Cal web server (one caller), the Medusa backend (two spawns), the Documenso app, and the Twenty server and worker through the override file. Release `v0.2.17` straight after it.

### 5.2 Flag names (Q2 recommended; not contested by the owner)

| Name                                                                                                                                                                                                                       | Value                                                                                      | Default                                   | Meaning                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------- |
| `API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`, `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`, `APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `APPLICATION_API_RATE_LIMITING_LIMIT` | a whole number of at least 1; blank or whitespace means unset (no key is written)          | unset = image default                     | forwarded to Twenty server and worker       |
| `HARNESS_PG_STATS`                                                                                                                                                                                                         | exactly `1`; any other value, including empty, is off                                      | unset = off                               | H1 overlays and the extension               |
| `HARNESS_EL_PRELOAD`                                                                                                                                                                                                       | absolute path to a readable file; blank or empty means unset (off)                         | unset = off                               | H2 `--require` path, supplied by the caller |
| `HARNESS_EL_OUT`                                                                                                                                                                                                           | absolute path; created with `mkdir -p` when missing; chmod `0777` for Twenty (section 5.5) | required when `HARNESS_EL_PRELOAD` is set | where the preload writes its NDJSON lines   |

### 5.3 Module map (harness repo)

| file                                                                                                                                                   | status                                                                                                     | owner of the change | purpose                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `src/adapters/twenty-rate-limits.ts`                                                                                                                   | NEW (PR A)                                                                                                 | H4                  | allowlist, reader, validator, YAML text                                                   |
| `src/adapters/twenty-rate-limits.test.ts`                                                                                                              | NEW (PR A)                                                                                                 | H4                  | 12 tests                                                                                  |
| `src/adapters/twenty-runtime-override.ts`                                                                                                              | NEW (PR A; H2 keys in PR C)                                                                                | H4, H2              | writes or deletes `.harness/twenty.runtime.compose.yml`                                   |
| `src/adapters/twenty-runtime-override.test.ts`                                                                                                         | NEW (PR A: 3 tests; PR C: +2)                                                                              | H4, H2              | 5 tests after PR C                                                                        |
| `src/adapters/twenty.adapter.ts`                                                                                                                       | CHANGED (PR A: file list and override write; PR B: CREATE EXTENSION; PR C: none)                           | H4, H1              | `composeOpts()` at `:68–80` appends files; `up()` at `:144–147` writes the override first |
| `src/adapters/pg-stats.ts`                                                                                                                             | NEW (PR B)                                                                                                 | H1                  | flag check, overlay list, extension creation                                              |
| `src/adapters/pg-stats.test.ts`                                                                                                                        | NEW (PR B)                                                                                                 | H1                  | 6 tests (the five from section 9 plus the empty-value test)                               |
| `docker/medusa.pg-stats.compose.yml`, `docker/documenso.pg-stats.compose.yml`, `docker/cal.pg-stats.compose.yml`, `docker/twenty.pg-stats.compose.yml` | NEW (PR B, 4 static files)                                                                                 | H1                  | `command:` (see the rules in 5.5 for Cal and Twenty)                                      |
| `src/adapters/medusa.adapter.ts`, `src/adapters/documenso.adapter.ts`, `src/adapters/cal.adapter.ts`                                                   | CHANGED (PR B: overlay list and extension; PR C: env)                                                      | H1, H2              | see 5.5                                                                                   |
| `src/adapters/telemetry-env.ts`                                                                                                                        | NEW (PR C)                                                                                                 | H2                  | preload check, `NODE_OPTIONS` append, `serverProcessEnv`                                  |
| `src/adapters/telemetry-env.test.ts`                                                                                                                   | NEW (PR C)                                                                                                 | H2                  | 6 tests                                                                                   |
| `README.md`                                                                                                                                            | CHANGED (PR A, B, C: one "Environment knobs" entry each)                                                   | all                 | documents each knob and its default                                                       |
| `CHANGELOG.md`                                                                                                                                         | CHANGED (each PR adds a bullet under `## Unreleased` line 3; each release PR dates it with its merge date) | all                 | the release notes                                                                         |
| `package.json`                                                                                                                                         | CHANGED (release PRs only: `"version"` at line 3)                                                          | release             | version                                                                                   |
| `src/config.ts`                                                                                                                                        | NOT CHANGED                                                                                                | none                | zod schema stays for URLs, paths and tags (decision Q6)                                   |
| `docker/twenty.compose.yml`, `docker/medusa.compose.yml`, `docker/documenso.compose.yml`, `docker/cal.compose.yml`, `docker/medusa.redis.compose.yml`  | NOT CHANGED                                                                                                | none                | the base overlays stay byte-identical; the opt-in overlays are new files                  |

### 5.4 Skeletons (new functions)

```ts
// src/adapters/twenty-rate-limits.ts (NEW, PR A)
export const TWENTY_RATE_LIMIT_ENV = [
  "API_RATE_LIMITING_SHORT_TTL_IN_MS",
  "API_RATE_LIMITING_SHORT_LIMIT",
  "API_RATE_LIMITING_LONG_TTL_IN_MS",
  "API_RATE_LIMITING_LONG_LIMIT",
  "APPLICATION_API_RATE_LIMITING_TTL_IN_MS",
  "APPLICATION_API_RATE_LIMITING_LIMIT",
] as const;
export type TwentyRateLimitEnvName = (typeof TWENTY_RATE_LIMIT_ENV)[number];

/** Returns only the allowlisted names that the caller set to a non-blank value. Blank or whitespace = unset, and the key is
 *  never written for it (Twenty's CastToPositiveNumber turns "" into 0, so an empty key would set the limit to 0).
 *  The allowlist is the six names in TWENTY_RATE_LIMIT_ENV: APPLICATION_API_RATE_LIMITING_* does not match the API_RATE_LIMITING_* prefix, so it is listed by name.
 *  Throws TWENTY_RATE_LIMIT_NOT_INTEGER for any non-blank value that is not a whole number of at least 1. */
export function readTwentyRateLimitEnv(
  env: NodeJS.ProcessEnv,
): Partial<Record<TwentyRateLimitEnvName, string>>;
// throws Error: `TWENTY_RATE_LIMIT_NOT_INTEGER: ${name} must be a whole number of at least 1 (got "${raw}"). Unset it to keep the image default.`
// accepted pattern: /^[1-9][0-9]*$/ and Number.isSafeInteger(Number(raw))

/** YAML for server and worker with the same keys, or undefined when there are no keys. Values are digits only. */
export function twentyRateLimitComposeYaml(
  values: Partial<Record<TwentyRateLimitEnvName, string>>,
): string | undefined;
```

```ts
// src/adapters/twenty-runtime-override.ts (NEW, PR A; H2 keys added in PR C)
import fs from "node:fs";
import path from "node:path";
import { HARNESS_ROOT } from "../paths.ts";

export const TWENTY_RUNTIME_OVERRIDE_FILE = "twenty.runtime.compose.yml";

export interface RuntimeOverrideFs {
  writeFileSync(file: string, text: string): void;
  rmSync(file: string, opts: { force: true }): void;
  mkdirSync(dir: string, opts: { recursive: true }): void;
  chmodSync(dir: string, mode: number): void;
}

/** Writes path.join(HARNESS_ROOT, ".harness", "twenty.runtime.compose.yml") only when a key is needed
 *  (HARNESS_ROOT: src/paths.ts:5), and always removes a stale file first. Returns the absolute path written, or undefined.
 *  Validates every value before touching the disk. Throws whatever readTwentyRateLimitEnv throws (before any write). */
export function writeTwentyRuntimeOverride(opts: {
  env: NodeJS.ProcessEnv;
  fs?: RuntimeOverrideFs;
}): string | undefined;
```

```ts
// src/adapters/pg-stats.ts (NEW, PR B)
export type PgStatsProduct = "medusa" | "documenso" | "twenty" | "cal";

/** True only when the variable is exactly "1". Anything else (true, yes, blank, empty) is off. */
export function pgStatsEnabled(env: NodeJS.ProcessEnv): boolean;

/** Absolute path of the opt-in overlay for a product, or [] when the flag is off.
 *  The overlay files live in HARNESS_DOCKER_DIR (src/paths.ts:4). */
export function pgStatsComposeFiles(opts: {
  env: NodeJS.ProcessEnv;
  product: PgStatsProduct;
}): string[];

export interface PgStatsExec {
  project: string; // compose project name, e.g. qa-harness-medusa
  files: string[]; // the compose -f list the product already uses, plus the overlay
  service: string; // from the compose file: postgres for medusa, documenso; the fork service name for cal and twenty (step S0)
  user: string; // POSTGRES_USER of that service (medusa, documenso); the fork value for cal and twenty (step S0)
  db: string; // POSTGRES_DB of that service
  cwd: string;
}

/** Runs once after the product is healthy: docker compose -p <project> -f ... exec -T <service> psql -U <user> -d <db> -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements".
 *  Throws `HARNESS_PG_STATS: CREATE EXTENSION pg_stat_statements failed: <first 400 chars of psql stderr>`. */
export function createPgStatsExtension(
  opts: PgStatsExec,
  run: (cmd: string, args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>,
): Promise<void>;
```

```ts
// src/adapters/telemetry-env.ts (NEW, PR C)
export interface ElPreload {
  preload: string; // absolute path to a readable file
  out: string; // absolute path; created with mkdir -p when missing
}

/** undefined when HARNESS_EL_PRELOAD is unset, blank or empty.
 *  Throws `HARNESS_EL_PRELOAD must be an absolute path to a readable file (got "<raw>")`
 *  or `HARNESS_EL_OUT must be an absolute path when HARNESS_EL_PRELOAD is set`.
 *  Creates the out directory with mkdir -p when it is missing. */
export function elPreloadFromEnv(env: NodeJS.ProcessEnv): ElPreload | undefined;

/** Keeps the base flags and appends --require. */
export function appendNodeOptions(base: string | undefined, preload: string): string;
// returns [base, `--require=${preload}`].filter(Boolean).join(" ")

/** The env of one server process: the base env plus the preload keys. role is "server" or "server-2"; it is written to HARNESS_EL_ROLE. */
export function serverProcessEnv(
  base: Record<string, string>,
  role: "server" | "server-2",
  el: ElPreload | undefined,
): Record<string, string>;
```

### 5.5 Adapter wiring (exact functions, same style as the existing code)

- **Cal (PR C):** only the web-server caller gets the preload: `cal.adapter.ts:463` (the spawn with `logFile` and
  `spec.detached`, which runs the `start` script read at `cal-web-process.ts:31–35`; build-time re-check, section 4).
  The callers at `:228`, `:247`, `:255` and `:445` keep the heap-only env. The body of `nodeHeapEnv()`
  (`cal.adapter.ts:101–106`) becomes a call to a new exported pure function `calNodeHeapEnv(process.env)` so that it
  can be tested without starting Cal. Its result is `{NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: heap}` when the flag
  is off (byte-identical to `v0.2.15`), and `{NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: appendNodeOptions(heap, preload), HARNESS_EL_OUT: out, HARNESS_EL_ROLE: "server"}`
  when on. The `:463` caller passes `calNodeHeapEnv` for the web server; the others pass the heap-only result.
- **Medusa (PR B and C):** `backendProcessEnv()` (`medusa.adapter.ts:274–281`) stays byte-identical in PR B and PR C.
  PR C adds `serverProcessEnv(base, role, el)`, which returns `{...base, NODE_OPTIONS: appendNodeOptions(base.NODE_OPTIONS, el.preload), HARNESS_EL_OUT: el.out, HARNESS_EL_ROLE: role}`
  when `el` is set and `base` otherwise. It is used only at the backend spawns `:939` (role `server`) and `:1030` (role
  `server-2`). `runPnpm` (`:385`: build, migrate, seed) and `:1314` never get the preload; a test proves that with the
  flag on, the `runPnpm` env has no `--require`. In PR B the medusa `up()` calls `createPgStatsExtension` after the
  compose service is healthy, and `composeUp` gets the overlay from `pgStatsComposeFiles` (copy how the Redis overlay is appended).
- **Documenso (PR B and C):** `appEnv()` (`documenso.adapter.ts:95–97`) returns `buildDocumensoAppEnv(cfg)` when the flag is
  off. PR C adds the same keys (role `server`). Export the body as `documensoAppEnvWithPreload(base, processEnv)`.
- **Twenty (PR A and C):** `composeOpts()` (`twenty.adapter.ts:68–80`) appends `.harness/twenty.runtime.compose.yml` when
  it exists, and the Twenty pg-stats overlay when `pgStatsEnabled`. `up()` (`:144–147`) calls `writeTwentyRuntimeOverride`
  first and `createPgStatsExtension` (service from step S0) after the health check. The H2 keys for Twenty (PR C) go
  into the same override file for `server` and `worker`: `NODE_OPTIONS: --require=/harness/el/preload.cjs`,
  `HARNESS_EL_OUT: /harness/el-out`, `HARNESS_EL_ROLE: server|worker`, a `:ro` volume for the preload file, and a
  read-write volume for the out directory. After `mkdir -p`, the harness runs `chmod 0777` on the out directory before
  writing the override, because the container runs as UID 1000 and the runner user differs (check with `id -u` in the
  build). The preload file's own directory stays `0755`. Test: the mode after setup is `0777`.
- **H1 overlays for Cal and Twenty (PR B, after S0):** each overlay names the fork's exact Postgres service
  (Cal's `postgres` or the name S0 records; Twenty's `db`). If S0 finds an existing `command:` in the fork file, the overlay
  copies that command and appends `-c shared_preload_libraries=pg_stat_statements -c track_io_timing=on`; it never
  replaces it. An overlay that names a missing service creates a broken service, so S0 must succeed before the overlay is written.

### 5.6 Data flow

env (`process.env` of `npm run up:<product>`) → reader (`readTwentyRateLimitEnv`, `pgStatsEnabled`, `elPreloadFromEnv`) →
adapter builds its env map or compose file list → `composeUp` or `spawn` → product process. The harness never writes a
secret. It writes numbers, paths and the preload path only.

### 5.7 Interface for Lane B

- **Env names H4 forwards (PR A):** `API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`,
  `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`, `APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `APPLICATION_API_RATE_LIMITING_LIMIT`. Only these six; nothing else is forwarded (Q4 DECIDED).
- **How a P6 job sets them:** in the step-level `env:` of `Start Twenty (harness up)`, right before `npm run up:twenty`.
  Whole numbers of at least 1. Never set one to an empty string (the image reads it as 0; row 18).
- **How to confirm a value arrived (value only):** `docker exec "$(docker compose -p qa-harness-twenty ps -q server)" printenv API_RATE_LIMITING_SHORT_LIMIT`,
  and the same for `worker`. The build session verifies the `-p` form works without the `-f` list.
- **Harness tag Lane B waits for:** `v0.2.16` (H4 only, decided).

## 6. Oracles and verdict rules

- A flag set to anything other than its exact value is OFF (`HARNESS_PG_STATS`; `HARNESS_EL_PRELOAD` blank or empty).
- An invalid H4 value is an error before any file is written (exit code non-zero from `up()`).
- An H2 path that is not absolute or not readable is an error, never a silent off.
- `CREATE EXTENSION` failure is an error (`up()` fails with the psql message). No retry loop.
- Default run (no flag, no `HARNESS_*`, no `API_RATE_LIMITING_*`): every env map and compose file list is equal to `v0.2.15`.
  Tests compare the arrays and objects with `assert.deepEqual`.

## 7. Data isolation, cleanup and leak check

Not applicable to the harness repo: the unit tests use fake filesystems and fake runners, make no network calls and start
no container. The only file the harness writes is `.harness/twenty.runtime.compose.yml`, which is git-ignored (`.gitignore:5`)
and removed on the next `up()` when no key is needed. The preload file is supplied by the caller and is never copied or
logged by the harness.

## 8. CI budget (harness repo)

No P6 job changes in Task 1, so there is no P6 budget table. The harness CI (`.github/workflows/ci.yml`) has two jobs:
`actionlint` with `timeout-minutes: 5` (`ci.yml:34`) and `typecheck and build` with `timeout-minutes: 10` (`ci.yml:55`),
which runs `npm run typecheck` and `npm test` (`ci.yml:72–73`). The added tests must keep the test job's margin at least
10 minutes; the build session measures it in each PR. Run triggers: harness PR (every push) and `main` pushes, unchanged.

## 9. Expected output

- **Unit counts (`npm test`, the harness gate):**

| after PR  | new tests | `# tests` | per-file breakdown                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseline  | 0         | 243       | none                                                                                                                                                                                                                                                                                                                                                                                                                |
| PR A (H4) | 15        | 258       | `twenty-rate-limits.test.ts` 12 (the 6 reader tests, plus one test per allowlisted variable: 6); `twenty-runtime-override.test.ts` 3 (no key, exact values, invalid value throws before write)                                                                                                                                                                                                                      |
| PR B (H1) | 6         | 264       | `pg-stats.test.ts` 6 (exact `1` is on; `true` is off; the empty value is off; the extension argv; the extension error text; the no-flag file list is `[]`)                                                                                                                                                                                                                                                          |
| PR C (H2) | 8         | 272       | `twenty-runtime-override.test.ts` +2 (Twenty preload mount; out directory mode `0777`); `telemetry-env.test.ts` 6 (1 preload unset, blank or empty; 2 relative or missing preload throws; 3 `appendNodeOptions` keeps the base flags; 4 Cal env byte-identical when off and heap kept on for `:463` only; 5 Medusa `serverProcessEnv` on and off, and `runPnpm` env has no `--require`; 6 Documenso env on and off) |

The gate is `# tests` and `# pass` (zero `# fail`). The expected final count is 272 with one skip (`# skipped 1`, unchanged).

- **Test names (H4 PR A, exact):** `reads nothing when no allowlisted name is set`; `treats blank and whitespace values as unset`;
  `returns exactly the set allowlisted names with their values`; `never reads a name outside the allowlist`;
  `rejects 0, negatives, decimals, leading zeros and text naming the variable`; `writes the same keys for server and worker`;
  `writes nothing and removes a stale file when no key is needed`; `writes the server and worker limits with exact values`;
  `throws before any write when a value is invalid`; and one test per allowlisted variable (six, in `twenty-rate-limits.test.ts`): `forwards API_RATE_LIMITING_SHORT_TTL_IN_MS with its exact value`, `forwards API_RATE_LIMITING_SHORT_LIMIT with its exact value`, `forwards API_RATE_LIMITING_LONG_TTL_IN_MS with its exact value`, `forwards API_RATE_LIMITING_LONG_LIMIT with its exact value`, `forwards APPLICATION_API_RATE_LIMITING_TTL_IN_MS with its exact value`, `forwards APPLICATION_API_RATE_LIMITING_LIMIT with its exact value`. Each sets the variable to a whole number, checks the server and worker keys, and checks that a blank value writes no key.
- **Example CHANGELOG bullet (PR A, under `## Unreleased`):** `- Optional API_RATE_LIMITING_SHORT_TTL_IN_MS, API_RATE_LIMITING_SHORT_LIMIT, API_RATE_LIMITING_LONG_TTL_IN_MS, API_RATE_LIMITING_LONG_LIMIT, APPLICATION_API_RATE_LIMITING_TTL_IN_MS and APPLICATION_API_RATE_LIMITING_LIMIT are written into the Twenty server and worker when set to a whole number of at least 1. Blank or unset keeps the image default. Nothing else is forwarded.`
- **Release sections:** `## v0.2.16 — <merge date>` (PR A bullet) and `## v0.2.17 — <merge date>` (PR B and PR C bullets).
- **Job summary, artefacts:** none (harness repo). No artefacts.

## 10. Environment changes

**No environment change** in Cursor cloud or Claude Code cloud. The harness build needs `npm ci` and Node (already in both
setups; `package.json` engines `>=20`). Docker is not needed for the unit tests. The one-shot probes in Appendix A need only
the Twenty and Postgres images already pulled in this session, and step S0 reads fork files, not images.
Nothing is added to `.cursor/environment.json`, `.cursor/Dockerfile`, `.claude/hooks/session-start.sh` or the setup script.

## 11. Build order (harness repo; one commit per step; `npm run check` before every push; merge commits only)

Commit messages are lowercase Conventional Commits. The harness PR titles are checked the same way.

1. **S1 branch and baseline (PR A).** `git fetch origin && git switch -c feat/2026-10-29-harness-twenty-rate-limits origin/main`;
   `npm ci`; `npm run check`. Expected `# tests 243`. Stop and explain if it differs.
2. **S2 (PR A) reader.** Create `src/adapters/twenty-rate-limits.ts` and `twenty-rate-limits.test.ts` (skeleton 5.4).
   `npm run check` → `# tests 255`. Commit: `feat(twenty): add the allowlisted API_RATE_LIMITING reader`.
3. **S3 (PR A) override.** Create `src/adapters/twenty-runtime-override.ts` and its test (3 tests). Wire `composeOpts()` and
   `up()` in `src/adapters/twenty.adapter.ts`. `npm run check` → `# tests 258`.
   Commit: `feat(twenty): write the runtime override only when a limit is set`.
4. **S4 (PR A) docs.** `README.md` "Environment knobs" entry for the four names and the CHANGELOG bullet under line 3.
   `npm run check` → still 258. Commit: `docs(harness): document the twenty rate-limit passthrough`.
5. **S5 (PR A) push and PR.** `git push -u origin feat/2026-10-29-harness-twenty-rate-limits`; PR title
   `feat: forward allowlisted twenty rate-limit env`. Owner merges with **Create a merge commit** (owner step owner-1).
   5b. **S5b release `v0.2.16` (H4 only).** After PR A is merged, branch `chore/<date>-harness-release-0-2-16` from the updated
   `origin/main`. Set `package.json:3` `"version": "0.2.16"`; move the Unreleased bullet under `## v0.2.16 — <merge date>`;
   `npm run check`. Commit: `chore(release): 0.2.16`; PR title `chore(release): 0.2.16`. Owner merges (merge commit) and creates
   the tag `v0.2.16` on `main` in the GitHub web UI. **Lane B Task 3 starts from this tag.**
6. **S0 fork compose probe (before PR B; no code).** Clone the Cal and Twenty forks at the refs the P6 bootstrap pins, and read
   `<cal>/packages/prisma/docker-compose.yml` and `<twenty>/packages/twenty-docker/docker-compose.yml`. Record for each: the
   Postgres service name, the image and its major version, the `POSTGRES_USER` and `POSTGRES_DB`, and any existing `command:`.
   Paste the four facts into the PR B description. If a service name is missing, stop PR B and report it (section 5.5).
   Commit: none (a finding, not a file).
7. **S6 (PR B) H1 overlays.** Branch `feat/<date>-harness-pg-stats` from `main` after PR A is merged. Create the four
   `docker/<product>.pg-stats.compose.yml` files with the service names from S0 (section 5.5 rules). Commit:
   `feat(harness): add opt-in pg_stat_statements overlays`. `npm run check` → still 258 (no test yet).
8. **S7 (PR B) H1 logic.** Create `src/adapters/pg-stats.ts` and `pg-stats.test.ts` (6 tests). Wire the overlay list and
   `createPgStatsExtension` into the four adapters. `npm run check` → `# tests 264`.
   Commit: `feat(harness): create pg_stat_statements once after start when HARNESS_PG_STATS=1`.
9. **S8 (PR C) H2 helpers.** Branch `feat/<date>-harness-el-preload` from `main` after PR B is merged. Create
   `src/adapters/telemetry-env.ts` and its test (6 tests). `npm run check` → `# tests 270`.
   Commit: `feat(harness): add the opt-in event-loop preload helpers`.
10. **S9 (PR C) H2 wiring.** Add `serverProcessEnv`, `calNodeHeapEnv`, `documensoAppEnvWithPreload`; add the Twenty keys, the
    preload mount and the `chmod 0777` step to `writeTwentyRuntimeOverride` with its two tests (total 272).
    `npm run check` → `# tests 272`. Commit: `feat(harness): forward the opt-in event-loop preload to each product`.
11. **S9b release `v0.2.17`.** After PR C is merged, branch `chore/<date>-harness-release-0-2-17` from the updated `origin/main`.
    Set `package.json:3` `"version": "0.2.17"`; move the PR B and PR C bullets under `## v0.2.17 — <merge date>`; `npm run check`.
    Commit: `chore(release): 0.2.17`; PR title `chore(release): 0.2.17`. Owner merges and creates the tag `v0.2.17` on `main`.
12. **S11 proof.** In P6 (Task 2b-ii), re-pin to `v0.2.17` and run the medusa-load job once: that is the consumer check (Q10).
    Nothing to do in the harness.

Owner step owner-1: merge each PR with **Create a merge commit** (never squash).

## 12. Extra risky cases (EXTRA, not in the roadmap IDs; included only if the budget allows)

| EXTRA             | question                                                                                              | oracle                                                                                                                                                                        | cost                |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| EXTRA-H4-BOUNDARY | Does the reader accept exactly 1 and 2^53-1, and reject 0, 2^53 and 1e3?                              | unit test with those inputs; errors name the variable                                                                                                                         | ~10 min, no product |
| EXTRA-H1-REPLAY   | After a flagged `up`, does an unflagged `up` leave no overlay and no extension call (no stale state)? | `pgStatsComposeFiles` returns `[]` with the flag unset in the same process                                                                                                    | ~5 min, no product  |
| EXTRA-H2-PERM     | Does `elPreloadFromEnv` refuse a preload that the process cannot read, before any product starts?     | `fs.accessSync(path, fs.constants.R_OK)` in a test with a file mode 000 (skipped on Windows, and skipped as root, because root can read any file; the skip prints its reason) | ~10 min, no product |

## 13. Risks, roadmap conflicts and open decisions

### 13.1 Conflicts with the roadmap and with the probe

| roadmap says                                                                         | probe shows                                                                                                                       | decision or open question                                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Harness `v0.2.11` (lines 45–78)                                                      | `v0.2.15` is the tag (`package.json:3`, CHANGELOG line 5)                                                                         | Use `v0.2.15` as base; next tags `v0.2.16` and `v0.2.17`                                                                     |
| `cal.adapter.ts` lines 89–93 for `nodeHeapEnv()` (lines 60–61)                       | the function is at `:101–106`; lines 89–93 are the `bundler()` helper now                                                         | Cite `:101–106`; the callers are `:228, :247, :255, :445, :463` (not the `:230, :249, :257, :447, :465` in an earlier draft) |
| Medusa `backendProcessEnv()` at lines 253–259 (lines 62–63)                          | the function is at `:274–281`                                                                                                     | Cite `:274–281`; it stays byte-identical                                                                                     |
| H1/H2/H4 read through `src/config.ts` ("flag parsing", line 248)                     | `src/config.ts` is a zod schema for URLs, paths and the tag; adapters read switches from `process.env` (rows 5 and 27)            | Q6: adapters, same as Medusa and Documenso                                                                                   |
| "one new tag" (scope, line 244)                                                      | two tags, decided by the owner                                                                                                    | Q1 DECIDED: `v0.2.16` (H4) and `v0.2.17` (H1 + H2)                                                                           |
| H4 "allowlist of the `API_RATE_LIMITING_*` names" (line 241; the roadmap D6 wording) | the image has 4 `API_RATE_LIMITING_*` and 2 `APPLICATION_API_RATE_LIMITING_*` names (row 17); Q4 DECIDED: all six are allowlisted | Q4                                                                                                                           |
| "a passthrough of `${…}`" is implied by the compose-style harness                    | compose `${K:-}` writes `""` which the image reads as 0 (rows 11 and 18)                                                          | Override file, written only when set                                                                                         |
| "the preload output leaves the container" (Note 3, line 206)                         | containers need a mount; the caller supplies `HARNESS_EL_OUT` (row 9)                                                             | Q7                                                                                                                           |
| `auto_explain` and `log_min_duration_statement` in H1 (roadmap lines 129, 230, 254)  | `auto_explain` needs a running database to measure its log volume (row 25)                                                        | DEFERRED (Q3): H1 ships `pg_stat_statements` and `track_io_timing` only                                                      |
| Read-only role for P6 reads of `pg_stat_statements` (roadmap lines 252, 301)         | the harness creates the extension as the container superuser (row 23); a role with `pg_read_all_stats` needs DDL                  | RECORDED DEVIATION: P6 reads as the container superuser; a follow-up adds a `pg_read_all_stats` role                         |
| `CHANGELOG.md` "existence to verify" (line 248)                                      | exists, with an empty Unreleased (row 2)                                                                                          | Use it                                                                                                                       |

### 13.2 Open decisions (DECIDED by the owner unless marked otherwise)

- **Q1 (Q-TAG). DECIDED: two tags.** `v0.2.16` = H4 only (unblocks Lane B); `v0.2.17` = H1 + H2. The roadmap's single tag
  is not used.
- **Q2 (Q-NAMES).** Flag names. **Recommendation (kept):** `HARNESS_PG_STATS=1`, `HARNESS_EL_PRELOAD=<abs path>`,
  `HARNESS_EL_OUT=<abs dir>` (the roadmap's example, one name per concern).
- **Q3 (Q-AE). DECIDED: deferred.** `auto_explain` and `log_min_duration_statement` are not in this release (they need a
  running database to measure the log volume, row 25). H1 ships `pg_stat_statements` and `track_io_timing` only.
- **Q4 (Q-APP). DECIDED by the owner: yes.** The allowlist holds all six names: the four `API_RATE_LIMITING_*` names and
  `APPLICATION_API_RATE_LIMITING_TTL_IN_MS` and `APPLICATION_API_RATE_LIMITING_LIMIT`. The prefix `API_RATE_LIMITING_*` does not
  match the `APPLICATION_` names, so each is listed by name. P6 Task 3's functional profile and the O9 printenv check need all six.
  This supersedes the roadmap D6 wording ("API_RATE_LIMITING_* only").
- **Q5 (Q-TW-EL).** Twenty half of H2 in the H2 release. **Recommendation (kept): include it now**, in the same override file
  as H4 (tests only; P6 switches it on in Task 3).
- **Q6 (Q-CONFIG).** Read flags in `process.env` in small modules. **Recommendation (kept): small modules**, so `src/config.ts`
  is not touched.
- **Q7 (Q-EL-OUT). DECIDED in fix 4 of the review:** the harness creates the out directory with `mkdir -p` when missing
  (absolute path required), so P6 needs no run-line change; for Twenty the harness also runs `chmod 0777` on it (section 5.5).
  The preload writes `<HARNESS_EL_OUT>/el-<pid>.ndjson` (numbers only). The preload file is mode `0644` and its directory `0755`.
- **Q8 (Q-PR-ORDER). DECIDED by the owner:** H4, then H1, then H2, merge commits only. Release `v0.2.16` straight after
  H4 (step S5b). The PRs touch different functions in shared adapters; a conflict is resolved by merging `origin/main`
  into the branch (a merge commit), never by rebasing a pushed branch.
- **Q9 (Q-EXT-ROLE).** The harness runs `CREATE EXTENSION` as the container superuser (row 23). **Recommendation (kept): yes**,
  as the roadmap's H1 text says. The read-only role is the recorded deviation in section 13.1.
- **Q10 (Q-CONSUMERS).** Owner runs P1 on the new tag before calling it safe (roadmap done-when, line 269). Not a build blocker.

### 13.3 Risks

- P1 regressions: mitigated by the three-way off tests (row 27) and the byte-identical default.
- `CREATE EXTENSION` on a reused volume: `IF NOT EXISTS` makes it idempotent; the preload must be in the command (the
  server refuses the statement otherwise, and `up()` fails with the psql message).
- Preload output leaking secrets: the preload writes numbers only, and P6 token-scans the directory (Task 2).
- Stale override: removed on every `writeTwentyRuntimeOverride` call (test 7).
- Empty value trap: the writer never writes a key without a validated value (rows 11 and 18); empty `HARNESS_*` values are off.
- Preload I/O: the preload does synchronous `appendFileSync` writes once a second (Task 2 wraps them in try/catch).

## 14. Done when

Copied from the roadmap (lines 267–269), adjusted by the decisions above:

- Harness PRs merged under two tags: `v0.2.16` (after PR A) and `v0.2.17` (after PR C), each with its CHANGELOG section and the
  tag on `main`.
- Every flag defaults off, and each default has a test (unset, near-miss, exact, and empty).
- Harness tests green on each tag, including the test that a non-allowlisted variable is not passed (H4; test 4).
- `auto_explain` is deferred (Q3); the read-only role is a recorded deviation (section 13.1).
- P1 green on the tag, or the owner confirms no impact (Q10).

**Rule self-check (section 0 of the Phase 5 prompt):**

- N1–N5: met (no stop before the end; no secret printed; every fact cites a path, command or output; failures labelled).
- R1–R3: met (GitHub tools used read-only; no harness push from this session; only explicit paths staged in P6).
- R4–R8: met or not applicable (no force push; no merge by the planner; no GitHub comment posted; no owner name in repo text).
- O1–O3: met (this file is the only Task 1 file; planning only).
- O4: met (no `.env` value, no token, no `pk_` key printed).
- O5: met (no private finding named or described).
- O6: met (no case ID renumbered; none mapped here).
- O7–O8: met (no threshold changed; no GitHub client command in the plan).
- C1–C5: not applicable to P6 (no P6 job change in Task 1; the harness CI margin is in section 8).
- E1: met (section 10: no environment change, with the reason).
- Repo rule A.6 and B.10 (plan branches never get a PR): followed; no PR for the plan branch.

## Appendix A. One-shot probe commands (for the build-time re-check)

These start no server and no product. Each one runs in a throwaway container with `--rm`.

```bash
export PATH="/usr/local/bin:$PATH"
docker image inspect twentycrm/twenty:v2.44.0 --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}} WorkingDir={{.Config.WorkingDir}} User={{.Config.User}}'
docker run --rm --entrypoint node twentycrm/twenty:v2.44.0 -v
docker run --rm --entrypoint sh twentycrm/twenty:v2.44.0 -c 'grep -n "API_RATE_LIMITING_" /app/packages/twenty-server/dist/engine/core-modules/twenty-config/config-variables.js'
docker run --rm --entrypoint sh postgres:15 -c 'ls /usr/share/postgresql/*/extension | grep pg_stat_statements'
docker run --rm postgres:15 postgres --describe-config | grep -E '^(shared_preload_libraries|track_io_timing)'
```

Compose substitution, in an empty temporary folder:

```bash
cat > compose.yml <<'EOF'
services:
  x:
    image: busybox
    environment:
      API_RATE_LIMITING_SHORT_LIMIT: ${API_RATE_LIMITING_SHORT_LIMIT:-}
EOF
env -u API_RATE_LIMITING_SHORT_LIMIT docker compose -f compose.yml config   # expect: API_RATE_LIMITING_SHORT_LIMIT: ""
```

Config-class probe (mounts a readable folder; expected output shown in row 18):

```js
// cfgprobe.cjs (mount it read-only in a folder with mode 755, run with NODE_PATH set)
const { plainToInstance } = require("class-transformer");
const mod = require("/app/packages/twenty-server/dist/engine/core-modules/twenty-config/config-variables.js");
const Cls = mod.ConfigVariables ?? Object.values(mod).find((v) => typeof v === "function");
const cases = {
  unset: {},
  empty: { API_RATE_LIMITING_SHORT_LIMIT: "" },
  spaces: { API_RATE_LIMITING_SHORT_LIMIT: "   " },
  text: { API_RATE_LIMITING_SHORT_LIMIT: "abc" },
  set500: { API_RATE_LIMITING_SHORT_LIMIT: "500" },
};
for (const [name, env] of Object.entries(cases))
  console.log(name, plainToInstance(Cls, env).API_RATE_LIMITING_SHORT_LIMIT);
```

Run it: `docker run --rm -e NODE_PATH=/app/node_modules:/app/packages/twenty-server/node_modules -v <dir>:/probe --entrypoint node twentycrm/twenty:v2.44.0 /probe/cfgprobe.cjs`.
Expected: `unset 100`, `empty 0`, `spaces 0`, `text null`, `set500 500`.
