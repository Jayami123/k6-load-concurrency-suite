# Draft: Documenso sign-in validation errors echo the submitted password and CSRF token (P6-OBS-DOC-003), private advisory

Status: not sent

- **Finding:** `P6-OBS-DOC-003`. Label finding, severity low.
- **Target:** `documenso/documenso`.
- **Channel:** **private vulnerability report** through GitHub's form at
  https://github.com/documenso/documenso/security/advisories/new. Documenso's `SECURITY.md` prefers this; the fallback is security@documenso.com.
- **Do not open a public issue.**
- **Source draft:** Task 9 plan Appendix F, refreshed.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `aef13b8dd3101aaa51e5e9dd6f03a476f4b921d6`.
- **Code:** `packages/auth/server/routes/email-password.ts` has no diff since `8707e33c`. At HEAD, L66 is still
  `sValidator('json', ZSignInSchema)` with no error hook (`sValidator` is imported from `@hono/standard-validator` at L38).
- **Duplicate search** (unauthenticated, `repo:documenso/documenso`): `validation error password response`. No public duplicate. Private advisories cannot be searched.
- **Verdict: still applies** (by code reading). It was not re-probed against HEAD.

## Advisory form fields (draft)

> **Title.** Sign-in validation errors echo the submitted password and CSRF token in the response body
>
> **Affected product / versions.** `documenso/documenso` `main` at `aef13b8d` (code unchanged since at least `8707e33c`); observed
> on a self-hosted build at `f4105e47` (`@documenso/root` 2.19.0).
>
> **Severity (proposed).** Low. The value goes back only to the client that sent it.
>
> **Description.** `POST /api/auth/email-password/authorize` validates its JSON body with `sValidator('json', ZSignInSchema)`
> (`packages/auth/server/routes/email-password.ts` L66) and no error hook, so a validation failure returns 400 with the
> validator's default body, which includes the submitted input. A body without `csrfToken` returns the `email` and the
> `password` in `data`; a password shorter than 6 characters returns the `password` and the `csrfToken`.
>
> **Impact.** Any layer that logs response bodies (a reverse proxy, an APM agent, a browser or mobile error reporter) then
> stores a user's password in clear text. No other user's data is exposed.
>
> **Suggested fix.** Pass a hook to `sValidator` that returns only the issue codes and paths, never `data`, for this route (and
> the other auth routes that use the same pattern).
>
> **Reproduction.** Send the two request bodies above to the route and read the 400 body. Observed in a local probe on
> 2026-10-23 (two samples per body); the code is the same at `main` `aef13b8d`.

## Evidence gaps

- There is no test and no CI run (`docs/findings.json` has an empty `runIds`). The only record is `docs/BACKLOG.md` plus the local probe of 2026-10-23.
- TODO: optionally re-probe locally on the filing day (two samples per body) and keep the response bodies **off** any public page, because they contain a test password.
- "Other auth routes that use the same pattern" was not enumerated. TODO: list them, or drop the clause.
