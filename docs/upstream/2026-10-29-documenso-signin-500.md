# Draft: Documenso sign-in returns 500 for a wrong password or an invalid CSRF token (P6-OBS-DOC-001)

Status: not filed

- **Finding:** `P6-OBS-DOC-001`. Label PRODUCT BUG, severity low.
- **Target:** `documenso/documenso`.
- **Channel:** public issue, form `.github/ISSUE_TEMPLATE/bug-report.yml`. This is a status-code contract bug, not a security
  report, so the public form fits Documenso's policy (Task 9 plan Appendix E).
- **Source draft:** Task 5 plan (`docs/plans/2026-10-23-p6-phase2-task5-doc-obs-001.md`) Appendix A, refreshed.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `aef13b8dd3101aaa51e5e9dd6f03a476f4b921d6`.
- **`packages/auth/server/routes/email-password.ts`:** no diff since `8707e33c` (the Task 9 check). At HEAD, L94 (CSRF), L115 and L132 (invalid credentials) still throw `AppError` without a `statusCode`.
- **`packages/auth/server/index.ts`:** it changed since the fork pin `f4105e47` (an Origin check was removed, and embed middleware was added). The `onError` mapping is unchanged: `(err.statusCode || 500)` at L62–64.
- **Duplicate search** (unauthenticated, `repo:documenso/documenso`): `sign in 500`, `invalid credentials 500`, `csrf 500`. No duplicate.
- **Verdict: still applies.**

## Issue Description

Wrong credentials and an invalid CSRF token on `POST /api/auth/email-password/authorize` return HTTP 500 instead of a 4xx
status. A client cannot tell "bad password" from "server fault" by status code, and monitoring counts every failed sign-in as a
server error.

## Steps to Reproduce

1. `GET /api/auth/csrf`, and keep the `csrfToken` cookie and value.
2. `POST /api/auth/email-password/authorize` with a verified account's email, a wrong password of 6 or more characters, and the CSRF value.
3. Observe the status.
4. Repeat step 2 with a bogus `csrfToken` value.

## Expected Behavior

- Wrong password: 401.
- Invalid CSRF token: 400 or 403.

Neither is a 5xx.

## Current Behavior

- **Wrong password:** 500 `{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}`.
- **Bogus CSRF token:** 500 `{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}`.
- **Cause:** in `packages/auth/server/routes/email-password.ts`, the handler throws `AppError`s without a `statusCode` (L94, L115 and L132 at `main` `aef13b8d`), and `auth.onError` in `packages/auth/server/index.ts` maps a missing `statusCode` to 500 (L62–64).
- **Reproduction:** a local run at fork pin `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c` (`@documenso/root` 2.19.0) gave:
  - 5 of 5 sequential and 20 of 20 parallel wrong-password attempts;
  - 3 of 3 bad-CSRF attempts.
- **CI:** both cases return 500 in every run of the test `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` in https://github.com/Jayami123/k6-load-concurrency-suite.

## Screenshots

Not applicable (HTTP only).

## OS / Browser / Version

- **OS:** Linux (a cloud VM for the local run; a GitHub Actions Ubuntu 24.04 runner for CI).
- **Browser:** none (HTTP calls).
- **Version:** fork `f4105e47`; the code path was checked at `main` `aef13b8d`.

## Evidence gap (before filing)

- The CI runs are 39956188035, 39959840802, 39961527451, 40037355173 and 40039351021 (`docs/findings.json`). The result is in the **job logs only**. No release holds it (`p6-phase2` was never published), and the artefacts and logs expire (Phase 2: 2026-11-06).
- Cite the issue on the code reading plus the local numbers, or re-run the spec and link a fresh run on the filing day. TODO.
- `docs/findings.json` lists this finding's evidence as release `p6-phase4`, but none of these run ids is in that release. Fix this in the repo separately.

## Checklist

- [ ] I have searched the existing issues (re-run the queries above on the filing day).
- [x] Steps to reproduce.
- [x] Environment information.
