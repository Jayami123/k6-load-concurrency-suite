# P6 X5: retry image pulls before harness up in every job

Backlog item X5 ([BACKLOG.md](../BACKLOG.md), from the Task 6 plan §12). Branch `ci/2026-10-23-p6-pull-retry` from `origin/main`
at `38533b0`.

**Status: built, PR opened (see the PR for the first run).** The budget gate was passed with the owner's decisions M1 and T1 (§5).

## 1. Goal and scope

- **Goal.** Every job that starts a harness stack pulls its images first, with bounded retries, so one registry flake does not
  fail a job before any test runs. Evidence: run `39961527451` attempt 1 (registry HTTP 500 on `documenso-smoke` and
  `cal-smoke`), and run `39979511916` (Docker Hub timeout on `postgres:18` in `cal-smoke`).
- **In scope.** One shared script, `scripts/ci/compose-pull.sh`. A pull step in each of the six jobs that lack one. `twenty-smoke`
  moves its inline loop onto the script (after the decision in §5).
- **Out of scope.** Product forks, `node_modules`, tests, races, assertions, secrets, environment settings, image tags and digests
  (X1). Timeouts of older steps (§6, a follow-up).

## 2. The shared script

`scripts/ci/compose-pull.sh` (executable, shellcheck clean). Only `docker compose pull` is retried. `harness up`, seed and tests
are never retried. Each try is capped at 100 s (named constant `per_try_seconds`).

```bash
#!/usr/bin/env bash
# Pulls the images of one harness compose project, with bounded retries, before harness up.
#
# Why: Docker Hub registry flakes (HTTP 500 and token timeouts on hosted runners) failed jobs before
# any test ran in CI runs 39961527451 and 39979511916. Only `docker compose pull` is retried; harness
# up, seed and tests are never retried here.
#
# Usage: compose-pull.sh -p <project> -f <file> [-f <file> ...]
# Pass the same project name and -f files that `npm run up:<product>` uses (see the X5 plan's probe table).
set -euo pipefail

usage() {
  echo "usage: compose-pull.sh -p <project> -f <file> [-f <file> ...]" >&2
  exit 2
}

project=""
files=()
while getopts ":p:f:" opt; do
  case "$opt" in
    p) project="$OPTARG" ;;
    f) files+=("$OPTARG") ;;
    *) usage ;;
  esac
done
if [ -z "$project" ] || [ "${#files[@]}" -eq 0 ]; then
  usage
fi

compose=(docker compose -p "$project")
for file in "${files[@]}"; do
  compose+=(-f "$file")
done

# Worst CI pull measured 66 s (twenty-smoke, PR #44 head 4672b4d); 100 s per try leaves room above it.
per_try_seconds=100
max_tries=3
for attempt in 1 2 3; do
  if timeout "$per_try_seconds" "${compose[@]}" pull --ignore-buildable; then
    exit 0
  fi
  if [ "$attempt" -lt "$max_tries" ]; then
    echo "pull attempt ${attempt} failed; retrying"
    sleep $(( attempt == 1 ? 15 : 30 ))
  fi
done
echo "::error::docker compose pull failed after ${max_tries} attempts"
exit 1
```

**Checks run.** `shellcheck scripts/ci/compose-pull.sh` exits 0. A bad file path fails all three tries and prints the error
(§3.3). The success path ran for every product (§3.2).

## 3. Probe (read-only; the adapters in `node_modules/qa-portfolio-harness`, v0.2.12)

### 3.1 What each `npm run up:<product>` uses

| Jobs                                                         | `up` call              | Compose project (`-p`) | Working directory                               | `-f` files, in order                                                                                                      | Images pulled                                                                         | Built locally? |
| ------------------------------------------------------------ | ---------------------- | ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| `medusa-smoke`, `medusa-order-races`, `medusa-cancel-extras` | `npm run up:medusa`    | `qa-harness-medusa`    | `<p6>/node_modules/qa-portfolio-harness/docker` | `medusa.compose.yml` only. `medusa.redis.compose.yml` is added only when `MEDUSA_REDIS=1`, and no job sets it             | `postgres:15`                                                                         | No             |
| `cal-smoke`, `cal-state-races`                               | `npm run up:cal`       | `qa-harness-cal`       | `<products>/cal/packages/prisma`                | `<products>/cal/packages/prisma/docker-compose.yml`, then `<p6>/node_modules/qa-portfolio-harness/docker/cal.compose.yml` | `postgres:18`, `postgres` (the `postgres_is_ready` service, unpinned)                 | No             |
| `documenso-smoke`                                            | `npm run up:documenso` | `qa-harness-documenso` | `<p6>/node_modules/qa-portfolio-harness/docker` | `documenso.compose.yml` only                                                                                              | `postgres:15`, `inbucket/inbucket`                                                    | No             |
| `twenty-smoke`                                               | `npm run up:twenty`    | `qa-harness-twenty`    | `<products>/twenty-CRM/packages/twenty-docker`  | the fork's `docker-compose.yml`, then `<p6>/node_modules/qa-portfolio-harness/docker/twenty.compose.yml`                  | `postgres:16`, `twentycrm/twenty:v2.44.0` (`TAG`), `axllent/mailpit:v1.22.3`, `redis` | No             |

`<p6>` is `${{ github.workspace }}/p6`. `<products>` is `${{ github.workspace }}/products` (`PRODUCTS_ROOT`, which every job sets).

**Built locally?** No. `docker compose config` on each file set lists no `build:` section, so `--ignore-buildable` changes nothing
today. It stays because the owner asked for it.

### 3.2 Local runs (this VM, real output, warnings removed)

Cal (`cal`, images `postgres:18` and `postgres`):

```
 Image postgres Pulling
 Image postgres:18 Pulling
 Image postgres Pulled
 Image postgres:18 Pulled
```

Documenso (`documenso.compose.yml`):

```
 Image inbucket/inbucket Pulling
 Image postgres:15 Pulling
 Image postgres:15 Pulled
 Image inbucket/inbucket Pulled
```

Medusa (`medusa.compose.yml`):

```
 Image postgres:15 Pulling
 Image postgres:15 Pulled
```

Twenty (`TAG=v2.44.0`, the fork file plus the harness overlay):

```
 Image redis Pulling
 Image twentycrm/twenty:v2.44.0 Pulling
 Image axllent/mailpit:v1.22.3 Pulled
 Image redis Pulled
 Image twentycrm/twenty:v2.44.0 Pulled
 Image postgres:16 Pulled
```

All four exited 0. The first Twenty run without `TAG` pulled `twentycrm/twenty:latest` (a probe mistake; CI sets `TAG`).

### 3.3 Failure path (bad file, real output)

```
compose file "/nonexistent/x.yml" is invalid: open /nonexistent/x.yml: no such file or directory
pull attempt 1 failed; retrying
compose file "/nonexistent/x.yml" is invalid: open /nonexistent/x.yml: no such file or directory
pull attempt 2 failed; retrying
compose file "/nonexistent/x.yml" is invalid: open /nonexistent/x.yml: no such file or directory
::error::docker compose pull failed after 3 attempts
```

Exit 1 after about 45 s (15 s and 30 s backoff). Each harness `down` also exits 0 with nothing running (checked for medusa,
documenso and cal).

## 4. Changes (applied in this PR)

- **Shared script:** `scripts/ci/compose-pull.sh`, 100 s per try, 3 tries, 15 s then 30 s backoff, so each pull step is capped at
  **6 min** (3 × 100 s + 45 s = 5.75 min).
- **Six pull steps:** `Pull <Product> images (3 tries, 15 s then 30 s)` with an `id` and `timeout-minutes: 6`, placed just before
  harness up. Each harness up has `if: ${{ steps.<id>.outcome == 'success' }}`:
  - Medusa (`medusa-smoke`, `medusa-order-races`, `medusa-cancel-extras`): `-p qa-harness-medusa -f medusa.compose.yml`, run in
    the harness docker directory.
  - Cal (`cal-smoke`, `cal-state-races`): `-p qa-harness-cal` with the fork's `packages/prisma/docker-compose.yml` and the harness
    `cal.compose.yml`, run in the fork's `packages/prisma` directory.
  - Documenso (`documenso-smoke`): `-p qa-harness-documenso -f documenso.compose.yml`.
- **`twenty-smoke`:** the inline loop is replaced by the script. Kept: the step name, `id: twenty_pull`, the `if:` on harness up,
  and the `always()` guard on log capture. Its cap is now 6 min (was 14).
- **Save cache steps:** `medusa-smoke` pnpm and Medusa build saves have `timeout-minutes: 2`. Cal's three saves and Documenso's build
  save have `timeout-minutes: 5`. All keep `continue-on-error: true`, so a timeout costs only a cache miss.
- **Downstream behaviour:** a failed pull makes the job red and skips harness up and every step that checks `*_up.outcome`. The
  `always()` stop and log steps and the `!cancelled()` job summary still run. Each harness `down` exits 0 with nothing running (§3.3).

## 5. Budget (O5: worst-case values, not middle ones)

**Correction to Task 6.** The Task 6 budget (plan `docs/plans/2026-10-23-p6-phase2-task6-twenty-stack.md` §8.3) used the measured
pull time (34 s), not the 14-minute pull cap, so its 11.8-minute margin was overstated. This PR corrects it: every pull step is capped
at 6 min, and the Task 6 figures are not reused.

Each job's worst case is the sum, over its steps, of the largest duration observed for that step in the last eight runs (successful
steps only). Pull steps count their cap (6 min). Save cache steps count their cap, and they have never been observed to run.

**Decisions applied (owner):** M1, Medusa's two Save caps at 2 min. T1, per-try timeout 100 s for every job, so each pull step is 6 min.
Option G (the 120 s value) is superseded.

### 5.1 Per job (after this PR)

| Job                    | Job timeout (min) | Worst case (min) | Margin (min) | Result |
| ---------------------- | ----------------- | ---------------- | ------------ | ------ |
| `medusa-smoke`         | 45                | 30.47            | 14.53        | OK     |
| `medusa-order-races`   | 45                | 22.57            | 22.43        | OK     |
| `medusa-cancel-extras` | 30                | 10.67            | 19.33        | OK     |
| `cal-smoke`            | 60                | 27.08            | 32.92        | OK     |
| `cal-state-races`      | 85                | 16.77            | 68.23        | OK     |
| `documenso-smoke`      | 45                | 17.38            | 27.62        | OK     |
| `twenty-smoke`         | 20                | 9.08             | 10.92        | OK     |

Every job has at least 10 min of margin. The tightest is `twenty-smoke` at 10.92 min. The job timeouts are unchanged.

### 5.2 Steps per job

#### `medusa-smoke` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.03             | max observed (7 runs)     |
| Checkout Medusa fork                                                 | —         | 0.02             | max observed (7 runs)     |
| Verify Medusa fork HEAD                                              | —         | 0.00             | max observed (7 runs)     |
| Stub harness product roots                                           | —         | 0.00             | max observed (7 runs)     |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.05             | max observed (7 runs)     |
| Install P6 dependencies                                              | —         | 0.12             | max observed (7 runs)     |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —         | 0.03             | max observed (7 runs)     |
| Check (format, actionlint, typecheck, k6 inspect, unit tests)        | —         | 0.27             | max observed (7 runs)     |
| Enable pnpm via corepack                                             | —         | 0.03             | max observed (7 runs)     |
| Restore pnpm store cache                                             | —         | 0.18             | max observed (7 runs)     |
| Install Medusa dependencies                                          | —         | 0.10             | max observed (7 runs)     |
| Restore Medusa build cache                                           | —         | 0.03             | max observed (7 runs)     |
| Generate the CI admin password                                       | —         | 0.00             | max observed (7 runs)     |
| Pull Medusa images (3 tries, 15 s then 30 s)                         | 6         | 6.00             | pull cap                  |
| Start Medusa (harness up)                                            | —         | 0.63             | max observed (7 runs)     |
| k6 smoke (GET /health)                                               | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs)    |
| Race medusa (P6-MED-RACE-001, money, order-state, extras)            | —         | 18.85            | max observed (7 runs)     |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs)    |
| Stop Medusa (harness down)                                           | —         | 0.02             | max observed (7 runs)     |
| Save pnpm store cache                                                | 2         | 2.00             | save cap (never observed) |
| Save Medusa build cache                                              | 2         | 2.00             | save cap (never observed) |
| **Total**                                                            |           | **30.47**        | margin **14.53**          |

#### `medusa-order-races` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.03             | max observed (8 runs)  |
| Checkout Medusa fork                                                 | —         | 0.02             | max observed (8 runs)  |
| Verify Medusa fork HEAD                                              | —         | 0.02             | max observed (8 runs)  |
| Stub harness product roots                                           | —         | 0.02             | max observed (8 runs)  |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.05             | max observed (8 runs)  |
| Install P6 dependencies                                              | —         | 0.13             | max observed (8 runs)  |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —         | 0.03             | max observed (8 runs)  |
| Enable pnpm via corepack                                             | —         | 0.03             | max observed (8 runs)  |
| Restore pnpm store cache                                             | —         | 0.15             | max observed (8 runs)  |
| Install Medusa dependencies                                          | —         | 0.20             | max observed (8 runs)  |
| Restore Medusa build cache                                           | —         | 0.05             | max observed (8 runs)  |
| Generate the CI admin password                                       | —         | 0.00             | max observed (8 runs)  |
| Pull Medusa images (3 tries, 15 s then 30 s)                         | 6         | 6.00             | pull cap               |
| Start Medusa (harness up)                                            | —         | 0.90             | max observed (8 runs)  |
| k6 smoke (GET /health)                                               | —         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Race medusa budget (P6-MED-RACE-005, -012)                           | —         | 14.82            | max observed (8 runs)  |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Stop Medusa (harness down)                                           | —         | 0.02             | max observed (8 runs)  |
| **Total**                                                            |           | **22.57**        | margin **22.43**       |

#### `medusa-cancel-extras` (job timeout 30 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.02             | max observed (8 runs)  |
| Checkout Medusa fork                                                 | —         | 0.02             | max observed (8 runs)  |
| Verify Medusa fork HEAD                                              | —         | 0.00             | max observed (8 runs)  |
| Stub harness product roots                                           | —         | 0.02             | max observed (8 runs)  |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.05             | max observed (8 runs)  |
| Install P6 dependencies                                              | 10        | 0.13             | max observed (8 runs)  |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —         | 0.02             | max observed (8 runs)  |
| Enable pnpm via corepack                                             | —         | 0.03             | max observed (8 runs)  |
| Restore pnpm store cache                                             | —         | 0.18             | max observed (8 runs)  |
| Install Medusa dependencies                                          | 15        | 0.17             | max observed (8 runs)  |
| Restore Medusa build cache                                           | —         | 0.03             | max observed (8 runs)  |
| Generate the CI admin password                                       | —         | 0.00             | max observed (8 runs)  |
| Pull Medusa images (3 tries, 15 s then 30 s)                         | 6         | 6.00             | pull cap               |
| Start Medusa (harness up)                                            | 10        | 0.73             | max observed (8 runs)  |
| k6 smoke (GET /health)                                               | 5         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Race medusa cancel extras (P6-MED-RACE-013, -014)                    | —         | 3.17             | max observed (8 runs)  |
| Job summary (Playwright results, race table)                         | 5         | 0.00             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Stop Medusa (harness down)                                           | 5         | 0.02             | max observed (8 runs)  |
| **Total**                                                            |           | **10.67**        | margin **19.33**       |

#### `cal-smoke` (job timeout 60 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.03             | max observed (7 runs)     |
| Checkout Cal fork                                                    | —         | 0.12             | max observed (7 runs)     |
| Verify Cal fork HEAD                                                 | —         | 0.02             | max observed (7 runs)     |
| Verify CAL_REF matches bootstrap.sh                                  | —         | 0.00             | max observed (7 runs)     |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.08             | max observed (7 runs)     |
| Install P6 dependencies                                              | —         | 0.12             | max observed (7 runs)     |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —         | 0.03             | max observed (7 runs)     |
| Enable corepack                                                      | —         | 0.02             | max observed (7 runs)     |
| Restore Cal Yarn cache                                               | —         | 0.27             | max observed (7 runs)     |
| Restore Cal node_modules cache                                       | —         | 0.68             | max observed (7 runs)     |
| Install Cal dependencies                                             | —         | 1.47             | max observed (7 runs)     |
| Generate Cal Prisma client                                           | —         | 0.13             | max observed (7 runs)     |
| Prepare Cal product .env and harness roots                           | —         | 0.00             | max observed (7 runs)     |
| Restore Cal build cache                                              | —         | 0.08             | max observed (7 runs)     |
| Pull Cal images (3 tries, 15 s then 30 s)                            | 6         | 6.00             | pull cap                  |
| Start Cal (harness up)                                               | —         | 1.33             | max observed (7 runs)     |
| k6 smoke (GET /pro/30min)                                            | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (21 runs)    |
| Race self-test (cal-race, 3 trials)                                  | —         | 0.20             | max observed (7 runs)     |
| Race P6-CAL-RACE-001 (cal-race)                                      | —         | 1.07             | max observed (7 runs)     |
| Race P6-CAL-RACE-003 (cal-race)                                      | —         | 0.23             | max observed (7 runs)     |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (21 runs)    |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (21 runs)    |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (21 runs)    |
| Stop Cal (harness down)                                              | —         | 0.03             | max observed (7 runs)     |
| Save Cal Yarn cache                                                  | 5         | 5.00             | save cap (never observed) |
| Save Cal node_modules cache                                          | 5         | 5.00             | save cap (never observed) |
| Save Cal build cache                                                 | 5         | 5.00             | save cap (never observed) |
| **Total**                                                            |           | **27.08**        | margin **32.92**          |

#### `cal-state-races` (job timeout 85 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.02             | max observed (7 runs)  |
| Checkout Cal fork                                                    | —         | 0.07             | max observed (7 runs)  |
| Verify Cal fork HEAD                                                 | —         | 0.02             | max observed (7 runs)  |
| Verify CAL_REF matches bootstrap.sh                                  | —         | 0.00             | max observed (7 runs)  |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.08             | max observed (7 runs)  |
| Install P6 dependencies                                              | —         | 0.13             | max observed (7 runs)  |
| Enable corepack                                                      | —         | 0.02             | max observed (7 runs)  |
| Restore Cal Yarn cache                                               | —         | 0.13             | max observed (7 runs)  |
| Restore Cal node_modules cache                                       | —         | 0.53             | max observed (7 runs)  |
| Install Cal dependencies                                             | —         | 1.37             | max observed (7 runs)  |
| Generate Cal Prisma client                                           | —         | 0.13             | max observed (7 runs)  |
| Prepare Cal product .env and harness roots                           | —         | 0.00             | max observed (7 runs)  |
| Restore Cal build cache                                              | —         | 0.05             | max observed (7 runs)  |
| Map the webhook host                                                 | —         | 0.00             | max observed (7 runs)  |
| Pull Cal images (3 tries, 15 s then 30 s)                            | 6         | 6.00             | pull cap               |
| Start Cal (harness up)                                               | —         | 1.42             | max observed (7 runs)  |
| Race P6-CAL-RACE-006 (cal-race)                                      | —         | 1.83             | max observed (7 runs)  |
| Race P6-CAL-RACE-008 (cal-race)                                      | —         | 1.75             | max observed (7 runs)  |
| Race P6-CAL-RACE-007 (cal-race)                                      | —         | 1.55             | max observed (7 runs)  |
| Race P6-CAL-RACE-009 (cal-race)                                      | —         | 1.53             | max observed (7 runs)  |
| Stop Cal (harness down)                                              | —         | 0.03             | max observed (7 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| **Total**                                                            |           | **16.77**        | margin **68.23**       |

#### `documenso-smoke` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —         | 0.03             | max observed (8 runs)     |
| Checkout Documenso fork                                              | —         | 0.08             | max observed (8 runs)     |
| Verify Documenso fork HEAD                                           | —         | 0.00             | max observed (8 runs)     |
| Verify DOCUMENSO_REF matches bootstrap.sh                            | —         | 0.00             | max observed (8 runs)     |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —         | 0.20             | max observed (8 runs)     |
| Install P6 dependencies                                              | —         | 0.13             | max observed (8 runs)     |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —         | 0.02             | max observed (8 runs)     |
| Install Documenso dependencies                                       | —         | 0.98             | max observed (8 runs)     |
| Prepare harness roots                                                | —         | 0.02             | max observed (8 runs)     |
| Map the webhook host                                                 | —         | 0.02             | max observed (8 runs)     |
| Restore Documenso build cache                                        | —         | 0.05             | max observed (8 runs)     |
| Pull Documenso images (3 tries, 15 s then 30 s)                      | 6         | 6.00             | pull cap                  |
| Start Documenso (harness up)                                         | —         | 0.98             | max observed (8 runs)     |
| k6 smoke (GET /signin, /api/auth/csrf)                               | —         | 0.02             | max observed (8 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (24 runs)    |
| Documenso races (documenso-race)                                     | —         | 3.67             | max observed (8 runs)     |
| Documenso sign-in error contract (documenso-api)                     | 5         | 0.05             | max observed (8 runs)     |
| Check Documenso artefacts for tokens                                 | —         | 0.00             | max observed (8 runs)     |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (8 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (24 runs)    |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (24 runs)    |
| Stop Documenso (harness down)                                        | —         | 0.02             | max observed (8 runs)     |
| Save Documenso build cache                                           | 5         | 5.00             | save cap (never observed) |
| **Total**                                                            |           | **17.38**        | margin **27.62**          |

#### `twenty-smoke` (job timeout 20 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                 |
| -------------------------------------------------------------------- | --------- | ---------------- | --------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | 5         | 0.02             | max observed (3 runs) |
| Verify TWENTY_REF matches bootstrap.sh                               | 2         | 0.00             | max observed (3 runs) |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | 5         | 0.02             | max observed (3 runs) |
| Install P6 dependencies                                              | 10        | 0.10             | max observed (3 runs) |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | 5         | 0.02             | max observed (3 runs) |
| Prepare harness roots (Twenty fork at TWENTY_REF)                    | 10        | 0.20             | max observed (3 runs) |
| Pull Twenty images (3 tries, 15 s then 30 s)                         | 6         | 6.00             | pull cap              |
| Start Twenty (harness up)                                            | 12        | 1.72             | max observed (3 runs) |
| Seed Twenty (harness seed)                                           | 10        | 0.83             | max observed (3 runs) |
| k6 smoke (GET /healthz)                                              | 3         | 0.00             | max observed (3 runs) |
| Twenty self-test (twenty-race)                                       | 5         | 0.07             | max observed (3 runs) |
| Capture container logs (before the scan and the down)                | 2         | 0.02             | max observed (3 runs) |
| Check Twenty artefacts for tokens (values, not names)                | 3         | 0.00             | max observed (3 runs) |
| Job summary (Playwright results, race table)                         | 2         | 0.00             | max observed (3 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 5         | 0.03             | max observed (6 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 5         | 0.03             | max observed (6 runs) |
| Stop Twenty (harness down, volumes removed)                          | 5         | 0.03             | max observed (3 runs) |
| **Total**                                                            |           | **9.08**         | margin **10.92**      |

## 6. Follow-ups (not in this PR)

Older steps with no `timeout-minutes` (the owner's rule: list them, do not fix them here):

- medusa-smoke: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- medusa-smoke: Checkout Medusa fork
- medusa-smoke: Verify Medusa fork HEAD
- medusa-smoke: Stub harness product roots
- medusa-smoke: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- medusa-smoke: Install P6 dependencies
- medusa-smoke: Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1
- medusa-smoke: Check (format, actionlint, typecheck, k6 inspect, unit tests)
- medusa-smoke: Enable pnpm via corepack
- medusa-smoke: Restore pnpm store cache
- medusa-smoke: Install Medusa dependencies
- medusa-smoke: Restore Medusa build cache
- medusa-smoke: Generate the CI admin password
- medusa-smoke: Start Medusa (harness up)
- medusa-smoke: k6 smoke (GET /health)
- medusa-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- medusa-smoke: Race medusa (P6-MED-RACE-001, money, order-state, extras)
- medusa-smoke: Job summary (Playwright results, race table)
- medusa-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- medusa-smoke: Stop Medusa (harness down)
- medusa-order-races: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- medusa-order-races: Checkout Medusa fork
- medusa-order-races: Verify Medusa fork HEAD
- medusa-order-races: Stub harness product roots
- medusa-order-races: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- medusa-order-races: Install P6 dependencies
- medusa-order-races: Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1
- medusa-order-races: Enable pnpm via corepack
- medusa-order-races: Restore pnpm store cache
- medusa-order-races: Install Medusa dependencies
- medusa-order-races: Restore Medusa build cache
- medusa-order-races: Generate the CI admin password
- medusa-order-races: Start Medusa (harness up)
- medusa-order-races: k6 smoke (GET /health)
- medusa-order-races: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- medusa-order-races: Race medusa budget (P6-MED-RACE-005, -012)
- medusa-order-races: Job summary (Playwright results, race table)
- medusa-order-races: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- medusa-order-races: Stop Medusa (harness down)
- medusa-cancel-extras: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- medusa-cancel-extras: Checkout Medusa fork
- medusa-cancel-extras: Verify Medusa fork HEAD
- medusa-cancel-extras: Stub harness product roots
- medusa-cancel-extras: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- medusa-cancel-extras: Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1
- medusa-cancel-extras: Enable pnpm via corepack
- medusa-cancel-extras: Restore pnpm store cache
- medusa-cancel-extras: Restore Medusa build cache
- medusa-cancel-extras: Generate the CI admin password
- medusa-cancel-extras: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- medusa-cancel-extras: Race medusa cancel extras (P6-MED-RACE-013, -014)
- medusa-cancel-extras: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-smoke: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- cal-smoke: Checkout Cal fork
- cal-smoke: Verify Cal fork HEAD
- cal-smoke: Verify CAL_REF matches bootstrap.sh
- cal-smoke: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- cal-smoke: Install P6 dependencies
- cal-smoke: Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1
- cal-smoke: Enable corepack
- cal-smoke: Restore Cal Yarn cache
- cal-smoke: Restore Cal node_modules cache
- cal-smoke: Install Cal dependencies
- cal-smoke: Generate Cal Prisma client
- cal-smoke: Prepare Cal product .env and harness roots
- cal-smoke: Restore Cal build cache
- cal-smoke: Start Cal (harness up)
- cal-smoke: k6 smoke (GET /pro/30min)
- cal-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-smoke: Race self-test (cal-race, 3 trials)
- cal-smoke: Race P6-CAL-RACE-001 (cal-race)
- cal-smoke: Race P6-CAL-RACE-003 (cal-race)
- cal-smoke: Job summary (Playwright results, race table)
- cal-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-smoke: Stop Cal (harness down)
- cal-state-races: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- cal-state-races: Checkout Cal fork
- cal-state-races: Verify Cal fork HEAD
- cal-state-races: Verify CAL_REF matches bootstrap.sh
- cal-state-races: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- cal-state-races: Install P6 dependencies
- cal-state-races: Enable corepack
- cal-state-races: Restore Cal Yarn cache
- cal-state-races: Restore Cal node_modules cache
- cal-state-races: Install Cal dependencies
- cal-state-races: Generate Cal Prisma client
- cal-state-races: Prepare Cal product .env and harness roots
- cal-state-races: Restore Cal build cache
- cal-state-races: Map the webhook host
- cal-state-races: Start Cal (harness up)
- cal-state-races: Race P6-CAL-RACE-006 (cal-race)
- cal-state-races: Race P6-CAL-RACE-008 (cal-race)
- cal-state-races: Race P6-CAL-RACE-007 (cal-race)
- cal-state-races: Race P6-CAL-RACE-009 (cal-race)
- cal-state-races: Stop Cal (harness down)
- cal-state-races: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-state-races: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- cal-state-races: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- documenso-smoke: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
- documenso-smoke: Checkout Documenso fork
- documenso-smoke: Verify Documenso fork HEAD
- documenso-smoke: Verify DOCUMENSO_REF matches bootstrap.sh
- documenso-smoke: Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
- documenso-smoke: Install P6 dependencies
- documenso-smoke: Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1
- documenso-smoke: Install Documenso dependencies
- documenso-smoke: Prepare harness roots
- documenso-smoke: Map the webhook host
- documenso-smoke: Restore Documenso build cache
- documenso-smoke: Start Documenso (harness up)
- documenso-smoke: k6 smoke (GET /signin, /api/auth/csrf)
- documenso-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- documenso-smoke: Documenso races (documenso-race)
- documenso-smoke: Check Documenso artefacts for tokens
- documenso-smoke: Job summary (Playwright results, race table)
- documenso-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- documenso-smoke: Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- documenso-smoke: Stop Documenso (harness down)

## 7. Verify

- `npm run check` (format, actionlint, typecheck, k6 inspect, unit tests) on the PR head: see the PR.
- `shellcheck scripts/ci/compose-pull.sh` exits 0.
- The script's local runs (100 s per try) and failure path are in §3.
- CI: the first run's pull step time per job is recorded in the PR, not here.

## 8. Backlog

X5 in [BACKLOG.md](../BACKLOG.md) stays open until the decision and the PR. It is not marked done.
