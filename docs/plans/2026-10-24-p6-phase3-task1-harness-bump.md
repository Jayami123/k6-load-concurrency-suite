# P6 Phase 3 Task 1: harness pin bump and Cal up/down status (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 1", D4, D11
of Phase 2. Input report: [2026-10-24-p6-phase2-task8-med-multi-instance.md](2026-10-24-p6-phase2-task8-med-multi-instance.md) §5.
Companion plan (the harness-side Cal fix, copied into the harness repo by its build):
[2026-10-24-p6-phase3-task1-harness-cal-up-down.md](2026-10-24-p6-phase3-task1-harness-cal-up-down.md).

## 1. Header

- **File name.** The roadmap expects `task1-harness-h3-bump.md`; this plan is `task1-harness-bump.md` (it also covers the Cal status). Same task.
- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 yes, bump the cache suffixes. Q2 option 2 (D4 amended): release H3 now as harness `v0.2.13`; the Cal up/down fix ships later as its own release. Q3 the harness PR template plus a consumer checklist on the release PR. Q4 yes, the env readers move to this task. The questions are closed in §12.
- **Task.** Phase 3 Task 1. Cases: none (infrastructure for `P6-MED-RACE-002/003`).
- **Build branches (pattern).** P6 part A: `chore/<build date>-p6-harness-bump`. P6 part B (later, §6.8):
  `chore/<build date>-p6-harness-bump-cal`. Harness side: `fix/<build date>-harness-cal-up-down` (companion plan) and, if the
  maintainer releases H3 before the Cal fix (decided, §3.1, Q2).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Base.** `origin/main` = `5acd2a0` (merge of PR #51; contains PR #50, `a82521a`).
- **Harness pin assumed.** `<TAG>`: the newest released tag that contains harness H3 (`51b7d1e`). **It does not exist yet**
  (newest tag `v0.2.12`); expected `v0.2.13`. The pin is a tag, never a branch or a SHA.
- **State of the two harness items (the answer the task asked for).**
  1. **H3 (second Medusa instance + lock switch): merged on harness `main`, not released.** Evidence §3.1.
  2. **Cal `up`/`down` fix (D4): not merged, not started.** Evidence §3.3. **Therefore the P6 bump keeps the Cal bridge in
     `scripts/harness.mjs`.** Bridge deletion moves to the bump that pins the version carrying the Cal fix (part B).
- **Unit tests.** B = count on main when the build starts (today's chain: 471). Part A adds **+10** (6 env readers, 4 pin-drift): expected B + 10 (**481** today). Part B adds 0. Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 556 -> T4 599 -> T5 655 -> T6 688 -> T7 706 -> T8 723 -> T9 747 -> T10 781.
- **Stop for owner review.** Yes (rule 10): a harness pin changes, `perf.yml` changes, and the order of the two harness releases was decided by the owner (D4 amendment, Q2).

## 2. What it proves

- Infrastructure only. The same audited tool starts and stops every stack, including a second Medusa replica and its lock
  provider, so a "two replicas, one ledger" claim in finance or a "two nodes, one bed register" claim in healthcare runs on a
  reproducible topology. The bump proves that adopting the new harness changes **no existing behaviour**: the three product
  jobs stay green and the rendered Medusa config is byte-identical for every pre-existing switch combination (§3.5).

## 3. Live probe evidence (2026-10-24, cloud VM, Node v22.23.3, Docker 29.9.2)

### 3.1 Tags and release state

```text
$ git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git | grep -v '\^{}' | sed 's#.*refs/tags/##' | sort -V | tail -3
v0.2.10
v0.2.11
v0.2.12
$ git ls-remote https://github.com/Jayami123/qa-portfolio-harness.git HEAD refs/heads/main
51b7d1eb04c3dcacf007e8e020750a7837420974  HEAD
51b7d1eb04c3dcacf007e8e020750a7837420974  refs/heads/main
$ git -C harness log --oneline | head -3
51b7d1e Merge pull request #23 from Jayami123/feat/2026-10-24-p6-med-second-instance
dec6e12 Merge remote-tracking branch 'origin/main' into feat/2026-10-24-p6-med-second-instance
ce07b48 Merge pull request #24 from Jayami123/fix/2026-10-24-harness-zod-4
$ head -8 CHANGELOG.md
## Unreleased
- security: upgrade zod to 4.x (GHSA-mrhx-c7xc-m3w5) ...
- `MEDUSA_SECOND_BASE_URL` (optional, unset = none) starts a second Medusa backend on the same database after the primary is healthy. It must be `127.0.0.1` on a different port. ... If the primary is already healthy while the variable is set, `up()` throws and asks you to run `down` first. ...
- `MEDUSA_LOCK` (`memory` default, or `redis`) adds the Redis locking provider to the runtime Medusa config. `redis` requires `MEDUSA_REDIS=1`. A blank value means `memory`. ...
$ grep '"version"' package.json
  "version": "0.2.12"
```

H3 and the zod 4 upgrade sit under `## Unreleased`; `package.json` still says `0.2.12`; there is **no `v0.2.13`**. Release
rule (harness `CONTRIBUTING.md`): bump `version`, add a dated `CHANGELOG.md` section, the maintainer tags `vX.Y.Z` on `main`;
merge commits only, so a tag stays on `main` history. The harness is consumed by P1, P2, P5 and P6 through pinned tags.

### 3.2 How the probe ran (no repo file changed)

```text
$ git worktree add --detach /tmp/s/p6h3 HEAD                  # throwaway copy of this repo at 5acd2a0 (never committed)
$ sed -i 's|qa-portfolio-harness#v0.2.12|qa-portfolio-harness#51b7d1eb04c3dcacf007e8e020750a7837420974|' package.json
$ npm install --no-audit --no-fund                            # added 27 packages in 14s
$ npm run check                                               # exit 0; # tests 471; # pass 471; # fail 0
```

`npm run check` includes `tsc` against the harness types, so the repo compiles and its 471 tests pass against harness `main`.
The lock diff the bump will produce (from the copy): `node_modules/qa-portfolio-harness` `resolved` moves to the new commit
and gains an `integrity` line; its `dependencies.zod` moves from `^3.24.2` to `^4.6.7`. P6 imports no `zod` itself.

### 3.3 The Cal up/down fix is not in harness `main`

```text
$ grep -n 'FROM "User"' src/adapters/cal.adapter.ts     -> 501:  ... FROM "User" WHERE email = 'free@example.com' LIMIT 1
$ grep -n "unref\|detached" src/adapters/cal.adapter.ts -> (no hit)
$ sed -n 448,451p src/adapters/cal.adapter.ts            -> async down(): Promise<void> { await composeDown(this.composeOpts()); }
```

Live, bridge disabled in the copy only, harness `main`: `up` printed `Cal web is up at http://127.0.0.1:3000/` and the
`scripts/up.mjs cal` process was still running 43 s later (and 5 min later in a longer run); `down` exited 0 in 0.9 s with
`next-server` still listening and `/pro/30min` answering 500. The seed check printed
`Cal seed presence check failed (relation "User" does not exist); running yarn db-seed.` on every `up`; the table is `users`.
The seeded API key was printed in the `up` log. Full evidence and the fix design: the companion plan §3.

### 3.4 The H3 behaviour, live on harness `main` (Phase 2 Task 8 report §5, answered)

| Check                                                        | Result                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDUSA_REDIS=1 MEDUSA_LOCK=redis` + second URL              | `up` exit 0 in 95 s (first build) then 31 s; both `/health` 200; runtime config has the `locking` module with `locking-redis`, `is_default: true`; each backend logs `Connection to Redis in "locking-redis" provider established` |
| `MEDUSA_REDIS=1 MEDUSA_LOCK=memory` + second URL             | exit 0 in 29 s; no `locking` entry; each backend logs `Locking module: Using "in-memory" as default.`                                                                                                                              |
| Neither new variable set (the default path)                  | exit 0 in 25 s; one process, one pid file (`medusa-backend.pid`), 9001 closed (`curl` 000), no `locking` in the config                                                                                                             |
| `down`                                                       | 1.2 s, exit 0; ports 9000, 9001, 5433, 6380 have 0 listeners; both pid files removed; no `cli.js start` process; no container                                                                                                      |
| `down` with `MEDUSA_SECOND_BASE_URL` and `MEDUSA_LOCK` unset | stops the recorded second backend (it reads `baseUrl` from `medusa-backend-2.pid`): the Task 8 "survival" item is closed                                                                                                           |
| `up` again while healthy with the second URL set             | exit 1, `Error: Medusa is already healthy at http://127.0.0.1:9000/health. Run down first; the second backend was not started (...)`                                                                                               |
| `MEDUSA_LOCK=redis` without `MEDUSA_REDIS=1`                 | `MEDUSA_LOCK=redis needs MEDUSA_REDIS=1, because the Redis locking provider uses the harness Redis.`                                                                                                                               |
| Logs                                                         | `.harness/medusa-backend.log` and `medusa-backend-2.log` are append-only; each start writes `--- spawn <iso> ... ---`                                                                                                              |
| Memory (VM, proof only)                                      | primary 1.14 GB, second 0.37 GB RSS after 24 two-instance trials; `free -m` used 2.3 GB of 16 GB. The runner figure: build-time probe must confirm (Task 2 plan §3.8)                                                              |

### 3.5 The bump changes no existing behaviour (rendered config diff)

```text
$ node render-diff.mjs     # renderServerMedusaConfigJs(parseMedusaHarnessSwitches(env), url) from v0.2.12 and from main, same inputs
default            IDENTICAL
redis              IDENTICAL
redis+memory       IDENTICAL
stripe             IDENTICAL
redis+stripe       IDENTICAL
redis+lock redis   DIFFERENT (996 vs 1311 chars)       # the only new output, as intended
```

So every configuration P6 CI uses today (default; `MEDUSA_REDIS=1` is used by no P6 job) renders the same
`medusa-config.js`. The three product jobs' green runs on the bump PR remain the proof for the rest.

### 3.6 Cache-key suffixes and README: the facts

```text
$ grep -n "h0\.2" .github/workflows/perf.yml | sed 's/^\([0-9]*\):.*\(h0[.0-9]*\).*/\1 \2/'
129 h0.2.11;232 h0.2.11;325 h0.2.11;500 h0.2.11;696 h0.2.11;845 h0.2.11;959 h0.2.11;1155 h0.2.11;1287 h0.2.11
$ sed -n 5p README.md       -> [qa-portfolio-harness](...) `v0.2.11`.
$ grep qa-portfolio-harness package.json -> "github:Jayami123/qa-portfolio-harness#v0.2.12"
$ git show 420f6a0 --stat   -> chore(deps): pin qa-portfolio-harness v0.2.12 ...: package-lock.json, package.json only
```

Nine cache keys carry `h0.2.11`: Medusa build cache at 129 and 232 (`medusa-smoke`, restore and save), 325 (`medusa-order-races`),
500 (`medusa-cancel-extras`); Cal `.next` at 696 and 845 (`cal-smoke`, restore and save) and 959 (`cal-state-races`); Documenso build
cache at 1155 and 1287 (`documenso-smoke`, restore and save). The v0.2.12 bump did **not** touch them, and README line 5 still names
`v0.2.11`: the
suffix and the README line drifted from the pin. (Contradiction with the work request, which speaks of `h0.2.12` suffixes: none exist,
the real ones are `h0.2.11`; see §12 "Contradictions".) README line 301 mentions v0.2.12 exports and stays true.

### 3.7 Evidence for the budget impact of a cache miss (GitHub Actions data, last 60 `perf.yml` runs, 2026-10-23)

`Start Medusa (harness up)`: max 54 s (n=48, all cache hits); `Start Cal`: max 90 s; `Start Documenso`: max 59 s; `Pull ... images`: max 22 s
(Medusa), 16 s (Cal), 26 s (Documenso). A cold Medusa start on the VM took 95 s against 25 to 31 s cached (+65 s); a cold Cal
build took about 3 min on the VM (the `next build` after the generated tRPC types). Worst job totals in that window:
`medusa-smoke` 1286 s (21.4 min in this window; the budget in §9 uses the closeout §2.7 slowest, 22.0 min), `cal-smoke` 330 s, `documenso-smoke` 362 s, `cal-state-races` 604 s. Every job has at least
12 minutes of margin even with the cold start and the pull at its cap (§9), so one cold run per job fits; CI numbers after the bump: build-time probe must confirm.

### 3.8 What stays unconfirmed ("build-time probe must confirm")

1. The tag name and that its `package.json` `version` equals the tag (the trap: `main` says `0.2.12` today).
2. That the three product jobs are green on the bump PR (cannot be run before a tag exists).
3. The cold-cache job times after the suffix change (§3.7).
4. Whether `MEDUSA_SECOND_BASE_URL` written in `.env` reaches the harness: `scripts/harness.mjs` calls `process.loadEnvFile(".env")`
   and passes `process.env` to the harness (`spawnSync(..., { env: childEnv })`), so it should; the Task 2 probe on the tag confirms.

## 4. Depends on earlier plans

- Phase 2 Task 8 report (read; its spec items are answered in §3.4).
- Nothing from Phase 3 Tasks 3 to 10. Task 2 depends on this one. Task 5 (telemetry) reads the Cal process record: until part B
  it is `results/harness/cal.pgid` (P6's bridge); after part B it is `node_modules/qa-portfolio-harness/.harness/cal-web.pid`
  (`{"pid":N,"startMark":"..."}`, the pid is the process-group leader). Medusa: `.harness/medusa-backend.pid` and
  `medusa-backend-2.pid` (the latter adds `baseUrl`). Documenso: `.harness/documenso-web.pid`.

## 5. Build-time recheck

| #   | Check                          | Command                                                                                                                               | Expected                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Base                           | `git fetch origin main && git log -1 --format=%h origin/main`                                                                         | `5acd2a0` or a descendant containing `a82521a`                                                                                                                                                                                                                                                                                                                     |
| 2   | A tag with H3 exists           | `git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git \| grep -v '\^{}' \| sed 's#.*/##' \| sort -V \| tail -1` | a tag newer than `v0.2.12`; if still `v0.2.12`: **stop**, part A cannot start                                                                                                                                                                                                                                                                                      |
| 3   | The tag contains H3            | `git -C <harness clone> merge-base --is-ancestor 51b7d1e <TAG> && echo yes`                                                           | `yes`                                                                                                                                                                                                                                                                                                                                                              |
| 4   | Tag version = tag name         | `git -C <harness clone> show <TAG>:package.json \| grep '"version"'`                                                                  | the tag without the `v`                                                                                                                                                                                                                                                                                                                                            |
| 5   | Does the tag carry the Cal fix | `git -C <harness clone> show <TAG>:CHANGELOG.md \| grep -E 'Cal .(up\|down)\(\).\|cal-web\.pid'`                                      | no hit for the Cal entry (`Cal \`up()\``/`Cal \`down()\``/`cal-web.pid`, the wording of the companion plan's CHANGELOG text): part A only. A hit: confirm with `git -C <harness clone> merge-base --is-ancestor <fix commit> <TAG>`, then do part A and B in one PR (§6.8 steps merged). A bare substring such as `cal`is never used (it matches`local`and`scale`) |
| 6   | Baseline                       | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                   | exit 0, `# tests` = B (471 today)                                                                                                                                                                                                                                                                                                                                  |
| 7   | Current suffixes               | `grep -c "h0\.2\.11" .github/workflows/perf.yml`                                                                                      | `9`                                                                                                                                                                                                                                                                                                                                                                |
| 8   | Bridge still in place          | `grep -n "TEMPORARY BRIDGE" scripts/harness.mjs`                                                                                      | one hit                                                                                                                                                                                                                                                                                                                                                            |

## 6. Design

### 6.1 Part A file tree (P6 repo, branch `chore/<build date>-p6-harness-bump`)

```text
package.json                         CHANGED  (pin: github:Jayami123/qa-portfolio-harness#<TAG>)
package-lock.json                    CHANGED  (by `npm install`, never by hand)
.github/workflows/perf.yml           CHANGED  (9 cache-key suffixes h0.2.11 -> h<TAG without v>)
README.md                            CHANGED  (line 5 names <TAG>; Phase 3 text names the new env)
.env.example                         CHANGED  (names only: MEDUSA_REDIS, MEDUSA_LOCK, MEDUSA_SECOND_BASE_URL)
src/races/env.ts                     CHANGED  (+ medusaSecondBaseUrlFromEnv, medusaLockModeFromEnv)
scripts/harness.mjs                  CHANGED  (comment only: the bridge waits for the Cal fix release)
tests/unit/env.test.ts               CHANGED  (+6)
tests/unit/harness-pin.test.ts       NEW      (+4)
```

Not touched: `scripts/bootstrap.sh` (its comment `harness v0.2.11 src/config.ts` is historical; the product refs are
unchanged), any product fork, `node_modules/qa-portfolio-harness`.

### 6.2 The bump (exact commands)

```bash
export PATH="/usr/local/bin:$PATH"
git switch -c chore/<build date>-p6-harness-bump origin/main
npm install --save-exact=false "github:Jayami123/qa-portfolio-harness#<TAG>"      # edits package.json and package-lock.json
git diff --stat                                                                     # expect exactly: package.json, package-lock.json
grep qa-portfolio-harness package.json                                              # "github:Jayami123/qa-portfolio-harness#<TAG>"
node -e 'const l=require("./package-lock.json").packages["node_modules/qa-portfolio-harness"];console.log(l.version,l.resolved.split("#")[1])'
#   expect: <TAG without v>  <40-hex commit of the tag>      (git -C <clone> rev-parse <TAG>^{commit} gives the same hex)
npm run check
```

Expected `npm run check`: exit 0, `# tests 471`. A lock `version` that differs from the tag means the harness did not bump its
`package.json` before tagging: stop and report (companion plan §9 release step).

### 6.3 `perf.yml`: the nine suffixes

Replace `-h0.2.11` by `-h<TAG without v>` in exactly the nine lines of §3.6 (`sed -i 's/-h0\.2\.11\b/-h<new>/' .github/workflows/perf.yml`;
check with `git diff --stat` = 9 changed lines and `grep -c "h0\.2\.11" .github/workflows/perf.yml` = 0). No other workflow change.

**Non-standard choice, flagged (Q1).** The suffix invalidates build caches when the harness's _build behaviour_ changes, not on every
pin (the v0.2.12 bump left it alone, §3.6; H3 changes the runtime config and process start, not the build). The roadmap says
to bump it, and an over-invalidated cache is safe while an under-invalidated one can serve a stale build, so this plan bumps
it and makes the drift testable (§6.5). The alternative, keeping `h0.2.11` and writing down that it tracks the last
build-affecting harness version, saves one cold run per job (§3.7). Owner decides.

### 6.4 `src/races/env.ts` and `.env.example` (moved here from Task 2; skeletons)

```ts
/** Second Medusa backend, or undefined when the harness runs only one. 127.0.0.1 only, http, a different port. */
export function medusaSecondBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.MEDUSA_SECOND_BASE_URL?.trim();
  if (!raw) return undefined;
  const url = raw.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`TEST BUG: MEDUSA_SECOND_BASE_URL is not a URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error(`TEST BUG: MEDUSA_SECOND_BASE_URL must be http://127.0.0.1:<port>, got ${raw}`);
  }
  if (url === medusaBaseUrlFromEnv(env)) {
    throw new Error("TEST BUG: MEDUSA_SECOND_BASE_URL equals MEDUSA_BASE_URL");
  }
  return url;
}

export type MedusaLockMode = "memory" | "redis";

/** Same default and spelling as the harness (medusa-env.ts parseMedusaHarnessSwitches): unset or blank is "memory". */
export function medusaLockModeFromEnv(env: NodeJS.ProcessEnv = process.env): MedusaLockMode {
  const raw = env.MEDUSA_LOCK?.trim();
  if (!raw) return "memory";
  if (raw === "memory" || raw === "redis") return raw;
  throw new Error(`TEST BUG: MEDUSA_LOCK must be "memory" or "redis", got ${raw}`);
}
```

Why here: the roadmap lists them under Task 1 ("new env names only", "second-instance URL getter"), and Task 2 then starts
from a P6 that can read what the harness was told. `.env.example` gets (names only, no values):

```text
# Second Medusa backend (harness). 127.0.0.1 only, a different port, e.g. http://127.0.0.1:9001. Unset = one backend.
MEDUSA_SECOND_BASE_URL=
# 1 = Redis for the event bus, cache and workflow engine (and the lock, with MEDUSA_LOCK=redis). Default: off.
MEDUSA_REDIS=
# memory (default) or redis. redis needs MEDUSA_REDIS=1.
MEDUSA_LOCK=
```

New tests, `tests/unit/env.test.ts` (+6): `medusaSecondBaseUrlFromEnv returns undefined when unset or blank`;
`… strips a trailing slash and returns the URL`; `… rejects localhost, https, a non-URL and the primary URL (TEST BUG)`
(one test, four assertions); `medusaLockModeFromEnv defaults to memory`; `… accepts redis and memory`; `… rejects other values`.

### 6.5 `tests/unit/harness-pin.test.ts` (NEW, +4): stop the next drift

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(p, "utf8");
const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
const lock = JSON.parse(read("package-lock.json")) as {
  packages: Record<string, { version?: string; resolved?: string }>;
};
const spec = pkg.dependencies["qa-portfolio-harness"] ?? "";
const tag = /^github:Jayami123\/qa-portfolio-harness#(v\d+\.\d+\.\d+)$/.exec(spec)?.[1];

describe("harness pin", () => {
  it("is a released tag, not a branch or a SHA", () => {
    assert.ok(tag, `package.json pin is not a vX.Y.Z tag: ${spec}`);
  });
  it("matches the version recorded in package-lock.json", () => {
    const entry = lock.packages["node_modules/qa-portfolio-harness"];
    assert.equal(
      entry?.version,
      tag?.slice(1),
      "lock version differs from the tag (did the harness bump its version?)",
    );
  });
  it("is the suffix of every build cache key in perf.yml", () => {
    const suffixes = [...read(".github/workflows/perf.yml").matchAll(/-h(\d+\.\d+\.\d+)\b/g)].map(
      (m) => m[1],
    );
    assert.ok(
      suffixes.length >= 9,
      `expected at least 9 cache-key suffixes, found ${suffixes.length}`,
    );
    assert.deepEqual([...new Set(suffixes)], [tag?.slice(1)]);
  });
  it("is the version README names in its first paragraph", () => {
    assert.match(read("README.md").split("\n\n")[1] ?? "", new RegExp(`\`${tag}\``));
  });
});
```

If the owner answers Q1 "keep `h0.2.11`", change the third test to "all suffixes are equal" and say so in the PR.

### 6.6 `scripts/harness.mjs` (comment only in part A)

Change the line `// TEMPORARY BRIDGE: remove with the next qa-portfolio-harness release (...)` to name the real condition:
`// TEMPORARY BRIDGE: remove with the harness release that carries the Cal up/down fix (docs/plans/2026-10-24-p6-phase3-task1-harness-cal-up-down.md).`
Nothing else in the file changes in part A. Why: the old wording ("the next release") is now false: the next release is H3
and does not fix Cal (§3.3).

### 6.7 Part A, README

Line 5: `` `v0.2.11` `` → `` `<TAG>` ``. In "Phase 3 (next)" item 1, replace "They need the harness to start and stop a second Medusa instance (D11)... Today the harness registers no Redis lock in either mode, so `-002` also needs H3's lock switch" by one sentence: "The harness `<TAG>` starts and stops a second Medusa backend (`MEDUSA_SECOND_BASE_URL`) and registers a Redis lock (`MEDUSA_LOCK=redis`); the races are Task 2." Do not edit the Phase 1/2 results sections.

### 6.8 Part B: delete the Cal bridge (a separate, later PR)

Starts only when a released tag contains the Cal fix (§5 check 5; the companion plan's release). Branch
`chore/<build date>-p6-harness-bump-cal`. Before deleting anything, run the bridge's checks as probe steps against the new tag
with the bridge still in place **and** with it disabled in a throwaway copy (the bridge's cases, companion plan §3.5):

| #   | Probe step (through `node scripts/harness.mjs`)                                        | Expected with the fixed tag, bridge disabled      |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| B1  | `time npm run up:cal`                                                                  | exits 0 within 5 s of `Cal web is up`             |
| B2  | `npm run up:cal` twice in a row                                                        | second exits 0, one `next-server`                 |
| B3  | start `up:cal` in the background, run a second `up:cal` 20 s later                     | one `next-server`; both exit 0                    |
| B4  | `npm run down:cal`                                                                     | 0 listeners on :3000, `.harness/cal-web.pid` gone |
| B5  | `kill -9` the leader recorded in `cal-web.pid`, leave the children, `npm run down:cal` | children stopped, :3000 closed                    |
| B6  | write garbage into `.harness/cal-web.pid`, `npm run down:cal`                          | exit 0, file removed                              |
| B7  | `grep -c "cal_[A-Za-z0-9]\{10,\}"` on the `up` output                                  | `0`                                               |

Then the edits:

- `scripts/harness.mjs`: delete `LONG_RUNNING`, `LongRunning`, `productName`, `stateDir`, `pgidFile`, `logFile`, `portOpen`,
  `groupAlive`, `sleep`, `upLongRunning`, `stopGroup`, the `const spec = LONG_RUNNING[productName]` branches and the
  `net`, `readFileSync`, `writeFileSync`, `mkdirSync`, `openSync`, `rmSync`, `spawn` imports that become unused; keep the
  Documenso Node choice and the `spawnSync` call. Expected file: about 60 lines.
- `perf.yml` (`cal-smoke` and `cal-state-races`): the `Start Cal (harness up)` step loses `HARNESS_UP_TIMEOUT_MS` and gains
  `timeout-minutes: 30` (the same 30-minute cap the env var set; below the 60/85-minute job timeouts). The failure artefact
  `cal-harness-log` path `results/harness/cal-up.log` no longer exists: replace it by uploading
  `node_modules/qa-portfolio-harness/.harness/cal-web.log` (already uploaded as `cal-web-log`) and the step's own log, i.e.
  delete the `cal-harness-log` upload.
- `.env.example`: delete the `HARNESS_UP_TIMEOUT_MS` block. `README.md` "Run Cal": delete the bridge sentence.
- `tests`: none exist for `scripts/harness.mjs`; add none.
- `src/…` Task 5 reads `.harness/cal-web.pid` instead of `results/harness/cal.pgid` (Task 5's plan states both).
- Bump: `npm install github:Jayami123/qa-portfolio-harness#<TAG2>`; the drift test and the nine suffixes follow §6.2 and §6.3.

Part B unit-test delta: 0 (`harness-pin.test.ts` already covers the pin). Expected `npm run check`: 481. CI: `cal-smoke` and `cal-state-races`
green on the PR and once on `main`, with `up:cal` and `down:cal` through the harness alone; `X7` (`down:cal || true`) stays
a separate backlog item.

## 7. Oracles and assertions

No product assertion changes. The checks of this task are:

- Unit: the 10 new tests (§6.4, §6.5), run in `npm run check`. The drift test fails when the pin, the lock version, the nine
  suffixes or the README line disagree.
- Rendered config identity for every pre-existing switch combination (§3.5): repeat it in the PR description with the
  new tag (script in §3.5; the output is the evidence).
- Three product jobs green on the PR and once on `main`. A red job is root-caused first (rule 12): TEST BUG / ENV unless a
  product assertion fails; a harness regression is reported to the harness repo, never worked around in P6 (rule 14).
- **PRODUCT BUG vs TEST BUG.** Nothing here can be a product bug: the bump changes no product. A failure in a product job after
  the bump is a harness regression (report with the harness log) or a cache effect (cold run, §3.7).

## 8. Data isolation, token scan

- Isolation: none needed (no test data). Cache keys are the only shared state; a changed suffix means a cold first run and no stale reuse.
- Token scan: no new artefact in part A. Part B removes the `cal-up.log` upload (which contained the public dev-seed API key until the
  harness redaction); the remaining `cal-web-log` upload is unchanged. If the owner accepts extra E1 of the companion plan, a
  `cal_` pattern joins `scripts/evidence-token-scan.mjs`.

## 9. CI

- Part A: only the nine cache-key suffixes in `perf.yml`. No job added, no timeout changed, no step added (so "estimates" and "at caps" are equal: no new step).
- **Convention for every Phase 3 plan.** Worst case = Phase 2 closeout §2.7 worst case (slowest green `main` job plus the rerun allowance) + the cold start after this task's suffix bump (Medusa +1.1, Cal +3.0, Documenso +2.0 estimate) + the image pull at its 6-minute cap minus the measured 0.3 min (**+5.7**; Twenty jobs +5.3) + each new step at its `timeout-minutes` cap ("at caps") or at its estimate ("estimates"). It must stay 10 minutes under the job timeout; no timeout is raised.
- Sources, closeout §2.7 (runs): `medusa-smoke` 22.0 min (39927945708) + 4.2 = 26.2; `medusa-order-races` 17.9 (39923528658) + 3.3 = 21.3; `medusa-cancel-extras` 6.7 (40037355173) + 1.0 = 7.7; `cal-smoke` 9.2 (39741411392) + 0.5 = 9.7; `cal-state-races` 10.1 (40039351021) + 1.3 = 11.4; `documenso-smoke` 6.1 (39821517901) + 0.8 = 6.9.

| Job                    | §2.7 worst (min) | + cold start (min) | + pull to cap (min) | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin |
| ---------------------- | ---------------- | ------------------ | ------------------- | ---------------------- | -------------------- | ------- | ------ |
| `medusa-smoke`         | 26.2             | +1.1               | +5.7                | 33.0                   | 33.0                 | 45      | 12.0   |
| `medusa-order-races`   | 21.3             | +1.1               | +5.7                | 28.1                   | 28.1                 | 45      | 16.9   |
| `medusa-cancel-extras` | 7.7              | +1.1               | +5.7                | 14.5                   | 14.5                 | 30      | 15.5   |
| `cal-smoke`            | 9.7              | +3.0               | +5.7                | 18.4                   | 18.4                 | 60      | 41.6   |
| `cal-state-races`      | 11.4             | +3.0               | +5.7                | 20.1                   | 20.1                 | 85      | 64.9   |
| `documenso-smoke`      | 6.9              | +2.0 (estimate)    | +5.7                | 14.6                   | 14.6                 | 45      | 30.4   |

(The cold-start deltas are the VM measurements of §3.7: Medusa +65 s, Cal about 3 min; the Documenso delta is an estimate: build-time probe must confirm.) Every margin is at least 10 minutes; no timeout is raised.

- Part B: the `Start Cal (harness up)` steps get `timeout-minutes: 30`.
- `actionlint` runs inside `npm run check`; silent expected.

## 10. Environment changes

None for Cursor Cloud or Claude Code cloud in part A (no tool, host or setting changes; `npm ci` fetches the harness tag
from GitHub as today). The new env names are optional and documented in `.env.example`.

## 11. Build order (part A; one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. `<TAG>` and `<build date>` come from §5.

| Step | Commit subject                                                                   | `git add` paths                                                                                                                                                                              | `npm run check`                 |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 1 plans onto the build branch`              | `docs/plans/2026-10-24-p6-phase3-task1-harness-bump.md docs/plans/2026-10-24-p6-phase3-task1-harness-cal-up-down.md` (`git checkout origin/plan/2026-10-24-p6-phase3-plans -- <both paths>`) | exit 0, 471                     |
| 1    | `chore(deps): pin qa-portfolio-harness <TAG>`                                    | `package.json package-lock.json`                                                                                                                                                             | exit 0, 471                     |
| 2    | `ci(perf): move the build cache keys to the new harness version`                 | `.github/workflows/perf.yml`                                                                                                                                                                 | exit 0 (actionlint silent), 471 |
| 3    | `feat(races): read the second medusa url and the lock mode from the environment` | `src/races/env.ts tests/unit/env.test.ts .env.example`                                                                                                                                       | exit 0, **477**                 |
| 4    | `test: fail when the harness pin and its copies drift apart`                     | `tests/unit/harness-pin.test.ts`                                                                                                                                                             | exit 0, **481**                 |
| 5    | `docs: name the new harness version and the second backend settings`             | `README.md scripts/harness.mjs`                                                                                                                                                              | exit 0, 481                     |

After step 5: `git push -u origin chore/<build date>-p6-harness-bump`, `gh pr create` (rules A3), read CI once (rule 15): all
jobs green. Merge only when the owner says "merge" (rule 6). Part B repeats the pattern (its own steps from §6.8).

The harness-side steps (companion plan §9 and, if the owner chooses two releases, the H3 release itself) are done in the
harness repo by the maintainer; this plan builds nothing there.

## 12. Risks, proposed extras, open questions

| ID  | Risk                                                                              | Mitigation                                                                                               |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R1  | No tag exists; the task cannot start                                              | §5 check 2 stops it; Q2 asks the owner to schedule the release                                           |
| R2  | A harness change breaks P1/P2/P5 (they pin the same tags)                         | not P6's to test; the release note lists zod 4 and the two optional switches; Q3                         |
| R3  | The tag's `package.json` version is not bumped, so the lock shows the old version | the drift test (second test) fails; stop and report                                                      |
| R4  | Cold caches make the first `main` run slow                                        | §9 table, at least 12 minutes of margin everywhere                                                       |
| R5  | `\|\| true` on `down:cal` (X7) hides a crash                                      | not changed here; separate backlog item (the X7 PR after the harness release)                            |
| R6  | zod 4 pulled into P6's lock                                                       | P6 imports no zod; `npm run check` passes against harness main (§3.2); `npm audit` unchanged by the bump |

**Contradictions with the roadmap and with the work request.**

| #   | Roadmap / request says                                                                 | Probe shows                                                                       | Effect                                          |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| C1  | Roadmap: pin `v0.2.11`; update every `h0.2.11` suffix. Request: every `h0.2.12` suffix | pin is `v0.2.12`; the nine suffixes read `h0.2.11`; README line 5 reads `v0.2.11` | §6.3 and §6.7 use the real strings; Q1          |
| C2  | Roadmap: both harness PRs merge before one tag; the P6 bump deletes the bridge         | only H3 (and zod 4) is merged; no tag; no Cal fix                                 | part A keeps the bridge; part B deletes it (§1) |
| C3  | Roadmap Task 1 "Depends on: the Phase 2 Task 8 report"                                 | the report exists and its spec items are answered live (§3.4)                     | none                                            |
| C4  | Roadmap: `K6_VERSION`/`perf.yml` lines 31, 89 to 91, 277 to 279, 536 to 538            | lines are now 31 and 91, 293, 467, 641, 1128, 1339 (six jobs install k6)          | Task 3 plan uses the current lines              |
| C5  | Task 8 report names `ss` for port checks                                               | `ss` is not installed; `lsof -nP -iTCP:<port> -sTCP:LISTEN` is used here too      | none                                            |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-HARNESS-001`: a CI job step that runs `scripts/up.mjs <product>` and `down.mjs <product>` with no bridge for Cal and fails if the
  process does not return in 60 s, as the permanent regression guard for the Cal fix (after part B).
- `P6-X-HARNESS-002`: a weekly workflow that opens an issue when harness `main` is ahead of the pinned tag by more than 14 days.

**Owner decisions (all four questions closed 2026-10-24).**

- **Q1 (closed: yes, bump the suffixes).** Bump the nine cache-key suffixes to the new tag (recommended; roadmap wording) or keep `h0.2.11` as "last build-affecting
  version" (precedent: the v0.2.12 bump)? Cost of bumping: one cold run per job (§9).
- **Q2 (closed: option 2, D4 amendment: H3 as `v0.2.13` now, the Cal fix at the next tag).** Release order. D4 says one tag carries H3 and the Cal fix; the Cal fix does not exist yet. Option 1: build the Cal fix now
  (companion plan), release once, one P6 bump deletes the bridge. Option 2 (faster for Task 2): release H3 as `v0.2.13` now, P6
  bumps and keeps the bridge (this plan, part A), then release the Cal fix as the next tag and delete the bridge (part B).
  Proposed: option 2, because Task 2 and the two-instance races wait on H3 only and part B is mechanical.
- **Q3 (closed: the harness PR template plus a consumer checklist on the release PR).** Who checks P1, P2 and P5 against the tag before it is cut (zod 4)? Proposed: the harness PR template lists it; P6 does not.
- **Q4 (closed: yes).** Accept moving the two env readers (`medusaSecondBaseUrlFromEnv`, `medusaLockModeFromEnv`) from Task 2 to this task? Proposed: yes (the roadmap lists them here).

## 13. Done when (roadmap, made measurable)

- [ ] Harness: H3 and the Cal fix are released (two tags, per the Q2 decision), each with a CHANGELOG entry (companion plan §9).
- [ ] Part A merged: `package.json` pins `<TAG>`; the lock shows `<TAG>` without `v` and the tag's commit; `perf.yml` has 0 `h0.2.11` and 9 new suffixes; README line 5 names `<TAG>`; the three product jobs are green on the PR and once on `main`; `npm run check` exit 0 with **481** tests.
- [ ] Part B merged (after the Cal fix release): `scripts/harness.mjs` has no `LONG_RUNNING`, `upLongRunning`, `stopGroup` or `cal.pgid`; README no longer describes the bridge; `cal-smoke` and `cal-state-races` green with `up:cal`/`down:cal` through the harness alone (probe steps B1 to B7 pasted in the PR); `npm run check` exit 0 with 481 tests.

## 14. Rule 20 self-check

- (a) Roadmap "Done when" items are in §13. Gap: both harness releases are the maintainer's actions in another repo (Q2).
- (b) Existing names grepped at `5acd2a0`: `scripts/harness.mjs` (`LONG_RUNNING`, `upLongRunning`, `stopGroup`, `pgidFile`),
  `.github/workflows/perf.yml` (9 `h0.2.11` lines), `README.md` line 5, `package.json` pin, `src/races/env.ts`
  (`medusaBaseUrlFromEnv`), `.env.example`, `HARNESS_UP_TIMEOUT_MS` (perf.yml `cal-smoke`, `.env.example`). NEW: `medusaSecondBaseUrlFromEnv`,
  `medusaLockModeFromEnv`, `tests/unit/harness-pin.test.ts`.
- (c) CI time: §9 table uses the §2.7 worst case, the cold start and the pull at its cap; every margin is at least 12.0 minutes.
- (d) Skeletons: §6.4, §6.5; steps with paths, subjects and expected output: §11.
- (e) The owner's answers to Q1 to Q4 are recorded in §1 and §12.
