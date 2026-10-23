# P6 X5: retry image pulls before harness up in every job

Backlog item X5 ([BACKLOG.md](../BACKLOG.md), from the Task 6 plan §12). Branch `ci/2026-10-23-p6-pull-retry` from `origin/main`
at `38533b0`.

**Status: stopped at the budget gate, again.** Under option G (7-min pull cap) `medusa-smoke` and `twenty-smoke` miss the 10-minute
margin (§5.3). The owner's rule is to stop, list the options and escalate, not to pick one. So this branch holds the shared
script and this plan. **No workflow file is changed yet**, and no PR is open. The per-job changes in §4 wait for the decision.

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
are never retried. Each try is capped at 120 s (named constant `per_try_seconds`).

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

# Worst CI pull measured 66 s (twenty-smoke, PR #44 head 4672b4d); 120 s per try leaves room above it.
per_try_seconds=120
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

## 4. Changes (after the decision in §5)

- **`twenty-smoke`:** replace the inline loop with the script. Keep the step name, `id: twenty_pull`, `timeout-minutes: 14`, the
  `if:` on harness up and the `always()` guard on log capture.
- **Six jobs:** add `Pull <Product> images (3 tries, 15 s then 30 s)` with an `id` and `timeout-minutes: 14`, just before harness
  up. Gate harness up with `if: ${{ steps.<id>.outcome == 'success' }}`. Example for `cal-smoke`:

```yaml
      - name: Pull Cal images (3 tries, 15 s then 30 s)
        id: cal_pull
        timeout-minutes: 14
        working-directory: ${{ env.PRODUCTS_ROOT }}/cal/packages/prisma
        run: |
          set -euo pipefail
          bash "${{ github.workspace }}/p6/scripts/ci/compose-pull.sh" -p qa-harness-cal \
            -f "${{ env.PRODUCTS_ROOT }}/cal/packages/prisma/docker-compose.yml" \
            -f "${{ github.workspace }}/p6/node_modules/qa-portfolio-harness/docker/cal.compose.yml"

      - name: Start Cal (harness up)
        id: cal_up
        if: ${{ steps.cal_pull.outcome == 'success' }}
        ...
```

- **Downstream behaviour (read from the workflow; not yet run in CI):** a failed pull makes the job red and skips harness up and
  every step that tests `*_up.outcome`. The `always()` steps (stop and log upload) and the `!cancelled()` job summary still run.
  The stop step runs `down`, which exits 0 with nothing running (§3.3).

## 5. Budget (O5: worst-case values, not middle ones)

Task 6's budget (plan `docs/plans/2026-10-23-p6-phase2-task6-twenty-stack.md` §8.3) used the measured pull time (34 s), not the
14-minute pull cap, so its 11.8-min margin was overstated. This PR corrects the budget: every pull step is capped at 7 min, and
the Task 6 figures are not reused. Under the corrected budget `twenty-smoke` is at 9.92 min, below the margin (see §5.3).

Option G (owner decision): per-try timeout 120 s, 3 tries, 15 s and 30 s backoff, so each pull step is capped at **7 min**
(3 × 120 s + 45 s = 6.75 min). Each `Save … cache` step gets `timeout-minutes: 5` in this PR and counts 5 min. Every other step counts
its largest observed duration in the last eight runs (successful steps only).

### 5.1 Per job

| Job                    | Job timeout (min) | Worst case (min) | Margin (min) | Result   |
| ---------------------- | ----------------- | ---------------- | ------------ | -------- |
| `medusa-smoke`         | 45                | 37.47            | 7.53         | **MISS** |
| `medusa-order-races`   | 45                | 23.57            | 21.43        | OK       |
| `medusa-cancel-extras` | 30                | 11.67            | 18.33        | OK       |
| `cal-smoke`            | 60                | 28.08            | 31.92        | OK       |
| `cal-state-races`      | 85                | 17.77            | 67.23        | OK       |
| `documenso-smoke`      | 45                | 18.38            | 26.62        | OK       |
| `twenty-smoke`         | 20                | 10.08            | 9.92         | **MISS** |

### 5.2 Steps per job

#### `medusa-smoke` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap                  |
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
| Start Medusa (harness up)                                            | —         | 0.63             | max observed (7 runs)     |
| k6 smoke (GET /health)                                               | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs)    |
| Race medusa (P6-MED-RACE-001, money, order-state, extras)            | —         | 18.85            | max observed (7 runs)     |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (7 runs)     |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs)    |
| Stop Medusa (harness down)                                           | —         | 0.02             | max observed (7 runs)     |
| Save pnpm store cache                                                | 5         | 5.00             | save cap (never observed) |
| Save Medusa build cache                                              | 5         | 5.00             | save cap (never observed) |
| **Total**                                                            |           | **37.47**        | margin **7.53**           |

#### `medusa-order-races` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap               |
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
| Start Medusa (harness up)                                            | —         | 0.90             | max observed (8 runs)  |
| k6 smoke (GET /health)                                               | —         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Race medusa budget (P6-MED-RACE-005, -012)                           | —         | 14.82            | max observed (8 runs)  |
| Job summary (Playwright results, race table)                         | —         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Stop Medusa (harness down)                                           | —         | 0.02             | max observed (8 runs)  |
| **Total**                                                            |           | **23.57**        | margin **21.43**       |

#### `medusa-cancel-extras` (job timeout 30 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap               |
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
| Start Medusa (harness up)                                            | 10        | 0.73             | max observed (8 runs)  |
| k6 smoke (GET /health)                                               | 5         | 0.02             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Race medusa cancel extras (P6-MED-RACE-013, -014)                    | —         | 3.17             | max observed (8 runs)  |
| Job summary (Playwright results, race table)                         | 5         | 0.00             | max observed (8 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (16 runs) |
| Stop Medusa (harness down)                                           | 5         | 0.02             | max observed (8 runs)  |
| **Total**                                                            |           | **11.67**        | margin **18.33**       |

#### `cal-smoke` (job timeout 60 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap                  |
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
| **Total**                                                            |           | **28.08**        | margin **31.92**          |

#### `cal-state-races` (job timeout 85 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                  |
| -------------------------------------------------------------------- | --------- | ---------------- | ---------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap               |
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
| Start Cal (harness up)                                               | —         | 1.42             | max observed (7 runs)  |
| Race P6-CAL-RACE-006 (cal-race)                                      | —         | 1.83             | max observed (7 runs)  |
| Race P6-CAL-RACE-008 (cal-race)                                      | —         | 1.75             | max observed (7 runs)  |
| Race P6-CAL-RACE-007 (cal-race)                                      | —         | 1.55             | max observed (7 runs)  |
| Race P6-CAL-RACE-009 (cal-race)                                      | —         | 1.53             | max observed (7 runs)  |
| Stop Cal (harness down)                                              | —         | 0.03             | max observed (7 runs)  |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —         | 0.03             | max observed (14 runs) |
| **Total**                                                            |           | **17.77**        | margin **67.23**       |

#### `documenso-smoke` (job timeout 45 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                     |
| -------------------------------------------------------------------- | --------- | ---------------- | ------------------------- |
| (new) Pull images                                                    | 7         | 7.00             | pull cap                  |
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
| **Total**                                                            |           | **18.38**        | margin **26.62**          |

#### `twenty-smoke` (job timeout 20 min)

| Step                                                                 | Cap (min) | Worst used (min) | Basis                 |
| -------------------------------------------------------------------- | --------- | ---------------- | --------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | 5         | 0.02             | max observed (3 runs) |
| Verify TWENTY_REF matches bootstrap.sh                               | 2         | 0.00             | max observed (3 runs) |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | 5         | 0.02             | max observed (3 runs) |
| Install P6 dependencies                                              | 10        | 0.10             | max observed (3 runs) |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | 5         | 0.02             | max observed (3 runs) |
| Prepare harness roots (Twenty fork at TWENTY_REF)                    | 10        | 0.20             | max observed (3 runs) |
| Pull Twenty images (3 tries, 15 s then 30 s)                         | 7         | 7.00             | pull cap              |
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
| **Total**                                                            |           | **10.08**        | margin **9.92**       |

### 5.3 Two jobs miss the margin (stop; owner decision needed)

Two jobs are below the 10-minute margin with option G. The owner's rule says to stop and escalate. Nothing in the workflow has been
changed, and no PR is open.

- **`medusa-smoke`: margin 7.53 min.** Its two `Save` cache steps count 5 min each (10 min together), which is most of the gap.
  Its race step (18.85 min observed) is the other large part.
  - _Option M1:_ cap the two Medusa save steps at 2 min each. Margin becomes 13.53 min. Tradeoff: a save that really takes more than
    2 min is cut. The step is `continue-on-error`, so the cost is a cache miss on the next run, not a red job.
  - _Option M2:_ keep 5 min and accept 7.53 min. Breaks the margin rule.
  - Not allowed by the rule: raising `medusa-smoke` above 45 min.
- **`twenty-smoke`: margin 9.92 min (short by about 5 s).** Its non-pull work is 3.08 min, and the pull is 7 min.
  - _Option T1:_ per-try timeout 100 s instead of 120 s (3 × 100 s + 45 s = 5.75 min, so the step cap is 6). Margin becomes 10.92 min.
    Tradeoff: a pull slower than 100 s is cut. The slowest measured CI pull was 66 s, so the headroom is about 1.5 times.
    This changes the per-try value the owner just set.
  - _Option T2:_ keep 120 s and 7 min and accept 9.92 min. Breaks the margin rule by 5 s.

Neither of these can be decided here. The owner picks T1 or T2, and M1 or M2.

## 6. Follow-ups (not in this PR)

Older steps with no `timeout-minutes` (from the workflow, listed for the follow-up PR, per the owner's rule):

- `medusa-smoke`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Medusa fork; Verify Medusa fork HEAD; Stub harness product roots; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Install P6 dependencies; Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1; Check (format, actionlint, typecheck, k6 inspect, unit tests); Enable pnpm via corepack; Restore pnpm store cache; Install Medusa dependencies; Restore Medusa build cache; Generate the CI admin password; Start Medusa (harness up); k6 smoke (GET /health); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Job summary (Playwright results, race table); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Stop Medusa (harness down); Save pnpm store cache; Save Medusa build cache
- `medusa-order-races`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Medusa fork; Verify Medusa fork HEAD; Stub harness product roots; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Install P6 dependencies; Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1; Enable pnpm via corepack; Restore pnpm store cache; Install Medusa dependencies; Restore Medusa build cache; Generate the CI admin password; Start Medusa (harness up); k6 smoke (GET /health); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Job summary (Playwright results, race table); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Stop Medusa (harness down)
- `medusa-cancel-extras`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Medusa fork; Verify Medusa fork HEAD; Stub harness product roots; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1; Enable pnpm via corepack; Restore pnpm store cache; Restore Medusa build cache; Generate the CI admin password; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- `cal-smoke`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Cal fork; Verify Cal fork HEAD; Verify CAL_REF matches bootstrap.sh; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Install P6 dependencies; Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1; Enable corepack; Restore Cal Yarn cache; Restore Cal node_modules cache; Install Cal dependencies; Generate Cal Prisma client; Prepare Cal product .env and harness roots; Restore Cal build cache; Start Cal (harness up); k6 smoke (GET /pro/30min); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Race self-test (cal-race, 3 trials); Job summary (Playwright results, race table); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Stop Cal (harness down); Save Cal Yarn cache; Save Cal node_modules cache; Save Cal build cache
- `cal-state-races`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Cal fork; Verify Cal fork HEAD; Verify CAL_REF matches bootstrap.sh; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Install P6 dependencies; Enable corepack; Restore Cal Yarn cache; Restore Cal node_modules cache; Install Cal dependencies; Generate Cal Prisma client; Prepare Cal product .env and harness roots; Restore Cal build cache; Map the webhook host; Start Cal (harness up); Stop Cal (harness down); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
- `documenso-smoke`: Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1; Checkout Documenso fork; Verify Documenso fork HEAD; Verify DOCUMENSO_REF matches bootstrap.sh; Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1; Install P6 dependencies; Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1; Install Documenso dependencies; Prepare harness roots; Map the webhook host; Restore Documenso build cache; Start Documenso (harness up); k6 smoke (GET /signin, /api/auth/csrf); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Check Documenso artefacts for tokens; Job summary (Playwright results, race table); Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9; Stop Documenso (harness down); Save Documenso build cache

## 7. Verify

- `npm run check` (format, actionlint, typecheck, k6 inspect, unit tests) on this branch, after the script was added.
- The script's local runs and failure path are in §3.
- No CI run exists for this branch yet. The first run comes after the decision and the workflow change.

## 8. Backlog

X5 in [BACKLOG.md](../BACKLOG.md) stays open until the decision and the PR. It is not marked done.
