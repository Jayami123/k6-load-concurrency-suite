# k6-load-concurrency-suite

P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.11`.

Phase 0 only proves the setup: the harness starts Medusa and a 1-VU k6 smoke check gets
HTTP 200 from `GET /health`.

## Run the smoke check locally

Needs Node 22.22+, Docker, pnpm 10.11.1 and k6.

```bash
npm ci
bash scripts/bootstrap.sh medusa   # clones the Medusa fork into ../products if it is missing
npm run up:medusa
npm run smoke:medusa
npm run down:medusa
```

`npm run check` runs Prettier, the TypeScript check and `k6 inspect` (skipped when k6 is missing).

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
