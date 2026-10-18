# Cursor cloud Medusa feasibility probe (2026-10-18)

Time-boxed probe: can this Cursor cloud VM (custom environment build) run Medusa through the harness and drive a small k6 load? No product-fork edits. Medusa was started and stopped only via `npm run up:medusa` / `npm run down:medusa`.

**Verdict: (a) this cloud VM can run Medusa plus small loads, so we can probe and iterate here.**

Publish performance numbers for the portfolio only from GitHub Actions (median of at least 3), per repo policy. This run proves toolchain and harness viability, not benchmark-grade throughput.

## Environment boot

| Item        | Value                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------- |
| Run         | `bc-92f9ba58-47fd-4fa3-98df-21eeef23e330`                                                    |
| Environment | `k6-load-concurrency-suite` (`9a406034-cae3-11f1-bec7-b2318963e0b6`)                         |
| Build       | `bld-20261018-68519b51-0782-40f6-9f98-42d1e4d45de4` (`resolution: resolved`, cold warm-fork) |
| Repo base   | `main` @ `f9a3da2`                                                                           |

Custom image includes Docker CE 28.5.2, k6 v2.3.0, Node **v22.23.3** at `/usr/local/bin/node`, pnpm 10.11.1.

**PATH note:** Cursor prepends `/exec-daemon` (`node` defaults to **v22.14.0**). Harness `up` fails on that Node. All harness/k6 commands in this probe used:

`export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`

## Machine specs

Captured at probe start (2026-10-18T11:17Z UTC):

| Item          | Output                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| OS            | `Linux cursor 6.12.94+ #1 SMP PREEMPT_DYNAMIC Thu Oct 15 16:04:59 UTC 2026 x86_64`  |
| `nproc`       | `4`                                                                                 |
| `free -h`     | Mem total `15Gi`, used `10Gi`, free `3.7Gi`, available `4.7Gi`. Swap `0B`.          |
| `df -h /`     | `/dev/vdc` Size `251G`, Used `4.5G`, Avail `234G`, Use% `2%`, mounted on `/`        |
| `docker info` | Server Version `28.5.2`, CPUs `4`, Total Memory `15.63GiB`                          |
| `node -v`     | `v22.23.3` (with PATH above; default `which node` → `/exec-daemon/node` `v22.14.0`) |
| `pnpm -v`     | `10.11.1`                                                                           |
| `k6 version`  | `k6 v2.3.0 (commit/e088784614, go1.26.8, linux/amd64)`                              |

## Products / bootstrap

`bash scripts/bootstrap.sh medusa` — product already present; `pnpm install --frozen-lockfile` completed (`Done in 1.3s`).

## Medusa start

`TIMEFORMAT=$'real %R\nuser %U\nsys %S'; time npm run up:medusa` (with PATH above).

| Metric         | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Wall time      | **real 52.024 s** (user 35.636, sys 4.171)                               |
| Exit code      | `0`                                                                      |
| Harness health | `Medusa GET /health returned HTTP 200` at `http://127.0.0.1:9000/health` |
| Post-up `curl` | `http_code=200`, body `OK`                                               |

## Smoke

`npm run smoke:medusa` — **passed** (exit 0).

- `checks`: rate `100.00%` (5/5)
- `http_req_failed`: `0.00%` (0/5)
- All checks: `GET /health is 200`

## k6 probe

Script: `k6/probe/health-load.js` — stages: ramp to 10 VUs / 30s, hold 10 VUs / 2m, ramp to 20 VUs / 1m; GET `/health`, check status 200.

Command (consolidated run with resource sampling):

```
k6 run --summary-export docs/feasibility/2026-10-18-results/probe-health-load.json -o json=results/probe-stream.jsonl k6/probe/health-load.js
```

(JSON stream used only to derive per-stage latency; not committed.)

Exit code: `0`. Threshold `http_req_failed rate<1`: satisfied (`0.00%`).

### Overall (from `docs/feasibility/2026-10-18-results/probe-health-load.json`)

| Metric        | Value                  |
| ------------- | ---------------------- |
| HTTP requests | `568332`               |
| Error rate    | `0` (`0.00%`)          |
| Requests/s    | `2706.253248922423`    |
| p50 (`med`)   | `3.432091` ms          |
| p95           | `6.810334449999998` ms |
| p99           | `9.208851839999976` ms |

### Per stage (from `http_req_duration` points tagged `stage` in the JSON stream)

| Stage                    | Requests | Error rate |                RPS | p50 (ms) | p95 (ms) |  p99 (ms) |
| ------------------------ | -------: | ---------: | -----------------: | -------: | -------: | --------: |
| ramp to 10 VUs over 30s  |    79969 |          0 |  2665.633333333333 | 1.696291 |  4.06066 |  5.533673 |
| hold 10 VUs for 2 min    |   320167 |          0 | 2668.0583333333334 | 3.330038 | 6.181355 |  8.084145 |
| ramp to 20 VUs for 1 min |   168196 |          0 |  2803.266666666667 | 4.963797 | 8.180263 | 11.080364 |

RPS per stage = request count ÷ nominal stage duration (30s / 120s / 60s).

## Peak CPU and memory (during probe)

Samples: `docs/feasibility/2026-10-18-results/probe-resources.txt` (`docker stats --no-stream` + `uptime` every 15s).

| Resource                              | Peak observed                |
| ------------------------------------- | ---------------------------- |
| `qa-harness-medusa-postgres-1` CPU    | `5.49%`                      |
| `qa-harness-medusa-postgres-1` memory | `83.21` MiB                  |
| Host load average (1 min)             | `1.85` (sample at 11:22:22Z) |

Medusa backend runs as a host Node process (not in `docker stats`); only Postgres appears in container stats.

## `down:medusa`

`npm run down:medusa` — exit `0`, **real 0.644 s**. Compose stack torn down.

## Failures

None during this probe (after using `/usr/local/bin` on PATH).

## Follow-ups for agents on this image

1. Prepend `/usr/local/bin` to PATH (or document in AGENTS.md) so `npm run up:medusa` does not hit exec-daemon Node 22.14.0.
2. Treat k6 RPS/latency here as smoke/feasibility only; official numbers stay on GitHub Actions.

> Note: `/health` does not touch the database and the Medusa server runs as a host process, so the resource samples above are not real peak figures. Real peaks need host-process sampling on DB-backed endpoints.
