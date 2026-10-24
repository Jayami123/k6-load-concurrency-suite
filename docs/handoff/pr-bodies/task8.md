# Task 8 PR (not created: the owner opens it)

Base: feat/2026-10-24-p6-journey-smokes (Task 7)
Head: feat/2026-10-24-p6-med-load-conservation
Title: feat(load): add the medusa load conservation case (P6-MED-LOAD-002)

## Body

## What and why

Adds the Medusa conservation check for the load case `P6-MED-LOAD-002` (plan task 8, docs/plans/2026-10-24-p6-phase3-task8-med-load-conservation.md):

- `judgeConservation` (pure) in `src/load/med-conservation.ts`: iterations accounted for, stock exhausted, orders at most stock,
  reservations matching orders, client counts matching the database (F-M2 is a known bug, counted and not failed), clean refusals only,
  no drops.
- `conservationStage` reads the k6 counters from the summary (`metrics.<name>.count`) and the database through the read-only pool.
- The case registry entry `MED_LOAD_002` uses the stock of half the planned orders, so the run exhausts stock on purpose.

## Not in this PR

- The live verdict of the case is in the CI run below, not a local run.

## Checks

- `npm run check` on the branch: 740 tests at this stage, all passing.
- CI: run `40115106241` (perf.yml, workflow_dispatch) on head `f0f02e4`: **success**.
- The Task 8 head was merged with Task 7 and later with the whole stack. The final stack run is in the Task 9 body.

## Merge order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9, each with `--no-ff`. No merge to `main` yet.

