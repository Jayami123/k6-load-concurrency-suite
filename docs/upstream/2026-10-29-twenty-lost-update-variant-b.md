# Draft: silent lost update on REST PATCH of a read-modify-write field (P6-TW-LOAD-004 variant B)

Status: not filed. Nothing here is posted, filed or sent. The reporter files it by hand after the duplicate search below.

- **Finding:** `P6-TW-LOAD-004`, variant B (a FINDING, silent lost update). Labelled FINDING in the closeout; not a pass.
- **Target:** `twentyhq/twenty`.
- **Channel:** public issue, using Twenty's own bug template `.github/ISSUE_TEMPLATE/report-bug.md`
  (name "Report a bug", label `type: bug`). Sections below follow that template: `Bug Description`, `Expected behavior`,
  `Technical inputs`.
- **Upstream recheck (2026-10-29, Asia/Colombo):** upstream HEAD `0c5752d843df454a7b324c48f186e14964eb212a`. The fork
  pin used in the runs is `7cbdfec6f346b43715bc2056932f4fad5886f733` (image `v2.44.0`). A search of
  `packages/twenty-server/src/engine/api` at upstream HEAD for `If-Match`, `ETag` and `optimistic` found no match.
  `common-update-one-query-runner.service.ts` has no version or `If-Match` check.
- **Duplicate search (to do on the filing day):** search the issues for "lost update", "optimistic concurrency",
  "If-Match", "concurrent update" and "overwrite". Record the result here before filing.

## Bug Description

Twenty's REST API has no optimistic concurrency (no version or `If-Match` check on `PATCH /rest/companies/:id`). When two
clients each read a record, compute a new value from what they read, and write it back, the second write replaces the
first and both requests get `200`. Nothing tells either client that an update was lost.

Measured under sustained edits (two read-modify-write writers on the same records, `employees = read + 1`, a read-only
final-value oracle after each run). The acknowledged increments were compared with the stored value:

| Run id      | Acknowledged increments | Stored increase | Lost increments | Lost share |
| ----------- | ----------------------- | --------------- | --------------- | ---------- |
| 40896799127 | 724                     | 363             | 361             | 49.9 %     |
| 40896827889 | 725                     | 363             | 362             | 49.9 %     |
| 40896870640 | 723                     | 362             | 361             | 49.9 %     |

Every write returned `200`. No request was refused, and no `429` or `5xx` was seen in these runs. The same run has a
separate variant in which two writers edit different fields of the same record; no field was lost in that variant.

**Example:**

```
Record R: employees = 0
Writer 1: GET /rest/companies/R  -> employees = 0
Writer 2: GET /rest/companies/R  -> employees = 0
Writer 1: PATCH /rest/companies/R {"employees": 1}  -> 200
Writer 2: PATCH /rest/companies/R {"employees": 1}  -> 200   (the first increment is gone)
Stored value: 1, two increments acknowledged
```

## Expected behavior

When two clients update the same field of the same record from values they read, one update should not silently replace
the other. Either:

- both increments are kept (for example an atomic update in the database, or a server-side increment), or
- the second write is refused with a conflict the client can act on (for example `409`, or `412` when the client sends a
  version or `If-Match` header), so the client re-reads and retries.

**Example:**

```
Writer 2's PATCH should fail with a conflict once Writer 1 has written, or the stored value should be 2.
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

  The `functional` profile raises the API rate limits so the limiter does not shape the result. The evidence is the
  run's `finals.json` and `intents.jsonl`.

- **The write path:** `k6/cases/tw-load-004.js` (variant B): `GET /rest/companies/:id`, then
  `PATCH /rest/companies/:id` with `{"employees": <read + 1>}`.
- **The code path:** `packages/twenty-server/src/engine/api/common/common-query-runners/common-update-one-query-runner.service.ts`
  applies the update without a version or `If-Match` check (upstream HEAD `0c5752d`).
- **Possible direction (not verified, for the maintainers to judge):** a conditional update keyed on a version or on
  `updatedAt`, or an atomic increment for numeric fields.
- **Not included:** tokens, passwords, record payloads beyond the field values above. The run prefix is the only record name
  shared.
