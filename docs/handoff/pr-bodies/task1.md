# Task 1 PR (not created: owner opens it)

Base: main
Head: chore/2026-10-24-p6-harness-bump
Title: chore(deps): pin qa-portfolio-harness v0.2.14 (task 1 part A)

## Body

## What and why

Pins qa-portfolio-harness to the released tag v0.2.14 (commit 0927c79), which contains
the second Medusa backend (H3, MEDUSA_SECOND_BASE_URL and MEDUSA_LOCK) and the Cal up/down fix.
Part A only: the bridge in scripts/harness.mjs stays, because its removal (part B) is not yet probed.

Plan: docs/plans/2026-10-24-p6-phase3-task1-harness-bump.md (parts A and B), companion
docs/plans/2026-10-24-p6-phase3-task1-harness-cal-up-down.md.

## Commits

- chore(deps): pin qa-portfolio-harness v0.2.14 (package.json, package-lock.json by npm install)
- ci(perf): move the build cache keys to harness v0.2.14 (9 suffixes h0.2.11 -> h0.2.14)
- feat(races): read the second medusa url and the lock mode from the environment (+6 tests)
- docs: name the new harness version and the second backend settings (README)
- test: fail when the harness pin and its copies drift apart (+4 tests)
- chore(harness): name the release that carries the cal fix on the bridge (comment only)

## Verification

npm ci (harness 0.2.14 installed), npm run check: "# tests 481 / # pass 481 / # fail 0".
Baseline on main: 471.

## Probe evidence

- Tag v0.2.14 -> 0927c79, package.json version 0.2.14; contains 51b7d1e (H3) and d8e169a (Cal fix).
- Cal bridge-in-place probe (B1) failed on the cloud VM: harness up reports "Cal is healthy on
  127.0.0.1:3000, but no listener pid could be read". lsof did not report the next-server
  socket (pid 10289). Part B is therefore not in this PR.

## CI

perf.yml workflow_dispatch on this branch: run 40077117412 (see the comment with the run result).

## Budget

See the handoff file.

## Deviations

- Part A only (bridge kept); part B blocked by the probe above.
- README pin line moved before the drift test commit (the test reads it).

## Environment changes

None for Cursor Cloud and Claude Code cloud. Observed: the Claude Code cloud session exports
NODE_OPTIONS=--use-openssl-ca, which makes the harness drop its 8192 MB heap for next build (OOM).
Cloud sessions that run up:cal need NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192".

## CI result (run 40077117412, workflow_dispatch on chore/2026-10-24-p6-harness-bump at 43a1b62)

| Job             | Conclusion  | Notes                                                                    |
| --------------- | ----------- | ------------------------------------------------------------------------ |
| medusa-smoke    | success     | Start Medusa 53 s; race step 15.5 min                                    |
| documenso-smoke | success     | Start Documenso 3 min 32 s                                               |
| cal-smoke       | **failure** | `Start Cal (harness up)` failed after 5 min 03 s; see the error below    |
| cal-state-races | **failure** | `Start Cal (harness up)` failed after 5 min 05 s (same step, same stack) |

cal-smoke, exact error lines from the GitHub runner:

```text
Error: Cal is healthy on 127.0.0.1:3000, but no listener pid could be read (recorded pid 8263, start mark 46759). Not guessing which process serves it.
    at assertListenerIsRecorded (.../qa-portfolio-harness/dist/adapters/cal-web-pid.js:123:15)
    at CalAdapter.verifyListenerIsRecorded (.../qa-portfolio-harness/dist/adapters/cal.adapter.js:406:9)
    at CalAdapter.up (.../qa-portfolio-harness/dist/adapters/cal.adapter.js:400:14)
ENV: harness up cal exited 1 before ready
```

The harness v0.2.14 `up()` finds Cal healthy, then cannot read the port-3000 listener through `lsof`
(`listenerPids`), so it fails closed. The same error reproduces on the VM. Not worked around in P6 (owner instruction).
Merging part A as it stands turns both Cal jobs red on `main`. Owner decision needed: keep the pin at v0.2.14 and fix
the harness, or pin v0.2.13 (H3 only, no Cal fix) until the harness is fixed.

Part B (delete the Cal bridge) is parked: its probe cannot pass while `up()` fails. The patch is kept out of this branch.
