# P6 X5: retry image pulls before harness up in every job

Backlog item X5 ([BACKLOG.md](../BACKLOG.md), from the Task 6 plan §12). Branch `ci/2026-10-23-p6-pull-retry` from `origin/main`
at `38533b0`.

**Status: stopped at the budget gate.** `twenty-smoke` misses the 10-minute margin once its pull step is counted at the
14-minute cap (§5). The owner's rule is to stop, list the options and escalate, not to pick one. So this branch holds the shared
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
are never retried. Each try is capped at 240 s.

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

max_tries=3
for attempt in 1 2 3; do
  if timeout 240 "${compose[@]}" pull --ignore-buildable; then
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

Each job's worst case is the sum, over its steps, of the **largest duration observed** for that step in the last eight runs
(successful steps only), with the new pull step at its **14-minute cap**. The `Save … cache` steps were skipped in every observed
run, so they have never been timed. Their rows are marked, and the margins for those jobs are not reliable until they run.

### 5.1 Per job

| Job                    | Job timeout | Worst case (min) | Margin (min) | Result   | Uncapped steps with no sample                                          |
| ---------------------- | ----------- | ---------------- | ------------ | -------- | ---------------------------------------------------------------------- |
| `medusa-smoke`         | 45          | 34.47            | 10.53        | OK       | Save pnpm store cache, Save Medusa build cache                         |
| `medusa-order-races`   | 45          | 30.57            | 14.43        | OK       | none                                                                   |
| `medusa-cancel-extras` | 30          | 18.67            | 11.33        | OK       | none                                                                   |
| `cal-smoke`            | 60          | 20.08            | 39.92        | OK       | Save Cal Yarn cache, Save Cal node_modules cache, Save Cal build cache |
| `cal-state-races`      | 85          | 24.77            | 60.23        | OK       | none                                                                   |
| `documenso-smoke`      | 45          | 20.38            | 24.62        | OK       | Save Documenso build cache                                             |
| `twenty-smoke`         | 20          | 17.08            | 2.92         | **MISS** | none                                                                   |

### 5.2 Steps per job

### `medusa-smoke` (job timeout 45 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.03                   | max of 7             |
| Checkout Medusa fork                                                 | —                       | 0.02                   | max of 7             |
| Verify Medusa fork HEAD                                              | —                       | 0.00                   | max of 7             |
| Stub harness product roots                                           | —                       | 0.00                   | max of 7             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.05                   | max of 7             |
| Install P6 dependencies                                              | —                       | 0.12                   | max of 7             |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —                       | 0.03                   | max of 7             |
| Check (format, actionlint, typecheck, k6 inspect, unit tests)        | —                       | 0.27                   | max of 7             |
| Enable pnpm via corepack                                             | —                       | 0.03                   | max of 7             |
| Restore pnpm store cache                                             | —                       | 0.18                   | max of 7             |
| Install Medusa dependencies                                          | —                       | 0.10                   | max of 7             |
| Restore Medusa build cache                                           | —                       | 0.03                   | max of 7             |
| Generate the CI admin password                                       | —                       | 0.00                   | max of 7             |
| Start Medusa (harness up)                                            | —                       | 0.63                   | max of 7             |
| k6 smoke (GET /health)                                               | —                       | 0.02                   | max of 7             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 14            |
| Race medusa (P6-MED-RACE-001, money, order-state, extras)            | —                       | 18.85                  | max of 7             |
| Job summary (Playwright results, race table)                         | —                       | 0.02                   | max of 7             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 14            |
| Stop Medusa (harness down)                                           | —                       | 0.02                   | max of 7             |
| Save pnpm store cache                                                | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| Save Medusa build cache                                              | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **34.47**              | margin **10.53** min |

### `medusa-order-races` (job timeout 45 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.03                   | max of 8             |
| Checkout Medusa fork                                                 | —                       | 0.02                   | max of 8             |
| Verify Medusa fork HEAD                                              | —                       | 0.02                   | max of 8             |
| Stub harness product roots                                           | —                       | 0.02                   | max of 8             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.05                   | max of 8             |
| Install P6 dependencies                                              | —                       | 0.13                   | max of 8             |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —                       | 0.03                   | max of 8             |
| Enable pnpm via corepack                                             | —                       | 0.03                   | max of 8             |
| Restore pnpm store cache                                             | —                       | 0.15                   | max of 8             |
| Install Medusa dependencies                                          | —                       | 0.20                   | max of 8             |
| Restore Medusa build cache                                           | —                       | 0.05                   | max of 8             |
| Generate the CI admin password                                       | —                       | 0.00                   | max of 8             |
| Start Medusa (harness up)                                            | —                       | 0.90                   | max of 8             |
| k6 smoke (GET /health)                                               | —                       | 0.02                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 16            |
| Race medusa budget (P6-MED-RACE-005, -012)                           | —                       | 14.82                  | max of 8             |
| Job summary (Playwright results, race table)                         | —                       | 0.02                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 16            |
| Stop Medusa (harness down)                                           | —                       | 0.02                   | max of 8             |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **30.57**              | margin **14.43** min |

### `medusa-cancel-extras` (job timeout 30 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.02                   | max of 8             |
| Checkout Medusa fork                                                 | —                       | 0.02                   | max of 8             |
| Verify Medusa fork HEAD                                              | —                       | 0.00                   | max of 8             |
| Stub harness product roots                                           | —                       | 0.02                   | max of 8             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.05                   | max of 8             |
| Install P6 dependencies                                              | 10                      | 0.13                   | max of 8             |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —                       | 0.02                   | max of 8             |
| Enable pnpm via corepack                                             | —                       | 0.03                   | max of 8             |
| Restore pnpm store cache                                             | —                       | 0.18                   | max of 8             |
| Install Medusa dependencies                                          | 15                      | 0.17                   | max of 8             |
| Restore Medusa build cache                                           | —                       | 0.03                   | max of 8             |
| Generate the CI admin password                                       | —                       | 0.00                   | max of 8             |
| Start Medusa (harness up)                                            | 10                      | 0.73                   | max of 8             |
| k6 smoke (GET /health)                                               | 5                       | 0.02                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 16            |
| Race medusa cancel extras (P6-MED-RACE-013, -014)                    | —                       | 3.17                   | max of 8             |
| Job summary (Playwright results, race table)                         | 5                       | 0.00                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 16            |
| Stop Medusa (harness down)                                           | 5                       | 0.02                   | max of 8             |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **18.67**              | margin **11.33** min |

### `cal-smoke` (job timeout 60 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.03                   | max of 7             |
| Checkout Cal fork                                                    | —                       | 0.12                   | max of 7             |
| Verify Cal fork HEAD                                                 | —                       | 0.02                   | max of 7             |
| Verify CAL_REF matches bootstrap.sh                                  | —                       | 0.00                   | max of 7             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.08                   | max of 7             |
| Install P6 dependencies                                              | —                       | 0.12                   | max of 7             |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —                       | 0.03                   | max of 7             |
| Enable corepack                                                      | —                       | 0.02                   | max of 7             |
| Restore Cal Yarn cache                                               | —                       | 0.27                   | max of 7             |
| Restore Cal node_modules cache                                       | —                       | 0.68                   | max of 7             |
| Install Cal dependencies                                             | —                       | 1.47                   | max of 7             |
| Generate Cal Prisma client                                           | —                       | 0.13                   | max of 7             |
| Prepare Cal product .env and harness roots                           | —                       | 0.00                   | max of 7             |
| Restore Cal build cache                                              | —                       | 0.08                   | max of 7             |
| Start Cal (harness up)                                               | —                       | 1.33                   | max of 7             |
| k6 smoke (GET /pro/30min)                                            | —                       | 0.02                   | max of 7             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 21            |
| Race self-test (cal-race, 3 trials)                                  | —                       | 0.20                   | max of 7             |
| Race P6-CAL-RACE-001 (cal-race)                                      | —                       | 1.07                   | max of 7             |
| Race P6-CAL-RACE-003 (cal-race)                                      | —                       | 0.23                   | max of 7             |
| Job summary (Playwright results, race table)                         | —                       | 0.02                   | max of 7             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 21            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 21            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 21            |
| Stop Cal (harness down)                                              | —                       | 0.03                   | max of 7             |
| Save Cal Yarn cache                                                  | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| Save Cal node_modules cache                                          | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| Save Cal build cache                                                 | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **20.08**              | margin **39.92** min |

### `cal-state-races` (job timeout 85 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.02                   | max of 7             |
| Checkout Cal fork                                                    | —                       | 0.07                   | max of 7             |
| Verify Cal fork HEAD                                                 | —                       | 0.02                   | max of 7             |
| Verify CAL_REF matches bootstrap.sh                                  | —                       | 0.00                   | max of 7             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.08                   | max of 7             |
| Install P6 dependencies                                              | —                       | 0.13                   | max of 7             |
| Enable corepack                                                      | —                       | 0.02                   | max of 7             |
| Restore Cal Yarn cache                                               | —                       | 0.13                   | max of 7             |
| Restore Cal node_modules cache                                       | —                       | 0.53                   | max of 7             |
| Install Cal dependencies                                             | —                       | 1.37                   | max of 7             |
| Generate Cal Prisma client                                           | —                       | 0.13                   | max of 7             |
| Prepare Cal product .env and harness roots                           | —                       | 0.00                   | max of 7             |
| Restore Cal build cache                                              | —                       | 0.05                   | max of 7             |
| Map the webhook host                                                 | —                       | 0.00                   | max of 7             |
| Start Cal (harness up)                                               | —                       | 1.42                   | max of 7             |
| Race P6-CAL-RACE-006 (cal-race)                                      | —                       | 1.83                   | max of 7             |
| Race P6-CAL-RACE-008 (cal-race)                                      | —                       | 1.75                   | max of 7             |
| Race P6-CAL-RACE-007 (cal-race)                                      | —                       | 1.55                   | max of 7             |
| Race P6-CAL-RACE-009 (cal-race)                                      | —                       | 1.53                   | max of 7             |
| Stop Cal (harness down)                                              | —                       | 0.03                   | max of 7             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 14            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 14            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 14            |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **24.77**              | margin **60.23** min |

### `documenso-smoke` (job timeout 45 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis                |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | —                       | 0.03                   | max of 8             |
| Checkout Documenso fork                                              | —                       | 0.08                   | max of 8             |
| Verify Documenso fork HEAD                                           | —                       | 0.00                   | max of 8             |
| Verify DOCUMENSO_REF matches bootstrap.sh                            | —                       | 0.00                   | max of 8             |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | —                       | 0.20                   | max of 8             |
| Install P6 dependencies                                              | —                       | 0.13                   | max of 8             |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | —                       | 0.02                   | max of 8             |
| Install Documenso dependencies                                       | —                       | 0.98                   | max of 8             |
| Prepare harness roots                                                | —                       | 0.02                   | max of 8             |
| Map the webhook host                                                 | —                       | 0.02                   | max of 8             |
| Restore Documenso build cache                                        | —                       | 0.05                   | max of 8             |
| Start Documenso (harness up)                                         | —                       | 0.98                   | max of 8             |
| k6 smoke (GET /signin, /api/auth/csrf)                               | —                       | 0.02                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 24            |
| Documenso races (documenso-race)                                     | —                       | 3.67                   | max of 8             |
| Documenso sign-in error contract (documenso-api)                     | 5                       | 0.05                   | max of 8             |
| Check Documenso artefacts for tokens                                 | —                       | 0.00                   | max of 8             |
| Job summary (Playwright results, race table)                         | —                       | 0.02                   | max of 8             |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 24            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | —                       | 0.03                   | max of 24            |
| Stop Documenso (harness down)                                        | —                       | 0.02                   | max of 8             |
| Save Documenso build cache                                           | —                       | 0.00                   | NO SAMPLE, NO CAP    |
| (new) Pull images                                                    | 14                      | 14.00                  | pull cap             |
| **Total**                                                            |                         | **20.38**              | margin **24.62** min |

### `twenty-smoke` (job timeout 20 min)

| Step                                                                 | Cap (`timeout-minutes`) | Worst value used (min) | Basis               |
| -------------------------------------------------------------------- | ----------------------- | ---------------------- | ------------------- |
| Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1        | 5                       | 0.02                   | max of 3            |
| Verify TWENTY_REF matches bootstrap.sh                               | 2                       | 0.00                   | max of 3            |
| Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1      | 5                       | 0.02                   | max of 3            |
| Install P6 dependencies                                              | 10                      | 0.10                   | max of 3            |
| Run grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 | 5                       | 0.02                   | max of 3            |
| Prepare harness roots (Twenty fork at TWENTY_REF)                    | 10                      | 0.20                   | max of 3            |
| Pull Twenty images (3 tries, 15 s then 30 s)                         | 14                      | 14.00                  | pull cap            |
| Start Twenty (harness up)                                            | 12                      | 1.72                   | max of 3            |
| Seed Twenty (harness seed)                                           | 10                      | 0.83                   | max of 3            |
| k6 smoke (GET /healthz)                                              | 3                       | 0.00                   | max of 3            |
| Twenty self-test (twenty-race)                                       | 5                       | 0.07                   | max of 3            |
| Capture container logs (before the scan and the down)                | 2                       | 0.02                   | max of 3            |
| Check Twenty artefacts for tokens (values, not names)                | 3                       | 0.00                   | max of 3            |
| Job summary (Playwright results, race table)                         | 2                       | 0.00                   | max of 3            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 5                       | 0.03                   | max of 6            |
| Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 5                       | 0.03                   | max of 6            |
| Stop Twenty (harness down, volumes removed)                          | 5                       | 0.03                   | max of 3            |
| **Total**                                                            |                         | **17.08**              | margin **2.92** min |

### 5.3 The miss: `twenty-smoke` (stop; owner decision needed)

`twenty-smoke` has a 20-minute timeout. Its worst case is 17.08 min, of which 14.00 min is the pull cap. The margin is **2.92 min**
against the 10 minutes O5 requires. The measured main run took 3 min 40 s in total, so the 14-minute cap is what drives the sum.
The job timeout is not raised (O5 forbids it), and the cap is not chosen here.

Options, each with its tradeoff. The numbers come from §5.2 (the non-pull part of the job is 3.08 min).

| Option                                                                                                                | Pull worst case             | Twenty worst case | Margin    | Tradeoff                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** Per-try timeout 90 s, 3 tries, step cap 6 min (only for the Twenty pull, or for all six via a script argument) | 3 × 90 s + 45 s = 5.25 min  | 8.33 min          | 11.67 min | A pull that takes longer than 90 s is cut and retried. Observed pulls: 34 s (local), 41 s and 66 s (CI). The margin over the slowest observed is small on a slow runner |
| **B.** Per-try 180 s, 3 tries, step cap 10 min                                                                        | 3 × 180 s + 45 s = 9.75 min | 12.83 min         | 7.17 min  | Misses the margin. Shown only to bound the choice                                                                                                                       |
| **C.** Per-try 240 s, 2 tries (the owner's spec is 3 tries)                                                           | 2 × 240 s + 15 s = 8.25 min | 11.33 min         | 8.67 min  | Misses the margin, and it changes the retry rule the owner set                                                                                                          |
| **D.** Per-try 120 s, 2 tries                                                                                         | 2 × 120 s + 15 s = 4.25 min | 7.33 min          | 12.67 min | Meets the margin, but changes the retry rule. A cut at 120 s is a real risk at the observed pull times                                                                  |
| **E.** Raise `twenty-smoke` to 30 min                                                                                 | 14 min (unchanged)          | 17.08 min         | 12.92 min | Prohibited by the rule that a timeout is never raised to fit. Only the owner can change that rule                                                                       |
| **F.** Keep 14 min and accept a 2.92-min margin for Twenty                                                            | 14 min                      | 17.08 min         | 2.92 min  | Breaks the owner's margin rule. Only the owner can accept it                                                                                                            |

**Not chosen here, as the owner asked.** Option A is the smallest change that keeps the three-try rule and the margin. The
owner decides, including whether the per-try value applies to all six jobs or to Twenty only.

**Medusa margin, for the record.** `medusa-smoke` has a 10.53-min margin, which is above 10, but two of its uncapped `Save` steps
have never run in an observed run. If either takes more than about half a minute, the margin drops below 10. That needs a decision
too (a cap on the save steps is a change to older steps, which this PR does not make).

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
