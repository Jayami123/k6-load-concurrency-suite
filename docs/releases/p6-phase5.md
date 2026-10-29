# P6 Phase 5 evidence (CI)

Evidence for the Twenty load cases of Phase 5 (`P6-TW-LOAD-004` to `-011`, the foundation and the accepted extras)
from three `twenty-load` runs on `main` at `f256d6e`. One zip per run after `evidence-release.yml` publishes tag
`p6-phase5`. The Actions artefacts expire after 14 days; the release does not.

The three runs (all `workflow_dispatch` on `main`, all VALID for every case they ran):

https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896799127
https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896827889
https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896870640

Each zip holds only the allowlisted kinds (`*.json`, `*.log`, `*.csv`, `*.html`, `*.txt`): 41 files per run, about
181 KB per zip and 0.54 MB for the three together. The `k6-main.json.gz` files are not published.

The A/A flag runs (`P6-X-LOAD-009`, `tier-aa`) are cited in the README, not here: the `tier-aa` workflow is not in the
evidence allowlist.

Numbers and verdicts are in the README section "Phase 5 results".
