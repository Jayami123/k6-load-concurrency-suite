# Draft: feature request, optimistic concurrency (If-Match or version) for REST updates (P6-TW-LOAD-004 variant B)

Status: not filed. Nothing here is posted, filed or sent. The reporter files it by hand after the duplicate search below.

- **Finding:** `P6-TW-LOAD-004`, variant B. Owner decision C13: a FINDING (silent lost update by design, last-write-wins),
  not a PRODUCT BUG and not a known failure. This draft asks for a feature, not a fix to a bug.
- **Target:** `twentyhq/twenty`.
- **Channel:** public issue, using Twenty's own feature template `.github/ISSUE_TEMPLATE/add-new-feature---behavior.md`
  (name "Add new feature / behavior"). Its template labels are empty, so none are set. Sections below follow that template:
  `Scope & Context`, `Current behavior`, `Expected behavior`, `Technical inputs`.
- **Suggested title:** `Add optimistic concurrency (If-Match or version) to REST update`.
- **Upstream recheck (2026-10-29, Asia/Colombo):** upstream HEAD `0c5752d843df454a7b324c48f186e14964eb212a`. The fork pin
  used in the runs is `7cbdfec6f346b43715bc2056932f4fad5886f733` (image `v2.44.0`). A search of
  `packages/twenty-server/src/engine/api` at upstream HEAD for `If-Match`, `ETag` and `optimistic` found no match.
  `common-update-one-query-runner.service.ts` has no version or `If-Match` check.
- **Duplicate search (to do on the filing day):** search the issues for "optimistic concurrency", "If-Match", "ETag",
  "lost update", "version" and "concurrent update". Record the result here before filing.

## Scope & Context

Twenty's REST API has no optimistic concurrency: `PATCH /rest/companies/:id` has no version or `If-Match` check. Two clients
that each read a record, compute a new value and write it back will overwrite each other, and both requests succeed.
Measured under sustained edits (two read-modify-write writers on the same records, `employees = read + 1`, a read-only
final-value oracle after each run), the stored value lost about half of the acknowledged increments:

| Run id      | Acknowledged increments | Stored increase | Lost increments | Lost share |
| ----------- | ----------------------- | --------------- | --------------- | ---------- |
| 40896799127 | 724                     | 363             | 361             | 49.9 %     |
| 40896827889 | 725                     | 363             | 362             | 49.9 %     |
| 40896870640 | 723                     | 362             | 361             | 49.9 %     |

The request is about the API contract, not about a crash or a wrong result on a single request.

## Current behavior

Every write returns `200`, and the last write wins. No request is refused, and no `409` or `412` is ever returned, so a client
cannot tell that its update was overwritten.

**Example:**

```
Record R: employees = 0
Writer 1: GET /rest/companies/R  -> employees = 0
Writer 2: GET /rest/companies/R  -> employees = 0
Writer 1: PATCH /rest/companies/R {"employees": 1}  -> 200
Writer 2: PATCH /rest/companies/R {"employees": 1}  -> 200
Stored value: 1, two increments acknowledged
```

## Expected behavior

A client should be able to say which version of a record it read, and have a write refused when the record has changed
since. For example:

- the client sends `If-Match` with the version or `updatedAt` it read, and the server answers `412` (or `409`) when the
  record has moved on, so the client re-reads and retries; or
- the API offers an atomic increment for numeric fields, so the server does the read and the write in one step.

This is opt-in: requests without the header keep today's last-write-wins behaviour.

**Example:**

```
Writer 2's PATCH with If-Match set to the version it read should get 412 once Writer 1 has written.
```

## Technical inputs

- **Reproduction (from the public harness repository `Jayami123/k6-load-concurrency-suite`):**

  ```
  bash scripts/bootstrap.sh twenty
  npm run up:twenty
  npm run seed:twenty
  P6_TWENTY_LIMITER_PROFILE=functional node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile pr
  TWENTY_DOWN_VOLUMES=1 npm run down:twenty
  ```

  The `functional` profile raises the API rate limits so the limiter does not shape the result.

- **The write path:** `k6/cases/tw-load-004.js` (variant B): `GET /rest/companies/:id`, then
  `PATCH /rest/companies/:id` with `{"employees": <read + 1>}`.
- **The code path:** `packages/twenty-server/src/engine/api/common/common-query-runners/common-update-one-query-runner.service.ts`
  applies the update with no version or `If-Match` check (upstream HEAD `0c5752d`).
- **Not included:** tokens, passwords, and record payloads beyond the field values above.
