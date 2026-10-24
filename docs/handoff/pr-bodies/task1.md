# Task 1 PR (not created: owner opens it)

Base: main
Head: chore/2026-10-24-p6-harness-bump
Title: chore(deps): pin qa-portfolio-harness v0.2.15 (task 1: harness pin and cal bridge removal)

## Body

## What and why

Pins qa-portfolio-harness to the released tag v0.2.15 (tag object 303a432, commit 43dc0da). It carries the second Medusa
backend (H3: MEDUSA_SECOND_BASE_URL and MEDUSA_LOCK), the Cal up/down fix, and the Linux Cal listener fix that v0.2.14
lacked (the `no listener pid could be read` error, see the run history below).

With the listener fix in place, the temporary Cal bridge in `scripts/harness.mjs` is removed (part B). Its CI helpers
(`HARNESS_UP_TIMEOUT_MS`, the long-running Cal bridge step and its log uploads) go with it, and the README drops the bridge text.

Plan: docs/plans/2026-10-24-p6-phase3-task1-harness-bump.md (parts A and B), companion
docs/plans/2026-10-24-p6-phase3-task1-harness-cal-up-down.md.

## Commits

- chore(deps): pin qa-portfolio-harness v0.2.15 for the linux cal listener fix (package.json, package-lock.json, README pin line)
- ci(cal): remove the long-running bridge now that harness v0.2.15 finds the listener (part B)
- ci(perf): move the build cache keys to harness v0.2.15 (9 suffixes h0.2.14 -> h0.2.15)
- docs: record the v0.2.15 pin and the part B removal in this body (this commit)

Earlier stack commits on this branch (v0.2.14 pin, read-environment settings, drift test) are unchanged.

## Verification

npm run check on the pin commit and on the part B commit: "# tests 481 / # pass 481 / # fail 0". Baseline on main: 471.
The lock resolves `qa-portfolio-harness` to `43dc0da7874a50d709b328bfb492e1e091a9fc64` (version 0.2.15).
`grep -c 'h0.2.15$' .github/workflows/perf.yml` = 9; `grep -c 'h0.2.14'` = 0.

## Probe evidence (v0.2.14, kept as history)

- Tag v0.2.14 -> 0927c79. Cal bridge-in-place probe (B1) failed on the cloud VM: harness up reports "Cal is healthy on
  127.0.0.1:3000, but no listener pid could be read". lsof did not report the next-server socket (pid 10289).

## CI

v0.2.15 run: perf.yml workflow_dispatch on this branch after the part B commit (result recorded in the run-2 report).
Earlier v0.2.14 run: 40077117412 (below).

## Budget

See the handoff file.

## Deviations

- The plan's part A (pin only, bridge kept) was superseded by the v0.2.15 release: the pin and the bridge removal are both in this PR.
- README pin line moved before the drift test commit (the test reads it).

## Environment changes

None for Cursor Cloud and Claude Code cloud. Observed: the Claude Code cloud session exports
NODE_OPTIONS=--use-openssl-ca, which makes the harness drop its 8192 MB heap for next build (OOM).
Cloud sessions that run up:cal need NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192".

## CI result, v0.2.14 (run 40077117412, workflow_dispatch on chore/2026-10-24-p6-harness-bump at 43a1b62)

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

The v0.2.14 `up()` finds Cal healthy, then cannot read the port-3000 listener through `lsof` (`listenerPids`), so it fails
closed. The same error reproduced on the VM. Fixed in v0.2.15 per the owner's brief; the v0.2.15 CI result is in the run-2 report.
