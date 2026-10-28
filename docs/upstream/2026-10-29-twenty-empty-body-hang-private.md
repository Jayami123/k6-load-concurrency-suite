# Draft: Twenty POST /graphql and /metadata hang forever on an empty or `{}` body (P6-OBS-TW-001), private report

Status: not sent

- **Finding:** `P6-OBS-TW-001`.
- **Target:** `twentyhq/twenty`.
- **Channel:** **private email to security@twenty.com**, the same policy as the reset-token report. No public issue.
- **Source draft:** Task 9 plan Appendix D2. The measurements are from `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md`.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `762e8ae4a3a4eaa804813a7ffcf8962ca1ed4f17`. The bug was measured on image `twentycrm/twenty:v2.44.0`.
- **Code:** the cause was never traced in the source, so there is no file to diff. **It was not re-run on a newer image.**
- **Duplicate search** (unauthenticated, `repo:twentyhq/twenty`): `graphql empty body hang`, `request hangs graphql`. Results:
  - #26895 and #25165 are different hangs;
  - nothing reports an empty or `{}` body hanging.
- **Verdict: still applies on v2.44.0. The status at HEAD is unknown.** Optional before sending: run the
  `tw-obs-001-empty-body-hang.spec.ts` probe against the current image tag. TODO.

## Email (draft)

```text
To: security@twenty.com
Subject: Unauthenticated requests with an empty JSON body hold server sockets open indefinitely

Hello Twenty security team,

We found that POST /graphql and POST /metadata never answer a request whose JSON body is empty or {}, and the server never
closes those sockets, with or without an Authorization header.

What we see
- Content-Type: application/json with an empty body, or the body {}, on POST /graphql or POST /metadata: no status and no
  bytes, ever. 12 of 12 authenticated and 12 of 12 unauthenticated probe requests hung (30 s client timeout each).
- Twenty such requests held for 400 s were all still open (past Node's 300 s requestTimeout default), with and without
  authentication. The server log has no line for them.
- The body {"foo":1} gets a 400 within about 15 ms and a valid query a 200, so the server is otherwise healthy.
- In our CI the eight combinations (two endpoints x two bodies x with and without auth) hang in every run.

Impact
- An unauthenticated client can hold server sockets (and whatever per-request resources they keep) open indefinitely. In
  our test, 10 and 20 held requests did not slow a valid query (largest valid-query time 32.2 ms), so we have not shown a
  denial of service; we did not test larger numbers.

Environment
- Self-hosted image twentycrm/twenty:v2.44.0. Not re-run on a newer release; we did not trace the cause in the source.
- Our tests and CI evidence are in a public QA repository; we can share the exact links on request.

Expected: an immediate 4xx (for example 400 "Must provide query string"), as for {"foo":1}.

We are happy to help verify a fix.
```

## Evidence (for the reporter)

- **Specs:**
  - `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts` (8 tests under `test.fail()`);
  - `tests/twenty/tw-obs/tw-obs-001-hung-requests-resource.spec.ts`.
- **Measurements:** `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md` §3.1–§3.5. These were local probes on 2026-10-24.
- **CI:** Phase 2 runs 40037355173 and 40039351021 (job `twenty-obs`). The expected-fail results are **only in the job logs**,
  and those runs are not in any published release (`p6-phase2` was never published). Their artefacts expire 2026-11-06 and
  the logs probably follow the same retention.
- **Released runs:** the released zips (`p6-phase3` and `p6-phase4`) hold `twenty-obs-container-log/containers.log` only. They contain no test results for this finding.
- **Gap:** no permanent machine-readable evidence. TODO: save the `twenty-obs` job log of a released run before it expires, if the report needs it.
