# P6 Phase 5 Task 7: weekly soak capture and the soak trend view

Planning only. This file is the build guide for Task 7. No code, workflow, README or test changes are made by the planning session.

## 1. Header

| Field                     | Value                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                      | 2026-10-29 (Asia/Colombo)                                                                                                                                 |
| Plan branch               | `plan/2026-10-29-p6-phase5-task7`                                                                                                                         |
| Build branch              | `feat/2026-10-29-p6-soak-trend` (roadmap pattern `feat/<date>-p6-soak-trend`, roadmap line 159)                                                           |
| Mapped case IDs           | None. The roadmap says "Long soak trend, no mapped ID" (line 468, line 141). No ID is invented here.                                                      |
| Roadmap section           | Task 7 "Long soak trend (view)", roadmap lines 465–496. Task table row line 159. D8 lines 561–564. Note 4 lines 208–212. Phase 5 cases row line 141.      |
| Base SHA of main          | `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 03:48 UTC = 09:18 Asia/Colombo)                                                                    |
| Agreed decisions embedded | (a) capture is built here; (b) the trend view is built and tested on fixtures; (c) "collecting (n/3 weeks)" until 3 VALID weekly points. See section 6.1. |

## 2. What it proves

There is no mapped case ID. The task proves two things about the weekly soak, which is a measurement and not a gate.

- **Capture (no verdict, only evidence).** Every weekly 2 h scheduled soak run either leaves one token-scanned summary per product in a `p6-soak-<yyyy>-w<ww>` release, or leaves a visible gap for that week with the reason. A run is never silently dropped. Question: does each week's soak leave a comparable record? Oracle: the summary schema v1 (section 6.4) and the validity rule (section 7). Verdict words for the capture job: **PUBLISHED** (release created, all summaries present), **PUBLISHED WITH GAPS** (release created, one or more products are INVALID or missing, each with its reason), **REFUSED** (the week's tag already exists, or a validation step failed; nothing is changed), **NOT RUN** (the run is not a weekly point, for example a nightly 30-min run).
- **Trend view (measure only, no threshold).** The dashboard shows, per product, the weekly RSS, fds and DB-connection slopes and plateau ratios, plus a health-probe latency proxy, with a link to each week's run. Question: does slow degradation show across weeks? Oracle: the pure trend function (section 6.7) on fixtures. Verdict words for the view: **collecting (n/3 weeks)** (fewer than 3 VALID points for the product), **trend** (3 or more VALID points: the chart is drawn). There is no PASS or FAIL in the trend. The roadmap says "No trend threshold or gate (measure-only)" (line 482).

Transfer: a payments platform or an EHR interface team watches the slow drift between upgrades. The view answers "is the memory of the service creeping over weeks?" without a gate.

## 3. Live probe evidence

All probes are read-only. Public REST reads and artefact zip downloads were done without a credential. No product was started. Redaction: no env value or token was printed. Raw downloads live under the scratch folder `$HOME/p6t7-probe/` and were never committed.

| #    | fact                                                                                       | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                             | what it changes in the design                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | main is at `5215127`; the git identity is the repo owner's login, not the excluded account | `git fetch origin main`, `git rev-parse HEAD` = `5215127a038d…`; `git log 5215127..origin/main` empty; the GitHub "authenticated user" call returned login `Jayami123`                                                                                                                                                                                         | none; H1 and H2 do not apply                                                                                                                                                                         |
| P-02 | Unit baseline B0                                                                           | `npm ci` exit 0; `npm run check` exit 0; `# tests 1405`, `# fail 0` (log `$HOME/p6t7-check.log`)                                                                                                                                                                                                                                                               | B0 = 1405, not the 1403 in the prompt. All unit counts below are B0 + planned additions.                                                                                                             |
| P-03 | Scheduled soak runs so far                                                                 | `GET /repos/Jayami123/k6-load-concurrency-suite/actions/workflows/397232763/runs?event=schedule` returned `total_count: 2`: `40796699639` (started 2026-10-29 00:50 UTC = 06:20 Asia/Colombo, Thu) and `40608932903` (2026-10-28 00:28 UTC = 05:58 Asia/Colombo, Wed). Both `head_branch: main`, `conclusion: success`, `event: schedule`.                     | No weekly 120-min run exists yet.                                                                                                                                                                    |
| P-04 | Scheduled runs start hours after the cron, so the start day cannot identify a weekly run   | Cron `11 21 * * 1-6` (soak.yml line 19) fired at 21:11 UTC; run 40608932903 started 00:28 UTC, about 3 h 17 min later. Run 40796699639 started 00:50 UTC.                                                                                                                                                                                                      | Weekly detection must not use the start day. It uses the event, the artefact suffix and `run-meta.json` (section 6.5, decision D-T7-2).                                                              |
| P-05 | Weekly cron and week tag                                                                   | soak.yml line 20 `"29 19 * * 0"` = Sunday 19:29 UTC. `date -u -d 2026-11-01T19:29:00Z +%G-w%V` = `2026-w44`; Colombo `2026-11-02 00:59 Mon`. W45 = `2026-w45` (2026-11-09 Colombo), W46 = `2026-w46` (2026-11-16 00:59 Colombo).                                                                                                                               | First weekly point is W44. Earliest exit from "collecting" is in section 14 (Q-EXIT).                                                                                                                |
| P-06 | Artefacts of the nightly run exist with 90-day retention                                   | `GET …/actions/runs/40796699639/artifacts` returned `soak-documenso-30` (id 12868557735, 3879758 bytes), `soak-medusa-30` (12866224407, 1697397), `soak-cal-30` (12865771150, 3549718); `created_at` 2026-10-29, `expires_at` 2027-01-27T00:50:55Z. soak.yml `retention-days: 90` at lines 230, 408, 574.                                                      | Backfill window is 90 days from the run's creation (section 6.5). Note 4's "14 days" (roadmap line 87) applies to older artefacts (`docs/releases/p6-phase1.md`), not to soak artefacts.             |
| P-07 | Artefact zips download without a credential on this public repo                            | `GET …/actions/artifacts/12865771150/zip` returned HTTP 200, `application/zip`, 3549718 bytes. Same for the other two.                                                                                                                                                                                                                                         | The probe needed no token. The build uses `gh run download` with `GITHUB_TOKEN`, as evidence-release does (evidence-release.yml line 139).                                                           |
| P-08 | Token scan of the raw downloads is clean                                                   | `node scripts/evidence-token-scan.mjs <each dl folder>` printed `token scan: clean` for cal, medusa, documenso (exit 0).                                                                                                                                                                                                                                       | The capture may scan the raw download first.                                                                                                                                                         |
| P-09 | gitleaks over the raw downloads with the repo config is clean                              | gitleaks 8.30.1 (archive sha256 `551f6fc8…` verified) `gitleaks dir <dl> --config .gitleaks.toml --no-banner --exit-code 1` exit 0 with "no leaks found" for all three products.                                                                                                                                                                               | The capture job can use the same gitleaks gate as evidence-release, with no allowlist change.                                                                                                        |
| P-10 | Medusa artefact has a different folder layout                                              | `find` on `soak-medusa-30`: `load-medusa/P6-MED-LOAD-005/20261029T012535Z-394387af/…`. Cal and Documenso: `P6-CAL-LOAD-008/<attempt>/…` and `P6-DOC-LOAD-006/<attempt>/…`. Cause: soak.yml lines 393–400 stage `results/load/` into `stage/load-medusa/`, and the upload path is `stage/` (line 406).                                                          | The reader must walk the tree and map the product from `caseId` in `run-meta.json`, never from a path. The mapping is the same as `PRODUCT_BY_CASE` in src/dashboard/soak/read-trends.ts lines 8–12. |
| P-11 | `soak.json` fields                                                                         | Cal `soak.json` keys: `verdict`, `reasons`, `statistics.{durationSec, warmupSec, rssMb, fds, dbConnections, rssD33}`; each metric has `slope.{slopePerMin, theilSenPerMin}` and `plateau.ratio`. Source: src/load/soak/report.ts lines 42–62; run-load.ts lines 85–134.                                                                                        | The summary takes RSS, fds and connections from here. The field called "connections" in the roadmap is `dbConnections` (Postgres total connections).                                                 |
| P-12 | No p95 field exists in the soak result                                                     | `grep` of soak.json, report.ts and verdict.ts for `p95`: no match. The only latency series in the telemetry is `samples[].probe.ms` (1 Hz health probe).                                                                                                                                                                                                       | Roadmap term "p95 slope" (line 476) needs an owner decision (Q-P95, section 14).                                                                                                                     |
| P-13 | Telemetry sample shape                                                                     | `telemetry-main.json` keys: `gaps, intervalMs, limits, product, samples, schema, sources, startedAtMs, stoppedAtMs`; sample keys: `container, db, log, probe, proc, sampleCostMs, t`; `intervalMs` 1000; 1801 samples; `gaps` 0; `sources.probe.present` true. Example probe sample `{ok: true, status: 200, ms: 231}` (Cal) and `{…ms: 4}` (Medusa).          | The health-probe proxy can be read per sample with `probe.ms`.                                                                                                                                       |
| P-14 | run-meta.json fields                                                                       | `environment.{kind, event, workflow, ref, sha, runUrl, attempt, imageVersion}`; `software.{k6, harness, node, products.{cal, medusa, documenso}}`; `durationSec`; `caseId`; `runId`. Cal run-meta: `event: schedule`, `ref: main`, `k6: 2.3.0`, `harness: v0.2.15`, `products.cal: c2b7ac44…`, `durationSec: 1800`. Source: src/load/run-meta.ts lines 52–110. | Product SHA, harness tag, k6 version, run URL and event come from here.                                                                                                                              |
| P-15 | Verdicts of the nightly run                                                                | All three products: `verdict: NO THRESHOLD YET`, `reasons: ["no soak-bounds.json entry for this product"]`. `k6/thresholds/soak-bounds.json` has `"products": {}`.                                                                                                                                                                                             | Every week is NO THRESHOLD YET until the bounds are calibrated. The validity rule must not depend on PASS (section 7).                                                                               |
| P-16 | Measured slopes in the nightly 30-min runs (observation, not a verdict)                    | Documenso `rssMb.slope.theilSenPerMin` 11.95 MB/min, plateau ratio 1.044. Cal 0.507 MB/min. Medusa 0.330 MB/min. The known observation is `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`.                                                                                                                                                        | The view shows the numbers with their run links. It draws no verdict.                                                                                                                                |
| P-17 | Release list today                                                                         | `GET …/releases?per_page=30`: 5 releases, all `p6-*`: `p6-phase4c`, `p6-phase4`, `p6-phase4a`, `p6-phase3`, `p6-phase1`. No `p6-soak-*`. `rg`/Grep for `p6-soak` under `.github/`: no matches.                                                                                                                                                                 | Nothing exists to read yet; the capture creates the first weekly release.                                                                                                                            |
| P-18 | Existing evidence release needs a committed notes file                                     | evidence-release.yml lines 76–78 require `docs/releases/$TAG.md` on main with an H1; line 39 lists workflow ids `376454455 396253729 397232763 398161444`.                                                                                                                                                                                                     | A weekly capture cannot use evidence-release without a committed notes file per week. Q-CAPTURE option (c) is rejected (section 14).                                                                 |
| P-19 | A release created by `GITHUB_TOKEN` still triggers a `workflow_run` consumer               | Evidence-release run `40813266604` (`workflow_dispatch`, success, started 03:38:21 UTC) created the release `p6-phase4c`, published 2026-10-29T03:38:49Z (`GET …/releases`), with `GITHUB_TOKEN` (evidence-release.yml line 191). Pages run `40813317251` (`event: workflow_run`, `head_branch: main`, success, started 03:38:56 UTC) ran from its completion. | The capture workflow can use the same pattern: pages listens to `workflow_run` of the capture, not to the release event.                                                                             |
| P-20 | Pages workflow lists evidence runs and releases with contents read                         | pages.yml lines 4–5 `workflow_run: workflows: ["evidence-release"]`; line 20 `actions: read`; lines 89–92 list releases with `gh api --paginate`. Run `40813317251` shows the listing works with `contents: read`.                                                                                                                                             | The new listing needs no permission change.                                                                                                                                                          |
| P-21 | Pages build job budget                                                                     | pages.yml line 38 `timeout-minutes: 20`. Step caps: checkout 1, setup-node 1, collect 1, validate 1, list 1, fetch 2, build site 1, upload 1 = 9. Margin 11.                                                                                                                                                                                                   | One added download step (cap 1) keeps the margin at 10. A 2-minute step does not fit: a new job is needed (section 9).                                                                               |
| P-22 | Pages scan job budget                                                                      | line 129 `timeout-minutes: 20`; step caps checkout 1, setup-node 1, download 1, token scan 1, gitleaks install 1, gitleaks 1, summary 1, configure 1, upload 1 = 9. Margin 11.                                                                                                                                                                                 | Unchanged. The site scan is never weakened.                                                                                                                                                          |
| P-23 | Pages deploy job budget (pre-existing, margin below 10)                                    | line 192 `timeout-minutes: 10`; one step `deploy-pages` cap 5 (line 199). Margin 5.                                                                                                                                                                                                                                                                            | This violates C3 today. The task does not change the job (C1 forbids raising timeouts; shrinking the step would squeeze it). Recorded in section 14 as Q-DEPLOY.                                     |
| P-24 | Evidence publish budget (for comparison)                                                   | evidence-release.yml line 25 `timeout-minutes: 30`; step caps sum 16 (incl. stop 1, validate 1, checkout 1, notes 1, release exists 1, download 3, gitleaks install 1, token scan 1, gitleaks 2, zip 1, create 2). Margin 14.                                                                                                                                  | Pattern for the new publish job.                                                                                                                                                                     |
| P-25 | GitHub docs: `workflow_run` runs from the default branch and chains at most three levels   | docs.github.com events-that-trigger-workflows: "This event will only trigger a workflow run if the workflow file exists on the default branch." and "You can't use `workflow_run` to chain together more than three levels of workflows."                                                                                                                      | Chain is soak (schedule) → soak-release (workflow_run, level 2) → pages (workflow_run, level 3). Pages is at the limit: no fourth workflow may follow it.                                            |
| P-26 | GitHub docs: `GITHUB_TOKEN` events do not start runs                                       | docs.github.com github_token: "events triggered by the `GITHUB_TOKEN` will not create a new workflow run"; exceptions "`workflow_dispatch` and `repository_dispatch` events always create workflow runs."                                                                                                                                                      | A release created by the capture does not start a release workflow. Pages starts from the capture's own completion (P-19).                                                                           |
| P-27 | GitHub docs: `GITHUB_TOKEN` rate limit                                                     | docs.github.com rate limits: "1,000 requests per hour per repository" for `GITHUB_TOKEN`.                                                                                                                                                                                                                                                                      | The capture and the pages listing are a few dozen calls. Well under the limit.                                                                                                                       |
| P-28 | Node version for the scripts                                                               | `.nvmrc` = `22`; package.json `engines.node` `>=22.22.0`. Repo scripts run `.ts` files directly with `node` (build-site.ts precedent, pages.yml line 114).                                                                                                                                                                                                     | Use `actions/setup-node` with `node-version-file: .nvmrc` in the new jobs. No new dependency.                                                                                                        |
| P-29 | No validator library in the repo                                                           | `package.json` dependencies: only `qa-portfolio-harness`. Devs: `@playwright/test`, `@types/k6`, `@types/node`, `@types/pg`, `pg`, `prettier`, `typescript`. No `zod`. Existing validators are hand-written (`parsePendingFile` in src/dashboard/release-plan.ts lines 61–75; `validateRunMeta` in src/load/run-meta.ts).                                      | The summary validator is hand-written, in the repo's style. No new dependency.                                                                                                                       |
| P-30 | The token scanner's patterns that a summary must avoid                                     | scripts/evidence-token-scan.mjs lines 9–21: `sessionId`, `Bearer `, `"token": "…"`, `"secret": "…"`, `password=`, `api_` + 8 chars, `Authorization:`.                                                                                                                                                                                                          | Summary keys must not be `token`, `secret`, `password`, `apiKey`, `sessionId`, `cookie`, `authorization`. The validator refuses those keys.                                                          |
| P-31 | The existing allowlist for gitleaks                                                        | .gitleaks.toml lines 18–24: only `load-medusa/P6-MED-LOAD-###/…/k6-config.json` and `soak-medusa-N/P6-MED-LOAD-005/…/k6-config.json` are allowed, and only for a `pk_` key.                                                                                                                                                                                    | The capture downloads the raw artefacts and scans them with this config as-is. The allowlist does not grow (section 8).                                                                              |
| P-32 | Dashboard reader today                                                                     | src/dashboard/soak/read-trends.ts exports `readSoakTrends` (line 50) for the in-run soak trend (within one run). build-site.ts lines 106 and 118 feed it. render/page.ts line 153 renders `renderSoakTrends`.                                                                                                                                                  | The new view is a separate module with a separate name ("weekly soak trend") so the two are never confused.                                                                                          |
| P-33 | The render section insertion point                                                         | src/dashboard/render/page.ts `renderSite` template: line 366 is the `evidence` section, line 367 `${findingsSection(ctx, findings)}`. Content-Security-Policy on line 353 forbids scripts and external images.                                                                                                                                                 | The new section is one call inserted before line 367. Inline SVG is allowed (`style-src 'unsafe-inline'`).                                                                                           |
| P-34 | The build script's flags                                                                   | scripts/dashboard/build-site.ts lines 89–101 parse only `--plan`. Line 152 writes `index.html`.                                                                                                                                                                                                                                                                | A second flag (`--weekly-soak <dir>`) is added by generalising the flag parse (section 6.9).                                                                                                         |
| P-35 | Webhook `workflow_run` payload field list                                                  | NOT PROBED. The webhook reference page was truncated before the `workflow_run` object (WebFetch on docs.github.com webhook-events-and-payloads, reading stopped at 100000 characters). The REST run object does carry `event`, `head_branch`, `conclusion`, `run_started_at`, `path` (P-03, P-06).                                                             | Build-time re-check R-06 (section 5). The workflow must print the payload fields it uses on its first run.                                                                                           |
| P-36 | `gh run download --pattern` support                                                        | NOT PROBED on the runner's `gh` version.                                                                                                                                                                                                                                                                                                                       | Build-time re-check R-08. Fallback: list artefacts with the REST call and download each by id.                                                                                                       |
| P-37 | Job-level `concurrency` may read `needs.<job>.outputs`                                     | NOT PROBED (not in the docs read here).                                                                                                                                                                                                                                                                                                                        | Build-time re-check R-09. Fallback: workflow-level group `soak-release` with `cancel-in-progress: false`.                                                                                            |
| P-38 | Whether a workflow run whose jobs are all skipped shows conclusion `skipped` or `success`  | NOT PROBED.                                                                                                                                                                                                                                                                                                                                                    | Build-time re-check R-10. It decides whether a nightly soak triggers a pages build (section 14, Q-NIGHTLY).                                                                                          |
| P-39 | No owner repo setting is needed for `contents: write` in a job                             | evidence-release publish declares `contents: write` (line 30) and runs successfully on main (run `40813266604`, success, and run `40655575365`, success, 2026-10-28).                                                                                                                                                                                          | No "Workflow permissions" change is needed. The owner step in section 11 only confirms it.                                                                                                           |
| P-40 | Medusa publishable key is in an allowlisted path                                           | .gitleaks.toml line 22 regexes. The raw Medusa download path `…/load-medusa/P6-MED-LOAD-005/…/k6-config.json` matches the allowlist. gitleaks exit 0 (P-09).                                                                                                                                                                                                   | Nothing to add.                                                                                                                                                                                      |

## 4. Depends on

| Item                                                                               | Kind                                             | Blocks the build start?                                                     | Blocks the CI run?                                                                                                                                                                                                                                                          | Blocks the closeout?                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Phase 4 Task 7 `soak.yml` (on main) with the weekly cron and the 120-min artefacts | merged (main at 5215127)                         | No, already on main                                                         | Yes: a weekly run must exist to test the real path. Until W44 (Sun 2026-11-01 19:29 UTC) the capture is tested only on fixtures and on `workflow_dispatch` backfill of a weekly run. A dispatch of soak with 120 min does **not** produce a weekly point (decision D-T7-2). | Yes, for "≥ 3 VALID points"                                                                                            |
| Phase 4 Task 13 `pages.yml` and `build-site.ts` (on main)                          | merged                                           | No                                                                          | Yes: the trend appears only after pages builds                                                                                                                                                                                                                              | Yes                                                                                                                    |
| Phase 4 Task 7 weekly releases `p6-soak-<yyyy>-w<ww>`                              | **Do not exist** (P-17). This task creates them. | No: this task creates them                                                  | —                                                                                                                                                                                                                                                                           | —                                                                                                                      |
| Lane A Task 2 (pin bump, flags on, `soak.yml` cache keys)                          | in flight, another session                       | No. The capture reads artefacts whatever their layout (P-10).               | No                                                                                                                                                                                                                                                                          | No. But after the bump the harness tag changes, so the view draws a harness marker at that week (expected, section 7). |
| Lane A Task 1 (harness release)                                                    | in flight                                        | No                                                                          | No                                                                                                                                                                                                                                                                          | No                                                                                                                     |
| Lane B Tasks 3–6                                                                   | in flight                                        | No; they do not touch soak.yml or pages.yml                                 | No                                                                                                                                                                                                                                                                          | No                                                                                                                     |
| Owner: merge the plan PR (see section 14, Q-PR)                                    | owner action                                     | Yes for the build PR, but the plan itself is pushed without a PR (see Q-PR) | No                                                                                                                                                                                                                                                                          | No                                                                                                                     |
| Owner: none else for the build                                                     | —                                                | No                                                                          | No                                                                                                                                                                                                                                                                          | No                                                                                                                     |

## 5. Build-time re-check table

The build session runs these first. A changed value stops the build and goes to the plan's open decisions, not a silent change.

| fact                                                                                                                                                    | how to re-check at build start                                                                                                                       | if it changed                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R-01 main at or after `5215127` and no change to `soak.yml`, `pages.yml`, `evidence-release.yml` in `git log 5215127..origin/main -- .github/workflows` | `git log --oneline 5215127..origin/main -- .github/workflows scripts/dashboard src/dashboard docs/plans/2026-10-22-p6-phase5-roadmap.md`             | Read the diff. If it touches the soak artefact names or the cron, stop (H2).                                           |
| Soak cron and artefact names unchanged                                                                                                                  | `grep -n 'cron\|soak-\|retention-days' .github/workflows/soak.yml`                                                                                   | If a name changes, the capture's selector changes (section 6.5) and the decision is re-recorded.                       |
| Two new scheduled runs since P-03 and their conclusions                                                                                                 | `curl -sS https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/workflows/397232763/runs?event=schedule`                          | Record them in the build log. Any new 120-min run is a weekly candidate.                                               |
| A weekly 120-min run exists (after 2026-11-01 19:29 UTC) and its artefacts are `soak-<product>-120`                                                     | `curl …/actions/runs/<id>/artifacts`                                                                                                                 | If none exists yet, the build still proceeds on fixtures; the first real run is the acceptance check (section 12, S9). |
| run-meta.json still has `environment.event`, `environment.runUrl`, `software.k6`, `software.harness`, `software.products`                               | download one artefact and read its `run-meta.json` (token scan first)                                                                                | If a key moved, update the summary writer's source map and its tests.                                                  |
| soak.json still has `statistics.rssMb/fds/dbConnections` with `slope` and `plateau`                                                                     | same download                                                                                                                                        | Same.                                                                                                                  |
| Medusa folder layout (`load-medusa/`)                                                                                                                   | same download                                                                                                                                        | Same. The writer already walks the tree.                                                                               |
| Webhook `workflow_run` payload field names (P-35)                                                                                                       | in the first real run of the new workflow: `echo` the field names (not values) of `github.event.workflow_run` with `jq -r 'keys[]'` into the job log | If a name is missing, use the REST run API by id instead (the capture reads `workflow_run.id` only).                   |
| `gh run download --pattern` exists on the runner's `gh` (P-36)                                                                                          | `gh run download --help` on the runner, in the first run                                                                                             | Fallback as in P-36.                                                                                                   |
| Job-level `concurrency` with `needs` (P-37)                                                                                                             | `actionlint` (npm run lint:actions) plus a dry first run                                                                                             | Fallback: workflow-level group.                                                                                        |
| Nightly capture run conclusion (P-38)                                                                                                                   | the first nightly soak completion after the capture merges: read the capture workflow run's conclusion                                               | Record it. If `success`, Q-NIGHTLY stays open with its cost; if `skipped`, no pages build happens on nights.           |
| Releases list and assets (P-17)                                                                                                                         | `curl …/releases?per_page=100`                                                                                                                       | If a `p6-soak-*` tag already exists, the capture refuses that week (section 7), and the build records it.              |
| Pages build budget (P-21) and deploy margin (P-23)                                                                                                      | read pages.yml timeouts and step caps                                                                                                                | Recompute the table in section 9 before any edit.                                                                      |
| `.gitleaks.toml` allowlist (P-31)                                                                                                                       | `git diff 5215127..HEAD -- .gitleaks.toml`                                                                                                           | If it grew, the build stops (H6 in spirit: never widen a scan). Use the current config only.                           |
| The evidence scanner patterns (P-30)                                                                                                                    | `sed -n '9,21p' scripts/evidence-token-scan.mjs`                                                                                                     | If a pattern was added, the summary keys are re-checked against it.                                                    |
| The B0 unit count                                                                                                                                       | `npm run check` on the build branch before any edit                                                                                                  | If it is not 1405 at the base, re-measure and use the new base in every count. Never copy the number.                  |

## 6. Design

### 6.1 Decisions taken in this plan

| ID      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                  | Reason                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-T7-1  | Capture is built here (agreed decision a). A **new** workflow `.github/workflows/soak-release.yml` runs on `workflow_run` of the `soak` workflow and publishes `p6-soak-<yyyy>-w<ww>`. `soak.yml` is not changed.                                                                                                                                                                                                         | P-17 proves the releases do not exist. P-03 proves the soak runs and their artefacts exist. Reading artefacts needs no soak.yml change (P-06, P-07).                                                                                                                                                    |
| D-T7-2  | A run is a weekly point only when **all** of these hold: (1) `workflow_run.event` (or the run's `event` for a backfill) is `schedule`; (2) the run is workflow `397232763` on `main` with conclusion `success`; (3) the artefacts are named `soak-<product>-120`; (4) `run-meta.json` of each product says `durationSec: 7200` and `environment.event: schedule`.                                                         | A dispatch cannot have `event: schedule`, so a dispatched 120-min run is never a weekly point, even though its artefact name is the same (P-04). Day-of-week is not used (P-04).                                                                                                                        |
| D-T7-3  | Tag: `p6-soak-<ISO year>-w<ISO week>`, from the soak run's `run_started_at` in UTC: `date -u -d "<run_started_at>" +%G-w%V`. An existing tag or release for the week is refused.                                                                                                                                                                                                                                          | Matches the roadmap format (line 38, D8). P-05 gives the W44 example.                                                                                                                                                                                                                                   |
| D-T7-4  | Summary per product: one JSON file `soak-summary-<product>.json` per product per week, `schemaVersion: 1`, with `valid: true                                                                                                                                                                                                                                                                                              | false`and`invalidReason`. A week with a missing product artefact still gets that product's file with `valid: false`and`invalidReason: "artefact missing"`.                                                                                                                                              | A week without a file for a product would look like absence; an explicit gap is visible (roadmap line 480). |
| D-T7-5  | Summary validity (`valid`): true when `verdict` is `PASS`, `FAIL (PRODUCT BUG)` or `NO THRESHOLD YET`. False for `INVALID` or `TEST BUG`, or for any missing or unreadable input.                                                                                                                                                                                                                                         | The soak's own rules already define INVALID and TEST BUG as not evidence (verdict.ts lines 4–12). `FAIL (PRODUCT BUG)` is a real measurement and is a point. `NO THRESHOLD YET` is every week until calibration (P-15), so it must be valid or no week would count. Owner confirms this rule (Q-VALID). |
| D-T7-6  | The summary takes RSS, fds, connections and plateau from `soak.json`. It does not recompute them. It takes SHA, harness, k6, event, run URL, start and duration from `run-meta.json`. It takes the health-probe proxy from `telemetry-main.json`.                                                                                                                                                                         | One source of truth for each number (P-11, P-14).                                                                                                                                                                                                                                                       |
| D-T7-7  | "p95 slope" is recorded as `healthProbeMs`: `{ p95, slopePerMin, samples }` where `p95` is the nearest-rank p95 of `probe.ms` over the samples after warm-up, and `slopePerMin` is `soakSlope` (src/load/soak/slope.ts) applied to the `probe.ms` points. The label in the view says "health-probe latency (proxy, 1 Hz)". This is the recommended option of Q-P95 and the plan builds it unless the owner picks another. | The roadmap term has no source (P-12). The 1 Hz probe is the proxy the roadmap already labels (roadmap line 291).                                                                                                                                                                                       |
| D-T7-8  | A duplicate week (two releases for one ISO week and one product) makes **both** entries a gap with reason `duplicate week`. The reader never picks one.                                                                                                                                                                                                                                                                   | Capture refuses an existing tag (D-T7-3), so a duplicate only comes from a manual tag. Picking one silently would hide a conflict (never weaken).                                                                                                                                                       |
| D-T7-9  | Trend status: `collecting (n/3 weeks)` while the product has `n < 3` VALID points; `trend` at `n >= 3`. The `3` is one constant `REQUIRED_VALID_WEEKS` in the trend module.                                                                                                                                                                                                                                               | Agreed decision c.                                                                                                                                                                                                                                                                                      |
| D-T7-10 | A product SHA, harness tag or k6 version change between two consecutive VALID points adds a marker at the later point. Markers never change the status.                                                                                                                                                                                                                                                                   | Agreed decision (roadmap line 481).                                                                                                                                                                                                                                                                     |
| D-T7-11 | The view is built by `build-site.ts` from a directory, not by calling the GitHub API. The API call is in a new pages job `soak-summaries` that writes the directory as an artefact.                                                                                                                                                                                                                                       | `build-site.ts` has no network code today, and pages.yml's build job has no budget for a 3-minute fetch (P-21). A new job keeps the margins (C3).                                                                                                                                                       |
| D-T7-12 | Backfill: `workflow_dispatch` on `soak-release` with input `run_id`. It goes through the same validation as D-T7-2 and refuses any other run.                                                                                                                                                                                                                                                                             | Owner backfill of a weekly run whose artefacts still exist (within 90 days). The prompt requires it.                                                                                                                                                                                                    |
| D-T7-13 | A release holds only the three summary files and `SHA256SUMS.txt`, plus generated notes (not committed). It never holds the raw artefacts or the zips.                                                                                                                                                                                                                                                                    | The summary is the capture (roadmap line 476). Raw artefacts contain `k6-main.json.gz` and similar; publishing them is out of scope and would widen the scan.                                                                                                                                           |

### 6.2 Modules and data flow

```
soak run (schedule, 120 min)  ── artefacts soak-<product>-120 (90 days)
   │
   ▼  workflow_run (soak-release)
decide job  ── validate run (D-T7-2), derive tag (D-T7-3), output weekly=true|false
   │ weekly=true
   ▼
capture job  ── refuse existing tag → gh run download → token scan (raw) → gitleaks (raw)
   │             → write summaries (scripts/soak/weekly-capture.ts summarize)
   │             → token scan + gitleaks (summaries) → upload artefact "weekly-summaries"
   ▼
publish job  ── download "weekly-summaries" → token scan + gitleaks (again) → refuse existing tag
   │             → gh release create p6-soak-<yyyy>-w<ww> (summaries + SHA256SUMS.txt)
   ▼
pages.yml (workflow_run of soak-release, branch main, success)
   ├─ soak-summaries job: list p6-soak-* releases (paginate), download assets, verify sums,
   │     check each file's tag and name, token scan + gitleaks, upload artefact "soak-weekly"
   └─ build job (needs soak-summaries): build-site.ts --weekly-soak <dir>
         → src/dashboard/soak/weekly-trend.ts (pure) → src/dashboard/render/weekly-soak.ts
         → site/index.html (section "Weekly soak trend") → scan job (unchanged) → deploy (unchanged)
```

### 6.3 File list

NEW files (the build creates them):

| Path                                       | Purpose                                                                                  | Test file                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `.github/workflows/soak-release.yml`       | Capture workflow (section 6.5)                                                           | `tests/unit/soak-release-workflow.test.ts`                                     |
| `scripts/soak/weekly-capture.ts`           | CLI: `decide` (validate the run and print outputs) and `summarize` (write the summaries) | covered by `tests/unit/soak-weekly-summary.test.ts` (decide and tag functions) |
| `src/load/soak/weekly-summary.ts`          | Summary schema v1: builder, validator, ISO tag, weekly decision (section 6.4, 6.6)       | `tests/unit/soak-weekly-summary.test.ts`                                       |
| `src/dashboard/soak/weekly-trend.ts`       | Pure trend: summaries in, per-product series and status out (section 6.7)                | `tests/unit/soak-trend.test.ts`                                                |
| `src/dashboard/render/weekly-soak.ts`      | The section HTML (section 6.8)                                                           | `tests/unit/soak-trend.test.ts`                                                |
| `tests/unit/soak-weekly-summary.test.ts`   | Unit tests of the summary module (9 tests)                                               | itself                                                                         |
| `tests/unit/soak-trend.test.ts`            | Unit tests of the trend and the section (12 tests)                                       | itself                                                                         |
| `tests/unit/soak-release-workflow.test.ts` | Workflow-text tests for soak-release.yml and pages.yml (6 tests)                         | itself                                                                         |
| `tests/fixtures/soak-trend/`               | JSON fixtures (section 6.10)                                                             | used by the trend test                                                         |

CHANGED files:

| Path                                                  | Change                                                                                                                                                                                               | Why this file                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/dashboard/build-site.ts`                     | Generalise the flag parse; add `--weekly-soak <dir>`; call `readWeeklySoak(dir)`; pass the result into the page context (section 6.9)                                                                | Shared registration line ("trend hook" in the ownership table), roadmap line 483                         |
| `src/dashboard/render/page.ts`                        | Add `weeklySoak?: ProductTrend[]` to `PageContext`; one import; one section call before line 367                                                                                                     | Registration line, one section call (prompt table)                                                       |
| `.github/workflows/pages.yml`                         | `workflow_run.workflows` becomes `["evidence-release", "soak-release"]`; new job `soak-summaries`; the build job gets `needs: soak-summaries`, one download step (cap 1), and passes `--weekly-soak` | Prompt table: pages.yml adds the new workflow to workflow_run and a step that lists `p6-soak-*` releases |
| `README.md`                                           | New section "Weekly soak trend" (what is measured, the "collecting" rule, how to backfill)                                                                                                           | Prompt table: README trend section                                                                       |
| `docs/plans/2026-10-29-p6-phase5-task7-soak-trend.md` | This file (planning only)                                                                                                                                                                            | —                                                                                                        |

Not changed (checked in section 15): `.github/workflows/soak.yml`, `.github/workflows/evidence-release.yml`, `.gitleaks.toml`, `scripts/evidence-token-scan.mjs`, `tests/unit/build-site.test.ts`, `tests/unit/evidence-release-ids.test.ts`, `src/dashboard/soak/read-trends.ts`, `package.json`, `package-lock.json`.

### 6.4 Summary schema v1

File: `soak-summary-<product>.json`. Size limit 64 KiB (refused above it, EXTRA case X-4).

Example (values illustrative; the field names and types are the contract, and the numbers are from the probe run 40796699639, which is a nightly 30-min run and **not** a weekly point):

```json
{
  "schemaVersion": 1,
  "product": "cal",
  "isoWeek": "2026-w44",
  "tag": "p6-soak-2026-w44",
  "caseId": "P6-CAL-LOAD-008",
  "runId": "20261029T005400Z-e2eab4d1",
  "githubRunId": "40796699639",
  "runUrl": "https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40796699639",
  "event": "schedule",
  "startedAt": "2026-10-29T00:54:00.037Z",
  "durationSec": 1800,
  "warmupSec": 360,
  "productSha": "c2b7ac44c66f24ffef1662b276f0653988a609a3",
  "harnessTag": "v0.2.15",
  "k6Version": "2.3.0",
  "valid": true,
  "invalidReason": null,
  "verdict": "NO THRESHOLD YET",
  "reasons": ["no soak-bounds.json entry for this product"],
  "statistics": {
    "rssMb": { "slopePerMin": 0.497, "theilSenPerMin": 0.507, "plateauRatio": 1.0009 },
    "fds": { "slopePerMin": -0.0016, "theilSenPerMin": 0, "plateauRatio": 1 },
    "dbConnections": { "slopePerMin": 0.00065, "theilSenPerMin": 0, "plateauRatio": 1 }
  },
  "healthProbeMs": { "p95": 231, "slopePerMin": 0, "samples": 1441 }
}
```

Field table:

| Field           | Type                                                                           | Source                                 | Rule                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `1` (literal)                                                                  | writer                                 | Any other value → a gap with reason `unknown schemaVersion <n>`; never parsed loosely                                                                                                                      |
| `product`       | `"cal" \| "medusa" \| "documenso"`                                             | caseId map                             | Must match the file name                                                                                                                                                                                   |
| `isoWeek`       | string `^\d{4}-w\d{2}$`                                                        | writer                                 | From `startedAt` (D-T7-3)                                                                                                                                                                                  |
| `tag`           | string                                                                         | writer                                 | Must equal `p6-soak-` + `isoWeek`. Reader: must equal the release tag, else gap `summary does not match its release tag`                                                                                   |
| `caseId`        | string                                                                         | run-meta                               | One of `P6-CAL-LOAD-008`, `P6-MED-LOAD-005`, `P6-DOC-LOAD-006`                                                                                                                                             |
| `runId`         | string                                                                         | run-meta                               | The attempt folder id                                                                                                                                                                                      |
| `githubRunId`   | string `^\d+$`                                                                 | workflow run                           | The soak run id                                                                                                                                                                                            |
| `runUrl`        | string `^https://github\.com/[^/]+/[^/]+/actions/runs/\d+$`                    | run-meta or built from the run id      | Shown as the link                                                                                                                                                                                          |
| `event`         | `"schedule"`                                                                   | run-meta `environment.event`           | Must be `schedule` for a weekly point                                                                                                                                                                      |
| `startedAt`     | ISO string                                                                     | run-meta                               |                                                                                                                                                                                                            |
| `durationSec`   | `7200`                                                                         | run-meta                               | Must be 7200 for a weekly point                                                                                                                                                                            |
| `warmupSec`     | number                                                                         | soak.json `statistics.warmupSec`       |                                                                                                                                                                                                            |
| `productSha`    | 40 lowercase hex                                                               | run-meta `software.products.<product>` | Missing → `null` and `valid: false` with reason `product SHA not recorded`                                                                                                                                 |
| `harnessTag`    | string `^v\d+\.\d+\.\d+$`                                                      | run-meta `software.harness`            |                                                                                                                                                                                                            |
| `k6Version`     | string `^\d+\.\d+\.\d+$`                                                       | run-meta `software.k6`                 |                                                                                                                                                                                                            |
| `valid`         | boolean                                                                        | verdict rule (D-T7-5)                  |                                                                                                                                                                                                            |
| `invalidReason` | string or `null`                                                               | writer                                 | `null` iff `valid` is true; non-empty string iff false                                                                                                                                                     |
| `verdict`       | one of `PASS`, `FAIL (PRODUCT BUG)`, `TEST BUG`, `INVALID`, `NO THRESHOLD YET` | soak.json                              |                                                                                                                                                                                                            |
| `reasons`       | array of strings                                                               | soak.json                              | Copied as is (no secret can be in them: they are the soak's own reason strings)                                                                                                                            |
| `statistics`    | object or `null`                                                               | soak.json                              | Required when `valid` is true. Must hold `rssMb`, `fds`, `dbConnections`, each with numeric `slopePerMin`, `theilSenPerMin`, `plateauRatio` (finite numbers)                                               |
| `healthProbeMs` | object or `null`                                                               | telemetry-main.json                    | `null` with `healthProbeMs` absent in the probe source is allowed for a valid run (the reason goes to `reasons`); when present, `p95` and `slopePerMin` are finite numbers and `samples` is an integer ≥ 0 |

Forbidden keys (the scanner's patterns, P-30): the validator refuses any key whose lower-cased name is `token`, `secret`, `password`, `apikey`, `api_key`, `sessionid`, `cookie`, `authorization`, anywhere in the object.

### 6.5 Capture workflow `.github/workflows/soak-release.yml`

Triggers: `workflow_run` of workflow `soak`, types `completed`; and `workflow_dispatch` with input `run_id` (string, digits).

Permissions: top level `contents: read`. Jobs `decide` and `capture` add `actions: read` (artefact download). Only `publish` adds `contents: write`. No job gets `write` except `publish`.

Concurrency: workflow group `soak-release`, `cancel-in-progress: false` (serialises every capture). Publish also uses `soak-release-${{ needs.decide.outputs.tag }}` (Q-CONC, R-09); if the expression is rejected, keep only the workflow group.

Selection in `decide` (per D-T7-2): the run id is `github.event.workflow_run.id` for a trigger, or `inputs.run_id` for a backfill. The job fetches the run with `gh api repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID` and the artefacts list with `gh api repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID/artifacts`, then runs `node scripts/soak/weekly-capture.ts decide run.json artifacts.json`. It exits 1 and prints the reason for: wrong workflow id (`workflow_id` ≠ 397232763), `head_branch` ≠ `main`, `conclusion` ≠ `success`, `event` ≠ `schedule`, or no `soak-*-120` artefact at all. It writes `run_id`, `tag` and `weekly=true` to `$GITHUB_OUTPUT`, plus the product artefacts present.

A run with one or two product artefacts is still a weekly point. Each missing product gets its own gap (`artefact missing`, D-T7-4), so `decide` requires only that at least one `soak-*-120` artefact exists.

Capture steps (job `capture`, `needs: decide`, `if: needs.decide.outputs.weekly == 'true'`): see the budget table in section 9.

1. checkout (`actions/checkout`, pinned SHA as in pages.yml line 45, `persist-credentials: false`).
2. setup-node with `.nvmrc`.
3. Refuse an existing tag: `git ls-remote --exit-code --tags origin "refs/tags/$TAG"` (exit 2 = absent) and `gh release view "$TAG"` must say "not found". Same as evidence-release lines 104–124.
4. Download: `gh run download "$RUN_ID" --dir "$RUNNER_TEMP/soak" --pattern 'soak-*-120'`. Each artefact lands in its own folder named after it.
5. Token scan of the raw download: `node scripts/evidence-token-scan.mjs "$RUNNER_TEMP/soak"`. Any hit → exit 1, nothing uploaded.
6. Install gitleaks (pinned 8.30.1, sha256 `551f6fc8…`, same as evidence-release lines 144–153).
7. gitleaks on the raw download: `"$RUNNER_TEMP/gitleaks" dir "$RUNNER_TEMP/soak" --config .gitleaks.toml --redact --verbose --no-banner --exit-code 1`.
8. Summarize: `node scripts/soak/weekly-capture.ts summarize "$RUNNER_TEMP/soak" "$RUNNER_TEMP/summaries" "$RUN_ID" "$TAG"`. Writes one `soak-summary-<product>.json` per product (missing products included, D-T7-4), and `NOTES.md` for the release notes. Refuses any file over 64 KiB.
9. Scan the summaries again: token scan and gitleaks (`--exit-code 1`) over `$RUNNER_TEMP/summaries`.
10. Upload artefact `weekly-summaries` (`retention-days: 1`, `if-no-files-found: error`), path `$RUNNER_TEMP/summaries`.

Publish (job `publish`, `needs: [decide, capture]`, `if: needs.capture.result == 'success'`, `permissions: contents: write, actions: read`):

1. Download artefact `weekly-summaries`.
2. Refuse an existing tag again (the race check: EXTRA case X-3).
3. Install gitleaks; token scan and gitleaks over the downloaded folder (the second scan of the bytes that are uploaded).
4. `gh release create "$TAG" --target "$GITHUB_SHA" --title "P6 weekly soak $ISO_WEEK" --notes-file NOTES.md soak-summary-*.json SHA256SUMS.txt`. The `--target` is the soak run's `head_sha` (from `decide`), so the release points at the code that ran. It is validated as an ancestor of main (as evidence-release line 74).

`SHA256SUMS.txt` is produced in `summarize` (`sha256sum -- soak-summary-*.json > SHA256SUMS.txt`).

### 6.6 Summary writer and decision module (`src/load/soak/weekly-summary.ts`)

Pure functions; no file reads except in the CLI.

```ts
// src/load/soak/weekly-summary.ts (NEW)
export const SUMMARY_SCHEMA = 1 as const;
export const PRODUCTS = ["cal", "medusa", "documenso"] as const;
export type Product = (typeof PRODUCTS)[number];
export const CASE_BY_PRODUCT: Record<Product, string> = {
  cal: "P6-CAL-LOAD-008",
  medusa: "P6-MED-LOAD-005",
  documenso: "P6-DOC-LOAD-006",
};
export const MAX_SUMMARY_BYTES = 64 * 1024;
export const WEEKLY_DURATION_SEC = 7200;
export const SOAK_WORKFLOW_ID = "397232763";

/** ISO week tag from a UTC instant: "p6-soak-2026-w44". Throws if the instant is not a valid date. */
export function isoWeekTag(startedAtIso: string): { isoWeek: string; tag: string };

/** Weekly point decision (D-T7-2). Returns the refusal reason, or null when the run is a weekly point. */
export function weeklyRefusal(run: {
  workflowId: number | string;
  headBranch: string;
  conclusion: string | null;
  event: string;
  artefactNames: string[];
}): string | null;

/** Summary verdict rule (D-T7-5). */
export function isValidVerdict(verdict: string): boolean;

/** Builds one product's summary from its soak.json, run-meta.json and telemetry (optional). Throws on a malformed input. */
export function buildSummary(input: {
  product: Product;
  githubRunId: string;
  soakJson: unknown;
  runMeta: unknown;
  telemetry: unknown | null;
}): WeeklySummary;

/** The missing-product summary (D-T7-4): valid false, invalidReason "artefact missing". */
export function missingSummary(input: {
  product: Product;
  githubRunId: string;
  isoWeek: string;
  tag: string;
  runUrl: string;
}): WeeklySummary;

/** Validates a parsed JSON value against schema v1. Throws an Error whose message names the first bad field. Never accepts unknown schemaVersion. */
export function parseSummary(value: unknown): WeeklySummary;

export interface WeeklySummary {
  /* the fields of section 6.4 */
}
```

Skeleton of `parseSummary` behaviour (the tests pin each line):

```ts
export function parseSummary(value: unknown): WeeklySummary {
  const v = value as Record<string, unknown>;
  if (typeof v !== "object" || v === null) throw new Error("summary: not an object");
  if (v.schemaVersion !== SUMMARY_SCHEMA)
    throw new Error(`unknown schemaVersion ${JSON.stringify(v.schemaVersion)}`); // gap, not a parse
  // product in PRODUCTS, isoWeek regex, tag === "p6-soak-" + isoWeek,
  // caseId === CASE_BY_PRODUCT[product], githubRunId digits, runUrl regex,
  // event/durationSec when valid, productSha 40 hex (or null with invalidReason),
  // harnessTag/k6Version regex, valid boolean, invalidReason null iff valid,
  // verdict in set, statistics finite numbers when valid, healthProbeMs shape,
  // forbidden keys (section 6.4) → throw "summary: forbidden key <name>"
  return v as unknown as WeeklySummary;
}
```

Weekly decision skeleton:

```ts
export function weeklyRefusal(run: WeeklyRunFacts): string | null {
  if (String(run.workflowId) !== SOAK_WORKFLOW_ID) return "run is not from the soak workflow";
  if (run.headBranch !== "main") return `run is on ${run.headBranch}, not main`;
  if (run.conclusion !== "success") return `run conclusion is ${run.conclusion ?? "missing"}`;
  if (run.event !== "schedule") return `run event is ${run.event}, not a scheduled run`;
  if (!run.artefactNames.some((n) => /^soak-(cal|medusa|documenso)-120$/.test(n)))
    return "no 120-minute soak artefact";
  return null;
}
```

The 120-minute suffix and `durationSec` are checked again per summary (`durationSec` must be 7200 in run-meta), so a run whose artefacts say 120 but whose run-meta says 30 is a gap with reason `run-meta durationSec is not 7200`.

Unit tests for this module (`tests/unit/soak-weekly-summary.test.ts`, 9 tests, section 12 S1):

1. `a valid v1 summary is accepted` — parseSummary of the example in section 6.4 returns it unchanged.
2. `a missing field is rejected and the message names it` — delete `productSha`, expect a throw whose message contains `productSha`.
3. `an unknown schemaVersion is refused, never parsed loosely` — `schemaVersion: 2` → throws `unknown schemaVersion 2`.
4. `a forbidden key is refused` — add `"token": "x"` → throws `forbidden key token`.
5. `a probe-less valid run keeps healthProbeMs null and stays valid` — telemetry `null` → `healthProbeMs: null`, `valid: true`.
6. `an invalid run has valid false, an invalidReason and no statistics number` — verdict `INVALID` → valid false, invalidReason non-empty, statistics null.
7. `isoWeekTag maps the W44 instant to p6-soak-2026-w44` — `2026-11-01T19:29:00Z` → `{ isoWeek: "2026-w44", tag: "p6-soak-2026-w44" }`; `2026-10-26T00:00:00Z` → also w44.
8. `weeklyRefusal accepts a scheduled 120-minute run on main and refuses each other case` — table: wrong workflow id, branch feature, conclusion failure, event workflow_dispatch, no 120 artefact → each a non-null reason; the good run → null.
9. `a summary over 64 KiB is refused` — `summaryFileSize` check → throws `summary over 65536 bytes`. (The CLI calls `assertSize` before writing.)

Note on the tests' counts: the test names above are the 9 tests counted in B0 + 9.

### 6.7 Trend module (`src/dashboard/soak/weekly-trend.ts`)

Why here and not `src/load/soak/trend.ts`: the readers of soak results live in `src/dashboard/soak/` (read-trends.ts, P-32). The roadmap allows this placement if the probe shows it (roadmap line 483 and the Task 7 wording). The result code stays in `src/load/soak/`.

```ts
// src/dashboard/soak/weekly-trend.ts (NEW). Pure: no file or network reads.
export const REQUIRED_VALID_WEEKS = 3;

export interface ReleaseSummaryFile {
  tag: string; // the release tag the file came from, e.g. "p6-soak-2026-w44"
  file: string; // the asset name, e.g. "soak-summary-cal.json"
  text: string | null; // null when the file could not be read
}

export interface TrendGap {
  tag: string;
  product: string;
  reason: string;
}
export interface TrendPoint {
  tag: string;
  isoWeek: string;
  runUrl: string;
  productSha: string;
  harnessTag: string;
  k6Version: string;
  rssSlope: number;
  rssPlateau: number;
  fdsSlope: number;
  fdsPlateau: number;
  connSlope: number;
  connPlateau: number;
  probeP95: number | null;
  probeSlope: number | null;
  marker: string | null; // "product SHA changed", "harness tag changed", "k6 version changed"
}
export interface ProductTrend {
  product: Product;
  validCount: number;
  status: string; // "collecting (n/3 weeks)" or "trend"
  points: TrendPoint[]; // VALID only, sorted by isoWeek
  gaps: TrendGap[]; // INVALID, unknown schema, duplicate, missing, mismatch
}

/** The status text: "collecting (n/3 weeks)" below 3 VALID points, "trend" at 3 or more. */
export function statusFor(validCount: number): string;

/** Builds the per-product trend. Each entry comes from one release file. Products not in PRODUCTS are ignored with a gap. */
export function buildWeeklyTrend(files: ReleaseSummaryFile[]): ProductTrend[];
```

Skeleton of `buildWeeklyTrend` (each rule is one test in section 12 S2):

```ts
export function buildWeeklyTrend(files: ReleaseSummaryFile[]): ProductTrend[] {
  // 1. For each file: parse JSON (failure → gap "not valid JSON"); parseSummary (throw → gap with the message).
  // 2. The file must be named soak-summary-<product>.json; the summary.tag must equal the release tag (else gap).
  // 3. Group by product and isoWeek. A week with 2+ entries for one product → every such entry is a gap "duplicate week".
  // 4. Entries with valid false → gap with the summary's invalidReason.
  // 5. Entries with valid true → point. Sort by isoWeek. Markers: compare with the previous point
  //    (productSha, harnessTag, k6Version); a change adds the marker text to the later point.
  // 6. status = statusFor(points.length).
  // 7. Products with no entries at all still appear (status "collecting (0/3 weeks)").
  throw new Error("NOT IMPLEMENTED: skeleton");
}
```

Note the skeleton throws until the build; the planning session writes no code.

Tests (`tests/unit/soak-trend.test.ts`, 12 tests in the list of section 12 S2): 0, 1, 2 and 3 VALID weeks (4 tests); an INVALID week between two VALID weeks is a gap, not a point (1); a duplicate week makes both gaps (1); a SHA change is a marker (1); a harness-tag change is a marker (1); a schema v2 file is a gap with `unknown schemaVersion 2` (1); a product missing in a week is a gap `artefact missing` (1); the section HTML shows `collecting (2/3 weeks)` and no polyline below 3 (1); the section HTML draws one polyline per chart at 3 VALID points and contains no `<script` (1).

The fixtures are in `tests/fixtures/soak-trend/` (section 6.10). The tests read them with `readFileSync`.

### 6.8 Render section (`src/dashboard/render/weekly-soak.ts`)

```ts
// NEW. Returns one <section id="soak-weekly"> with one block per product.
export function weeklySoakSection(trends: ProductTrend[]): string;
```

Rules:

- Heading `Weekly soak trend`, a one-sentence explanation: "Each point is one weekly 2 h soak that passed the validity rule. INVALID weeks are listed as gaps with their reason, never plotted."
- Per product: the status text (`collecting (n/3 weeks)` or `trend`), then a table of every week: week, status (VALID / gap with reason), RSS slope, plateau, fds slope, connections slope, probe p95, marker, run link (the soak run's `runUrl`, text "run <id>").
- Below 3 VALID points: no chart at all, only the table.
- At 3 or more VALID points: one inline SVG per metric (`rssMb.slopePerMin`, `rssMb.plateauRatio`, `fds.slopePerMin`, `dbConnections.slopePerMin`, `healthProbeMs.p95`), each polyline through VALID points only. A gap is shown as a tick on the axis with its reason in the title element. A marker is a dashed vertical line with its label.
- All text from releases goes through `escapeLabel` (site-model.ts line 36). No `<script>`, no `<img>`, no external link other than `REPO`.
- Escaping: `escapeLabel` on every interpolated string.

### 6.9 Build wiring

`scripts/dashboard/build-site.ts`: generalise the parse at lines 92–98 to a loop: `--plan <file>` and `--weekly-soak <dir>`; both optional; `--weekly-soak` reads `readWeeklySoak(dir)` (new exported function) which lists `<dir>/p6-soak-*/soak-summary-*.json`, reads each file as text (failures become gaps via the trend module, so the reader never throws on one bad file), and calls `buildWeeklyTrend`. The result goes into `PageContext.weeklySoak`. The site build never fails because of a summary; a bad file is a gap.

A missing directory is different and deliberate: it counts as no weeks (every product shows `collecting (0/3 weeks)`), and the build prints one line saying so. The first pages build, before W44 has a release, must still work.

`src/dashboard/render/page.ts`: `PageContext` gains `weeklySoak?: ProductTrend[]`; one import; the template gets `${weeklySoakSection(ctx.weeklySoak ?? [])}` before line 367. Without `weeklySoak`, the section still renders the 0/3 status for each product (so the page is never blank).

### 6.10 Fixtures (`tests/fixtures/soak-trend/`)

All fixtures are JSON with the exact v1 shape of section 6.4. Values are invented for the test. Do not add extra keys (the validator treats an unknown schema shape as a gap, and a note key would be a fake field). Name the files to say what they test. `.prettierignore` does not exclude `tests/`, so run `npx prettier --write tests/fixtures/soak-trend` before committing, or `format:check` fails.

| File                                                                     | Use                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `w44-cal-valid.json`, `w45-cal-valid.json`, `w46-cal-valid.json`         | 3 VALID weeks for cal (trend, n=3)                                                              |
| `w44-medusa-valid.json`, `w45-medusa-valid.json`                         | 2 VALID weeks (collecting 2/3)                                                                  |
| `w45-documenso-invalid.json`                                             | INVALID week (verdict `INVALID`, `valid: false`, reason "telemetry gaps over two intervals: 3") |
| `w44-documenso-valid.json`, `w46-documenso-valid.json`                   | VALID weeks around the INVALID one (so 2 VALID, n=2)                                            |
| `w46-cal-sha-changed.json`                                               | Same as w46 cal but a different `productSha`: SHA marker                                        |
| `w46-medusa-harness-changed.json`                                        | A different `harnessTag`: harness marker                                                        |
| `w44-cal-schema2.json`                                                   | `schemaVersion: 2`: gap `unknown schemaVersion 2`                                               |
| `w44-cal-duplicate.json` plus `w44-cal-valid.json` already listed        | duplicate week: both become gaps                                                                |
| `w46-medusa-missing.json` absent (the file is not in the fixture folder) | missing product: gap `artefact missing`                                                         |

The trend test builds its input list from these files and an explicit tag per file (`tag` of the release folder).

### 6.11 Oracles and verdict rules

- **Validity** (`valid`): D-T7-5. Verdict set and values are from soak verdict.ts lines 4–12.
- **Weekly point**: D-T7-2 (all four checks).
- **Status**: `n` = the count of VALID points of one product; `statusFor(n)` = `collecting (${n}/3 weeks)` when `n < 3`, otherwise `trend`. The number 3 is `REQUIRED_VALID_WEEKS` only.
- **Markers**: a change of `productSha`, `harnessTag` or `k6Version` between consecutive VALID points. Gaps do not break the chain: the change is compared with the last VALID point.
- **No threshold**: nothing in this view is a PASS or FAIL. The soak's own verdict is shown as text, never turned into a colour rule. (The roadmap says measure-only, line 482.)
- **Units**: slopes in MB per minute (RSS), fds per minute, connections per minute; plateau ratio is the last third over the middle third (plateau.ts, soak-bounds.json unit note); probe in ms, slope in ms per minute.

### 6.12 Data isolation, cleanup and leak check

- Each capture reads only its own run's artefacts (the run id is an input). No shared state between runs except the release tag.
- The leak check is the same token scan and gitleaks that evidence-release uses, run **before** any upload (raw download, then the summaries). A hit stops the job (exit 1). Nothing is uploaded and no release is created.
- The summary keys are restricted (section 6.4). The validator refuses forbidden keys, so a summary cannot carry a token-shaped field by design.
- The raw artefacts are never uploaded by the capture. They are deleted with the runner.
- The allowlist of `.gitleaks.toml` is not changed (P-31).

### 6.13 Pages reading (summary of the pages.yml changes)

- `workflow_run.workflows: ["evidence-release", "soak-release"]` (pages.yml line 5 changes).
- New job `soak-summaries` (`needs: []`, same `if` as build, `timeout-minutes: 20`): lists releases with `gh api --paginate repos/$GITHUB_REPOSITORY/releases` and keeps the tags `p6-soak-*`; for each tag, `gh release download <tag> --pattern 'soak-summary-*.json' --pattern SHA256SUMS.txt --dir <dir>/<tag>`; checks `sha256sum -c` per file; token scan; gitleaks; uploads artefact `soak-weekly` (`retention-days: 1`).
- The build job gets `needs: soak-summaries` and one `actions/download-artifact` step (the same SHA as the scan job, line 145) into `soak-weekly/`. `build-site.ts` gets `--weekly-soak soak-weekly`.
- A release that exists but whose pages run fails: the next pages run lists it again, so nothing is lost (EXTRA case X-5).

### 6.14 File-ownership block (copied from the Phase 5 build table)

Build-time ownership. Lane C, Task 7 is the row used here. The same table is in all four Phase 5 planning prompts.

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                         | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                       | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

Merge order (build): Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

Task 7 touches only its own row. The registration lines are `build-site.ts` (flag and call), `page.ts` (one import, one section call) and `pages.yml` (workflow_run list and the new job and build step). It does not touch the workflow-id list in evidence-release.yml, because the capture publishes no evidence zip and its run is not an evidence run (section 14, Q-IDS).

## 7. Oracles and verdict rules (consolidated)

| Rule                                    | Exact form                                                                                                                       | Where the number lives                                         | Stricter than the roadmap?                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Weekly point                            | D-T7-2: event schedule, workflow 397232763, main, success, a `soak-*-120` artefact, run-meta durationSec 7200 and event schedule | `weeklyRefusal` (src/load/soak/weekly-summary.ts) and `decide` | Yes: the roadmap does not say how to tell weekly from nightly; this does |
| VALID summary                           | D-T7-5: verdict in PASS, FAIL (PRODUCT BUG), NO THRESHOLD YET                                                                    | `isValidVerdict`                                               | Same as soak verdict.ts meaning of INVALID and TEST BUG                  |
| Gap                                     | any INVALID summary, unknown schema, duplicate week, missing product, tag mismatch, unreadable file                              | `buildWeeklyTrend`                                             | Roadmap line 480: "INVALID weeks are gaps"                               |
| Collecting                              | `statusFor(n)` with `REQUIRED_VALID_WEEKS = 3`                                                                                   | `src/dashboard/soak/weekly-trend.ts`                           | Agreed decision c                                                        |
| Marker                                  | productSha, harnessTag or k6Version differs from the last VALID point                                                            | `buildWeeklyTrend`                                             | Roadmap line 481                                                         |
| Refused capture (week already captured) | a tag already exists on the remote or as a release                                                                               | `Refuse an existing tag` steps (capture and publish)           | Roadmap is silent; the prompt rule applies                               |
| Refused capture (validation)            | any `weeklyRefusal` reason                                                                                                       | `decide`                                                       | Prompt rule                                                              |
| Missing data                            | a product artefact absent in a weekly run                                                                                        | `missingSummary`                                               | Roadmap silent; D-T7-4                                                   |

## 8. Data isolation, cleanup and leak check (summary)

Section 6.12 is the full text. Two things the build must not change: (1) the scanner patterns in `scripts/evidence-token-scan.mjs`; (2) the allowlist in `.gitleaks.toml`. The build adds no allowlist entry and no exclusion. If a summary field trips a pattern, the field is renamed in the writer and the summary is not published with the pattern disabled.

## 9. CI budget (rule C4)

Rules: C1 no timeout raised. C2 every new step has `timeout-minutes`. C3 margin = job timeout − sum of step caps ≥ 10. C5: no job starts a product, so no down step is needed; the capture job and the publish job start no product. The planning check below uses the step caps of this plan.

### 9.1 New workflow `soak-release.yml`

Run triggers: `workflow_run` of `soak` (every completed soak run; the decide job exits early for nightly runs), `workflow_dispatch` (owner backfill, main only).

| job                   | job timeout | each step and its cap                                                                                                                                                                         | sum of step caps | worst case | margin (≥ 10 min) |
| --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | ----------------- |
| decide                | 15          | checkout 1; setup-node 1; validate run and artefacts (gh api + node) 2                                                                                                                        | 4                | 4          | 11                |
| capture (weekly only) | 30          | checkout 1; setup-node 1; refuse existing tag 1; download artefacts 4; token scan raw 2; install gitleaks 1; gitleaks raw 2; summarize 2; token scan + gitleaks summaries 3; upload handoff 2 | 19               | 19         | 11                |
| publish (weekly only) | 25          | download handoff 2; refuse existing tag 1; install gitleaks 1; token scan + gitleaks again 3; create release 3                                                                                | 10               | 10         | 15                |

Worst case for the whole run: decide 4 + capture 19 + publish 10 = 33 minutes of step caps, all inside the job limits above. The nightly runs use only `decide` (4 min cap).

### 9.2 Changed `pages.yml`

| job                                                               | job timeout             | each step and its cap                                                                                                                               | sum of step caps | worst case | margin (≥ 10 min)                                         |
| ----------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | --------------------------------------------------------- |
| build (changed: one download step added, `needs: soak-summaries`) | 20 (unchanged, line 38) | checkout 1; setup-node 1; collect 1; validate 1; list 1; fetch 2; **download soak-weekly 1 (new)**; build site 1; upload 1                          | 10               | 10         | 10                                                        |
| soak-summaries (new job)                                          | 20                      | checkout 1; setup-node 1; fetch summaries from releases (list, download, sha256) 3; install gitleaks 1; token scan 1; gitleaks 1; upload artefact 1 | 9                | 9          | 11                                                        |
| scan (unchanged)                                                  | 20 (line 129)           | 9 (P-22)                                                                                                                                            | 9                | 9          | 11                                                        |
| deploy (unchanged, PRE-EXISTING)                                  | 10 (line 192)           | deploy-pages 5 (line 199)                                                                                                                           | 5                | 5          | **5 (below C3, pre-existing, not changed; see Q-DEPLOY)** |

The build job's margin is exactly 10 with the one added step. That meets C3 (≥ 10). Any second added step to build breaks C3, so the build must not add another step there. The fetch step lives in the new job for that reason.

The `needs: soak-summaries` line does not change any timeout.

### 9.3 Trigger summary

| workflow     | trigger                                        | when                                                         |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| soak-release | workflow_run of `soak` completed               | after every soak run (weekly: capture; nightly: decide only) |
| soak-release | workflow_dispatch with `run_id`                | owner backfill                                               |
| pages        | workflow_run of `soak-release` completed (new) | after each capture, and after nightly runs (Q-NIGHTLY)       |

## 10. Expected output

### 10.1 Files under the scratch and job folders

- `$RUNNER_TEMP/soak/soak-<product>-120/…` (raw; not uploaded)
- `$RUNNER_TEMP/summaries/soak-summary-<product>.json` (3 files), `SHA256SUMS.txt`, `NOTES.md`
- Artefact `weekly-summaries` (handoff, 1 day)
- Release `p6-soak-<yyyy>-w<ww>`: assets `soak-summary-cal.json`, `soak-summary-medusa.json`, `soak-summary-documenso.json`, `SHA256SUMS.txt`
- Artefact `soak-weekly` in pages (1 day)
- `site/index.html` with the section `id="soak-weekly"`

### 10.2 Job summary lines (capture and publish)

```
weekly soak capture: run <id>, tag <tag>
cal: valid|gap (<reason>)
medusa: valid|gap (<reason>)
documenso: valid|gap (<reason>)
release: created <tag>  |  refused: <reason>
token scan: clean   gitleaks: no leaks found
```

The job summary never prints a secret value. It prints counts and reasons.

### 10.3 Dashboard section (status lines)

For each product: `collecting (n/3 weeks)` or `trend`. Rows: one per week, from the release.

### 10.4 Artefact names and retention

- `weekly-summaries`: `retention-days: 1` (handoff).
- `soak-weekly`: `retention-days: 1` in pages (handoff).
- Summaries live in the release (no expiry).

## 11. Environment changes

**No environment change.** The new workflows use only the GitHub-hosted runner's preinstalled `git`, `gh`, `node` (set by `setup-node` with `.nvmrc`), `sha256sum` and `curl`, plus gitleaks downloaded at a pinned version and sha256 (the same way evidence-release and pages do it). No Node version, image, `/etc/hosts` entry, secret name or local tool changes. Cursor cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) and Claude Code cloud (`.claude/hooks/session-start.sh`, the setup script): nothing to add. The build's unit tests run with the existing `node --test` on the cloud's Node 22.23 (`/usr/local/bin` first, as AGENTS.md says) and need nothing new.

**Owner settings:** none needed (P-39). The evidence-release publish already runs with `contents: write` declared in the workflow. The owner step in section 11.1 only checks it.

### 11.1 Owner steps (GitHub web UI)

1. **Merge the build PR** (when it exists): Pull requests → the build PR → "Create a merge commit". Owner only (R8).
2. **Check the first weekly capture**: after 2026-11-02 about 03:30 Asia/Colombo: Actions → "soak-release" → latest run → read the job summary. Then Code → Releases: the release `p6-soak-2026-w44` should be listed. No action needed if it is.
3. **Backfill a weekly run (only if needed, within 90 days of its run)**: Actions → "soak-release" → "Run workflow" → branch `main` → input `run_id` = the scheduled 120-min soak run id → "Run workflow". The run is refused for any other run.
4. **Track the follow-up** (section 14, Q-FOLLOW): owner-tracked, not part of this task.

No repo setting changes. Steps 1–4 are not on the critical path of another lane.

## 12. Build order

Each step: files, command, expected output, commit message (lowercase Conventional Commit), and "run `npm run check` before every push". Unit counts are B0 + planned additions. B0 = 1405 (re-measure at build start, R-01 in section 5).

| Step | What                                                                                                                                                                                                                                    | Files                                                                                                                                                                                                                                                                                                                                                                            | Expected unit count after the step | Commit message                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| S0   | Baseline and branch                                                                                                                                                                                                                     | none                                                                                                                                                                                                                                                                                                                                                                             | 1405 (B0 re-measured)              | none                                                            |
| S1   | Summary schema v1, decision, ISO tag, size limit (section 6.6)                                                                                                                                                                          | `src/load/soak/weekly-summary.ts` (NEW), `tests/unit/soak-weekly-summary.test.ts` (NEW, 9 tests)                                                                                                                                                                                                                                                                                 | 1414                               | `feat(soak): add the weekly soak summary schema v1`             |
| S2   | Trend module, status text, markers, gaps; render section; fixtures (section 6.7, 6.8, 6.10)                                                                                                                                             | `src/dashboard/soak/weekly-trend.ts` (NEW), `src/dashboard/render/weekly-soak.ts` (NEW), `tests/unit/soak-trend.test.ts` (NEW, 12 tests), `tests/fixtures/soak-trend/*.json` (NEW), `src/dashboard/render/page.ts` (CHANGED: one import, `weeklySoak?` field, one section call before line 367)                                                                                  | 1426                               | `feat(dashboard): add the weekly soak trend module and section` |
| S3   | The CLI writer and decision (scripts/soak/weekly-capture.ts) with `decide` and `summarize`                                                                                                                                              | `scripts/soak/weekly-capture.ts` (NEW). No new test count (its functions are tested in S1). Run it locally on the probe folders (copy to scratch first) and check its output.                                                                                                                                                                                                    | 1426                               | `feat(soak): add the weekly capture script`                     |
| S4   | The capture workflow                                                                                                                                                                                                                    | `.github/workflows/soak-release.yml` (NEW), `tests/unit/soak-release-workflow.test.ts` (NEW, first 3 tests: permissions, every step has a timeout, C3 margins of its jobs)                                                                                                                                                                                                       | 1429                               | `ci(soak): capture the weekly soak into a p6-soak release`      |
| S5   | pages.yml wiring and the build flag                                                                                                                                                                                                     | `.github/workflows/pages.yml` (CHANGED: workflow_run list, job `soak-summaries`, build `needs` and one download step, `--weekly-soak` arg), `scripts/dashboard/build-site.ts` (CHANGED: generalised flag parse, `readWeeklySoak`), `tests/unit/soak-release-workflow.test.ts` (3 more tests: pages lists soak-release; the build job margin is ≥ 10; soak-summaries margin ≥ 10) | 1432                               | `ci(pages): read the weekly soak releases at build time`        |
| S6   | README section                                                                                                                                                                                                                          | `README.md` (CHANGED: "Weekly soak trend")                                                                                                                                                                                                                                                                                                                                       | 1432                               | `docs(readme): describe the weekly soak trend`                  |
| S7   | Checks and pushes                                                                                                                                                                                                                       | `npm run check` on the branch; `actionlint` through `npm run lint:actions`                                                                                                                                                                                                                                                                                                       | 1432                               | none                                                            |
| S8   | PR for the build (only when the owner asks; repo rule A.6 and B.10 are about plan PRs; a build PR follows the usual rules)                                                                                                              | none                                                                                                                                                                                                                                                                                                                                                                             | 1432                               | none                                                            |
| S9   | First real weekly run (after 2026-11-01 19:29 UTC): read the capture run, the release, the pages run and the section; confirm the three summaries are valid or have reasons. Record the run URLs in the closeout note (not in this PR). | none (observation only)                                                                                                                                                                                                                                                                                                                                                          | 1432                               | none                                                            |

Mapping the planned tests to S1–S5: S1 9 tests; S2 12 tests; S4 3 tests; S5 3 tests. Total added 27. 1405 + 27 = 1432.

Expected output of `npm run check` after each step: format check passes (run `npx prettier --write` on each new file first), `actionlint` passes on every changed workflow, `tsc --noEmit` passes, `k6:inspect` passes, `node --test tests/unit/*.test.ts` reports `# fail 0` and the count above.

## 13. Extra risky cases (EXTRA, labelled, not P6 IDs)

Each case is labelled `EXTRA`; none gets a new P6 ID (O6, roadmap D11).

| ID        | Case                                                                                          | Oracle                                                                                                                                                              | Cost              | In the build?                                                                               |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| X-1 EXTRA | A forged backfill: `run_id` of another workflow, of a dispatched run, or of a non-main branch | `weeklyRefusal` returns a reason and `decide` exits 1 before any download; test in S1 (test 8) and a dry run in S3                                                  | 0 (in S1)         | Yes (in the decision test)                                                                  |
| X-2 EXTRA | A soak artefact contains a token-like string                                                  | The raw token scan fails the capture before any upload; test with a fixture folder through `scripts/evidence-token-scan.mjs` in S3                                  | 1 test            | Yes if it fits the budget                                                                   |
| X-3 EXTRA | Two capture runs for the same week race                                                       | The workflow group `soak-release` serialises them; the second run refuses at "refuse an existing tag" and exits 0 with a summary line. Oracle: exactly one release. | observation in S9 | Partly: the serialisation is in the workflow; the behaviour is observed only in a real race |
| X-4 EXTRA | A summary over 64 KiB                                                                         | `summarize` refuses the file (test 9 in S1)                                                                                                                         | 0                 | Yes                                                                                         |
| X-5 EXTRA | A release exists but the pages run fails                                                      | The next pages run lists the release again; no state is stored                                                                                                      | observation       | Documented only                                                                             |
| X-6 EXTRA | `soak.json` is not valid JSON                                                                 | Reader gap `not valid JSON`; never a crash of the site build                                                                                                        | 1 test            | Yes if budget                                                                               |

## 14. Risks, roadmap conflicts and open decisions

### 14.1 Roadmap conflicts

| Roadmap says                                                                                                         | Probe shows                                                                                 | Decision or open question                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Task 7 "Capture is not built here" (lines 475–477) and D8 "Publishing starts in Phase 4 Task 7" (lines 561–564)      | No `p6-soak-*` release or tag; nothing under `.github/` mentions `p6-soak` (P-17)           | Agreed decision (a): capture is built here (D-T7-1).                                                 |
| "`soak.yml` is unchanged here" (line 491)                                                                            | Artefacts and run-meta carry everything needed; no soak.yml change is required (P-06, P-14) | Keep. Q-SOAKYML is **not triggered**: no change to soak.yml is needed.                               |
| "p95 slope" (line 476)                                                                                               | soak.json has no p95 (P-12)                                                                 | Q-P95 (below). Recommended option is built (D-T7-7).                                                 |
| "connections" (line 476)                                                                                             | The soak measures Postgres total connections (`db.total`), `dbConnections` (P-11)           | Recorded as "DB connections".                                                                        |
| "≥ 3 weekly VALID points per product on the dashboard" (line 492)                                                    | Agreed decision (c): "collecting (n/3 weeks)" until 3 VALID points, then the trend          | Done-when item adjusted (section 15).                                                                |
| `src/load/soak/trend.ts` (line 483)                                                                                  | The readers of soak results live in `src/dashboard/soak/` (P-32)                            | Placed at `src/dashboard/soak/weekly-trend.ts` (roadmap line 483 allows it when the probe shows it). |
| "`build-site.ts` lists those releases through the GitHub releases API … and downloads the summaries" (lines 478–479) | build-site.ts has no network code; pages.yml lists releases already (P-20, P-21)            | The pages job `soak-summaries` lists and downloads; build-site reads a directory (D-T7-11).          |
| Note 4: artefacts expire after 14 days (line 87)                                                                     | Soak artefacts have `retention-days: 90` (P-06)                                             | Note 4 is about older artefacts. The 90-day window is the backfill window.                           |
| evidence-release publishes a release only with a committed `docs/releases/<tag>.md` (P-18)                           | A weekly capture cannot wait for a committed file                                           | Q-CAPTURE option (c) is rejected; the capture writes its notes at run time.                          |
| "`pages.yml` (`contents: read` for the releases API)" (line 484)                                                     | Listing works with `contents: read` (P-19, P-20)                                            | No permission change. The pages job keeps `contents: read`.                                          |
| Roadmap "dashboard plots each metric per week with run links" (line 480)                                             | Agreed decision (c)                                                                         | Plot only at 3 or more VALID points; the table is always shown.                                      |
| Roadmap "Done when ≥ 3 weekly VALID points" (line 492)                                                               | W44 is the first weekly run, on 2026-11-02 (Asia/Colombo)                                   | The build can finish before the 3 points exist. The follow-up is owner-tracked (Q-FOLLOW).           |
| Prompt: Task 7 "`soak.yml` is unchanged here" and the capture triggers on soak completion                            | A failed weekly soak gives no release, so no gap is visible                                 | Q-FAILED (below).                                                                                    |
| Prompt: B0 "1403 after PR #157"                                                                                      | `npm run check` on main gives 1405 (P-02)                                                   | B0 = 1405 used everywhere.                                                                           |
| Prompt: the planning session opens ONE PR                                                                            | `docs/agent-rules.md` A.6 and B.10: plan branches get no PR                                 | Q-PR (below): the plan is pushed without a PR.                                                       |
| pages.yml deploy job margin (C3)                                                                                     | Job 10 min, step 5 min, margin 5 (P-23)                                                     | Q-DEPLOY (below). Pre-existing; not changed here.                                                    |
| Medusa soak artefact layout (`stage/load-medusa`)                                                                    | Cal and Documenso are flat (P-10)                                                           | The reader walks the tree and maps by caseId. Not a conflict, but an input the writer must handle.   |
| Lane A Task 2 flags and pin bump change `harnessTag` in run-meta                                                     | Any pin bump appears as a marker (D-T7-10)                                                  | Expected; the view says so in its explanation.                                                       |

### 14.2 Open decisions (Q numbers, each with options and a recommendation)

**Q-CAPTURE (decide before the build).** Where the capture lives.

- (a) A new workflow `soak-release.yml` on `workflow_run` of `soak`. No soak.yml change. **Recommended**: P-06, P-14 and P-19 prove it can read everything it needs; the Lane A owner keeps soak.yml.
- (b) A publish job appended to `soak.yml` after Task 2 merges. Rejected: it changes a file Lane A owns and makes Task 7 wait for Task 2.
- (c) The owner dispatches evidence-release weekly with a committed `docs/releases/p6-soak-<yyyy>-w<ww>.md`. Rejected: a weekly human step, and the notes check (P-18) does not fit a summary release.

**Q-SOAKYML.** Not triggered. The probe shows no change to soak.yml is needed (P-06, P-10). If the build finds otherwise, stop and record it here.

**Q-P95 (owner choice).** What "p95 slope" means.

- (a) **Recommended**: `healthProbeMs` as in D-T7-7: nearest-rank p95 of the 1 Hz health-probe latency after warm-up, plus its slope with `soakSlope`, labelled as a proxy. The proxy label is already the roadmap's own wording (line 291).
- (b) Drop it from v1 and add a per-request p95 in v2. The per-request data is not in the artefacts (only a gzipped k6 JSON, P-06), so this needs a k6 summary change first.
- (c) Use the k6 `http_req_duration` p(95) from `k6-main-summary.json` as a whole-run number, with no slope. Not a slope, so it does not meet the roadmap term.

**Q-VALID (owner confirms).** D-T7-5: VALID = `PASS`, `FAIL (PRODUCT BUG)`, `NO THRESHOLD YET`. **Recommended** as written. The alternative (only `PASS` and `FAIL` count) would make every week invalid until calibration (P-15), so the trend would never leave "collecting".

**Q-FAILED.** A weekly soak whose run concludes `failure` (for example, cal-soak failed and medusa and documenso never run, soak.yml lines 239 and 417). The prompt's rule (`conclusion: success`) gives no release, so the week is absent, not a gap.

- (a) Keep the prompt rule (default in this plan).
- (b) **Recommended**: capture any conclusion for a scheduled 120-min run, so the failed week shows as gaps with a reason. Changes the `decide` rule and the test 8 table.
  Owner decides. The build uses (a) until the owner says otherwise.

**Q-NIGHTLY.** Every completed soak run (also the nightly 30-min runs, six a week) triggers `soak-release` and then `pages`. The nightly capture stops at `decide` (no release), but its completion can still start pages.

- (a) **Recommended**: accept. Cost: up to six extra pages builds a week, each with the same content. Pages has no content change to publish, and the build is cheap.
- (b) Make pages skip when no new release exists: adds state or a comparison step. Not worth its code now.
- Re-check R-10 (run conclusion of a nightly capture) decides whether pages runs at all.

**Q-CONC.** The publish job's concurrency group uses `needs.decide.outputs.tag`. If `actionlint` or GitHub rejects it, the workflow-level group `soak-release` is used alone (already serialises every capture). Build-time check R-09.

**Q-IDS.** Whether the weekly capture's run id goes into the `EVIDENCE_WORKFLOW_IDS` lists (evidence-release line 39, pages line 30). **Recommended: no.** The capture publishes no evidence zip, and pages reads summaries from releases, not run zips. The `soak` id is already in the list (397232763) and is unchanged.

**Q-DEPLOY.** The pages deploy job has margin 5 (P-23), which breaks C3 today. C1 forbids raising its timeout, and shrinking `deploy-pages` (cap 5) would squeeze an existing step. **Recommended**: owner decides whether the rule applies to this unchanged job; this task does not change it.

**Q-PR.** The planning prompt asks for one plan PR. `docs/agent-rules.md` A.6 and B.10 say plan branches get no PR, and the prompt's own rule says the stricter rule wins. This session pushes `plan/2026-10-29-p6-phase5-task7` and **opens no PR**. **Recommended**: owner says "open the PR" and the planning session (or the owner) opens it, or the owner accepts the repo rule and the branch is reviewed directly.

**Q-FOLLOW (owner-tracked, not part of this task).** The follow-up PR. It is due when three real VALID weeks exist for each product (earliest exit in section 15). It records the three weekly release links in the README trend section and confirms the rendered trend. It is not built here.

**Q-EXIT (fact, no decision).** The earliest date when the trend can leave "collecting": only if W44, W45 and W46 are all VALID for a product and the capture and pages run on time. W46's run starts 2026-11-16 00:59 Asia/Colombo and ends about 03:30; capture and pages add about 30–60 min. **Earliest: 2026-11-16 (Asia/Colombo), about 04:00.** Any INVALID or missing week pushes this later.

**Q-BACKFILL (fact).** A weekly run can be backfilled only while its artefacts exist (90 days from creation, P-06). After that the week is lost (a gap). The owner decides whether to backfill; the build does not do it.

### 14.3 Risks

- A weekly soak with an INVALID product (telemetry gaps, dropped iterations) shows as a gap. Three INVALID weeks delay the trend. The roadmap accepts this (line 494).
- The harness pin bump (Lane A Task 2) changes `harnessTag` and draws a marker. Expected, not a fault.
- Documenso's RSS slope is large in the nightly run (P-16). The view shows it. It is not a verdict and this plan adds no gate.
- The capture depends on the artefact names `soak-<product>-120`. A rename in soak.yml breaks the capture. R-02 checks it each build.
- pages.yml is at the three-workflow chain limit (P-25). No workflow may be added after pages.

## 15. Done when and rule self-check

### 15.1 Done when (the roadmap's, adjusted only by the agreed decisions)

Roadmap text (lines 492–493): "≥ 3 weekly VALID points per product on the dashboard with links; `npm run check` green."

Adjusted for this task:

- The build is done when: the capture workflow, the trend view and the pages wiring are merged; the unit tests pass (1432 after S5); `npm run check` is green; the trend shows `collecting (n/3 weeks)` for every product until three VALID points exist (agreed decision c); the first weekly capture (W44) ran and its release exists, or the owner has accepted a test-only closeout until it does.
- The trend **leaves "collecting"** only when a product has three VALID weekly points. That is **owner-tracked** (Q-FOLLOW), not part of this task. Earliest: 2026-11-16 Asia/Colombo (Q-EXIT).
- "Points with links": each VALID point links its soak run.

### 15.2 Rule self-check (section 0 of the planning prompt)

| Rule                                            | Status                                                                                                          | Note                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| N1 no-stop                                      | met                                                                                                             | Work continued through all steps; the only stop was the plan PR decision (Q-PR), recorded.                                      |
| N2 no password or token asked                   | met                                                                                                             | No token was requested or printed. Public reads and an unauthenticated artefact download were used.                             |
| N3 probe, never guess                           | met                                                                                                             | Every fact in section 3 has evidence. Unknowns are NOT PROBED with a re-check (P-35 to P-38).                                   |
| N4 root-cause failures                          | met                                                                                                             | No CI failure. The only failure in the session was a probe-scope item (none); the Medusa layout difference is explained (P-10). |
| N5 progress log                                 | met                                                                                                             | Log kept at `$HOME/p6-phase5-task7-progress.md`, outside the repo.                                                              |
| R1 GitHub access                                | met                                                                                                             | GitHub REST reads and plain git only.                                                                                           |
| R2 excluded account                             | met                                                                                                             | Identity is the repo owner's login (P-01).                                                                                      |
| R3 explicit staging                             | met                                                                                                             | `git add docs/plans/2026-10-29-p6-phase5-task7-soak-trend.md` only.                                                             |
| R4 no force push                                | met                                                                                                             | No force push.                                                                                                                  |
| R5 commit and PR text                           | met                                                                                                             | Conventional Commit, lowercase, no trailers.                                                                                    |
| R6 no owner name                                | met                                                                                                             | "the owner" throughout.                                                                                                         |
| R7 no comments, no CodeRabbit                   | met                                                                                                             | No comment posted.                                                                                                              |
| R8 no merge                                     | met                                                                                                             | No merge.                                                                                                                       |
| R-PR (Q-PR)                                     | not applicable to the plan commit                                                                               | No PR opened (repo rule A.6 and B.10).                                                                                          |
| O1 planning only                                | met                                                                                                             | The only file added is the plan.                                                                                                |
| O2 no roadmap or earlier plan edit              | met                                                                                                             | None edited.                                                                                                                    |
| O3 no fork or node_modules edit                 | met                                                                                                             | None.                                                                                                                           |
| O4 no secret printed                            | met                                                                                                             | No env value printed. Raw downloads were scanned, not printed.                                                                  |
| O5 private findings                             | met                                                                                                             | None named or used.                                                                                                             |
| O6 case IDs                                     | met                                                                                                             | No new ID; the roadmap IDs quoted as written.                                                                                   |
| O7 no weaker threshold or scan                  | met                                                                                                             | No allowlist or scanner change (section 8).                                                                                     |
| O8 no GitHub command-line client in owner steps | met                                                                                                             | Owner steps use GitHub web UI wording.                                                                                          |
| P1 probe first                                  | met                                                                                                             | Section 3.                                                                                                                      |
| P2 products only through the harness            | met                                                                                                             | No product started.                                                                                                             |
| P3 no process killed                            | met                                                                                                             | None.                                                                                                                           |
| P4 timings are not performance numbers          | met                                                                                                             | No timing is published in this plan.                                                                                            |
| P5 one-shot read-only commands                  | met                                                                                                             | `gitleaks version`, `dir` scans, `curl` reads only.                                                                             |
| C1 no timeout raised                            | met                                                                                                             | Section 9 changes none.                                                                                                         |
| C2 every new step has a timeout                 | met                                                                                                             | Every step in section 9 has a cap.                                                                                              |
| C3 margin ≥ 10                                  | **met for new and changed jobs; NOT met for the unchanged pages deploy job (margin 5, pre-existing, Q-DEPLOY)** |                                                                                                                                 |
| C4 budget table per changed job                 | met                                                                                                             | Section 9.                                                                                                                      |
| C5 product down step                            | not applicable                                                                                                  | No job starts a product.                                                                                                        |
| E1 environment changes                          | met                                                                                                             | "No environment change" with reason (section 11).                                                                               |
| H1 excluded account                             | not triggered                                                                                                   |                                                                                                                                 |
| H2 main changed in a way that matters           | not triggered                                                                                                   | `5215127` is the base.                                                                                                          |
| H3 secret or product start needed               | not triggered                                                                                                   |                                                                                                                                 |
| H4 a change outside the plan file               | not triggered                                                                                                   |                                                                                                                                 |
| H5 secret found                                 | not triggered                                                                                                   |                                                                                                                                 |
| H6 weaker threshold to write the plan           | not triggered                                                                                                   |                                                                                                                                 |
| H7 plan PR CI fails                             | not applicable                                                                                                  | No PR (Q-PR).                                                                                                                   |
| H8 push 403 or 404                              | to be recorded in the report                                                                                    |                                                                                                                                 |

### 15.3 Plan self-check (repo rule F.20)

| Check                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (a) Every roadmap Done-when item met or listed             | Done-when adjusted and listed (section 15.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| (b) Every named existing file and function is at that path | `src/load/soak/report.ts` (soakStatistics), `src/load/soak/verdict.ts` (soakVerdict), `src/load/soak/slope.ts` (soakSlope), `src/load/run-meta.ts` (buildRunMeta), `src/dashboard/soak/read-trends.ts` (readSoakTrends), `src/dashboard/render/page.ts` (renderSite), `src/dashboard/site-model.ts` (escapeLabel, SOAK_CASE_IDS), `scripts/dashboard/build-site.ts`, `scripts/evidence-token-scan.mjs`, `.gitleaks.toml`, `.github/workflows/{soak,pages,evidence-release}.yml`, `docs/agent-rules.md`, `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`, `k6/thresholds/soak-bounds.json`. New paths are marked NEW in section 6.3. |
| (c) CI time estimate under the job timeout, margin ≥ 10    | Section 9. Pages deploy is the pre-existing exception.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| (d) Skeletons, git add paths, commit commands              | Skeletons in 6.4, 6.6, 6.7; commit messages in section 12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| (e) Owner answers not invented                             | None. Every Q is open with a recommendation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
