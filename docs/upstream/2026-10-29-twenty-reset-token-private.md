# Draft: Twenty password-reset token redeemable many times in parallel (P6-TW-RACE-004), private report

Status: not sent

- **Finding:** `P6-TW-RACE-004`.
- **Target:** `twentyhq/twenty`.
- **Channel:** **private email to security@twenty.com.** Twenty's `.github/SECURITY.md` asks for vulnerability reports by email and keeps them confidential until a fix ships.
- **Do not open a public issue or PR comment, and do not link it from public pages** until Twenty has replied or fixed it.
- **Source draft:** Task 9 plan Appendix D1, refreshed to upstream HEAD.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `762e8ae4a3a4eaa804813a7ffcf8962ca1ed4f17` (latest tag `twenty/v2.53.1`).
- **The pinned build:** image `twentycrm/twenty:v2.44.0` (`TWENTY_IMAGE_TAG` in `perf.yml`), source pin `TWENTY_REF` `7cbdfec6f346b43715bc2056932f4fad5886f733`.
- **Code at HEAD:**
  - `auth.resolver.ts` `updatePasswordViaResetToken` is at L1301–1313. It calls `validatePasswordResetToken`, then `authService.updatePassword`, then `invalidatePasswordResetToken`, with no lock and no condition.
  - `reset-password.service.ts` is unchanged since the Task 9 check (`c13b414b`). At HEAD:
    - `validatePasswordResetToken` is at L254; it does a `findOne` with `revokedAt: IsNull()` at L262–267.
    - `invalidatePasswordResetToken` is at L290; it does an unconditional update of `revokedAt` at L298–304.
  - Since the pin `7cbdfec6`, the resolver changed (+180/−29), but not on this path.
- **Duplicate search** (unauthenticated, `repo:twentyhq/twenty`): `reset password token`, `password reset token reuse`. No
  duplicate. #26524 (sign-in rate limiting, closed) is different. Private advisories cannot be searched, so a private duplicate
  is possible.
- **Verdict: still applies** (by code reading at HEAD). It was not re-run on a HEAD image.

## Email (draft)

```text
To: security@twenty.com
Subject: Password-reset token can be redeemed many times by parallel requests

Hello Twenty security team,

We found that one password-reset token can be redeemed many times when the redemptions arrive in parallel.

What we see
- Ten parallel updatePasswordViaResetToken mutations (POST /metadata) with one valid reset token all succeed (10 x 200,
  each with a successful result), and the password hash changes.
- This happened in every trial we ran: 50 of 50 trials in each of four CI runs (200 of 200), 10 of 10 redemptions
  succeeding each time. After the race exactly one token row exists and it is revoked.
- A replay after a finished redemption is refused ("Token is invalid"), so the single-use check exists but is not atomic.

Where it is (main 762e8ae4)
- auth.resolver.ts updatePasswordViaResetToken (L1301-1313) calls validatePasswordResetToken (a findOne for an unrevoked,
  unexpired token; reset-password.service.ts L254, query at L262-267), then authService.updatePassword, then
  invalidatePasswordResetToken (an unconditional update of revokedAt; L290, update at L298-304). Nothing locks or
  conditions the update between the check and the revoke.
- invalidatePasswordResetToken revokes by userId and type only, so it does not tell the caller whether this request was the
  one that consumed the token.
- A conditional revoke first (UPDATE appToken SET revokedAt = now() WHERE value = :hash AND type = PasswordResetToken AND
  revokedAt IS NULL, and continue only when one row changed) would close the window.

Impact
- Anyone holding a reset token (for example from a forwarded or intercepted reset email) can race the legitimate user and
  set the password more than once with the same token. Each redemption changes the password hash.

Environment
- Self-hosted image twentycrm/twenty:v2.44.0; the code path is the same at main 762e8ae4 (by reading, not re-run).
- Our test and its CI evidence are in a public QA repository; we can share the exact links and the request shape on
  request.

We are happy to help verify a fix. Please let us know if you need anything else.
```

The column names were checked at HEAD: `appTokenRepository.findOne` filters on `value` (the sha256 of the token), `type`,
`expiresAt` and `revokedAt`, and the revoke updates by `userId` and `type`.

## Evidence (for the reporter, not pasted into the email)

- **Spec:** `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts`.
- **Per-trial JSON:** `race-histograms-twenty-races/P6-TW-RACE-004.json` in each zip. Each trial records `successes` 10, `overlapped` true, `hashChanged` true, `revokedRows` 1 and `totalTokenRows` 1. The statuses are 500 × 200 per run.

| Run         | Release   | Asset                         | Trials with 10 of 10 successes |
| ----------- | --------- | ----------------------------- | ------------------------------ |
| 40177412186 | p6-phase3 | `p6-40177412186-evidence.zip` | 50/50                          |
| 40498902575 | p6-phase4 | `p6-40498902575-evidence.zip` | 50/50                          |
| 40524237209 | p6-phase4 | `p6-40524237209-evidence.zip` | 50/50                          |
| 40526041971 | p6-phase4 | `p6-40526041971-evidence.zip` | 50/50                          |

The release assets are public. If Twenty asks for confidentiality, decide whether the public README and Pages text about this
finding should stay as it is. It already exists publicly.
