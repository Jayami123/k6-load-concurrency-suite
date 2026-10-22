# Phase N closeout (YYYY-MM-DD)

- Model:
- Branch:
- Head SHA:
- CI status: (with run link)

Copy this file to `docs/plans/<YYYY-MM-DD>-p6-phaseN-closeout.md` and fill in every section. Write
"none" rather than deleting a section.

## 1. Summary

The phase goal and whether it was met, in 3-5 sentences.

## 2. Models used

Per task, which model planned it and which model built it.

| Task | Planned by | Built by |
| ---- | ---------- | -------- |
|      |            |          |

## 3. Tasks

One row per task. Use the merge commit SHA, not the branch head, and the unit-test count on `main`
after the merge.

| Task | PR  | Merge commit | Unit tests after merge | CI run | Review rounds | Status |
| ---- | --- | ------------ | ---------------------- | ------ | ------------- | ------ |
|      |     |              |                        |        |               |        |

## 4. Findings

Label each one SUSPECTED, PRODUCT BUG, TEST BUG or finding (see rule 13 in
[`docs/agent-rules.md`](../agent-rules.md)). Evidence means run links and counts.

| ID  | Product | Case | Label | Evidence | Upstream issue |
| --- | ------- | ---- | ----- | -------- | -------------- |
|     |         |      |       |          |                |

## 5. Decisions made without the owner

Each routine decision taken without asking, why, and the file and section where it is recorded.

| Decision | Reason | Recorded in |
| -------- | ------ | ----------- |
|          |        |             |

## 6. Deviations

Where the work departed from the roadmap or from a task plan, and why.

## 7. Rule slips and fixes

Every rule broken during the phase and how it was fixed (for example a trailer removed or a branch
renamed). List them honestly, including ones caught before review.

## 8. CI health

Flaky tests, reruns and their outcomes, and job durations against their budgets.

## 9. Open questions for the owner

Numbered, each with a proposed answer.

1. Question. Proposed answer:

## 10. Backlog and next phase

Backlog items carried forward, and the next phase's first task.
