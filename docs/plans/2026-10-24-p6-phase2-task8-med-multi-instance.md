# P6 Phase 2 Task 8: multi-instance Medusa probe (read-only report and harness H3 spec)

## 0. Status

- **Type.** Docs only. Read-only live probe of Medusa with two backend processes. No code, test or CI change in P6
  (roadmap Task 8, D11).
- **Branch.** `docs/2026-10-24-p6-med-multi-instance`, from `origin/main` `4b09d34`.
- **Harness read.** `qa-portfolio-harness` **v0.2.12**, resolved commit `09c30048ec9fe45879a3a5e0af4393c5ac2ac899`
  (`package-lock.json`). The roadmap names v0.2.11; this is a deviation, see §8.2.
- **Medusa fork read.** `medusa-dtc-starter` at `MEDUSA_REF` `f677db438f27294fc50e4c7c6612e71ff38eeff5`
  (`@medusajs/*` 2.21.2, pnpm 10.11.1). The starter is cloned next to the repo at `../products/medusa-dtc-starter`.
- **Probe date.** 2026-10-23, on the cloud VM (Node v22.23.3, Docker server 29.9.2, 4 vCPU, 16 GB RAM).
- **Memory figures.** Every memory number here is **VM, proof only**. The GitHub-runner figure: **the live probe in
  Phase 3 must confirm**.

## 1. Result summary (the four roadmap spec items)

| Spec item                 | What the probe shows                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Ports                  | Harness backend is `127.0.0.1:9000` (`MEDUSA_BASE_URL`). A second backend on `9001` came up with `PORT=9001`, `/health` 200, and clashes with no stack in the harness or this repo. Both instances read the same rows.                                                                                                                                                                                                  | Evidence (§4.1)                                                                    |
| 2. Lock provider per mode | **No Redis lock in either mode.** The lock module logs `Using "in-memory" as default` with and without `MEDUSA_REDIS=1`. `MEDUSA_REDIS=1` adds Redis for the event bus, cache and workflow engine only. `-002` (Redis lock) cannot run on today's harness; H3 must add a lock switch.                                                                                                                                   | Evidence (§4.2)                                                                    |
| 3. Memory                 | Two backends ≈ 675 MiB (no Redis) and ≈ 765 MiB (Redis) RSS, idle, on the VM. Postgres 37 to 66 MiB, Redis about 5 MiB.                                                                                                                                                                                                                                                                                                 | VM, proof only. The live probe in Phase 3 must confirm the runner figure (§4.3).   |
| 4. Down and cleanup       | `down` stops only the recorded backend pid and the base port. A second backend started outside the harness is not known to `down`. The probe stopped its second backend before `down`, as the probe rules require, so "second backend survives `down`" was **not run live**; it is from code reading. After our stop and `down`, no Medusa process and no listener on 9000, 9001, 5433 or 6380 remained, in both modes. | Live for the clean path; the survival case is "the live probe must confirm" (§4.4) |

## 2. Probe environment and rules followed

- Commands run from the repo root with `export PATH="/usr/local/bin:$PATH"` (rule in `AGENTS.md`).
- `npm run up:medusa` and `npm run down:medusa` are the only harness commands. The harness builds the Medusa backend
  when `.medusa/server` is missing, and reuses it when `harness-build.json` matches `HEAD`.
- The **probe-only second backend** is one `node .../cli.js start` process from the same built server
  (`apps/backend/.medusa/server`), with `PORT` set to `9001` and the environment from the starter's `apps/backend/.env`
  (the same environment the harness uses). It was started by a small launcher script outside the repo (session scratchpad,
  not committed), its pid was recorded, and I stopped it myself with `kill -TERM` before every `down`. The harness does
  not know about it. P6 builds no bridge for it (D11).
- No file in the repo changed during the probe. `git status` was clean after the probe.
- `ss` is not installed on this VM. Listener checks used `lsof -nP -iTCP:<port> -sTCP:LISTEN` and `/proc/net/tcp`.

## 3. Probe log (commands, exit codes, timings)

Each row is a real command or step. "Exit" is the shell exit code.

| #   | Step                                           | Exit   | Time                 | What it proves                                                                                                                                 |
| --- | ---------------------------------------------- | ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `env -u MEDUSA_REDIS npm run up:medusa`        | 0      | 122 s wall           | No-Redis mode starts. The log has migrate 36.3 s, build 54.0 s, `/health` 200 in 6.1 s.                                                        |
| 2   | `node launch-second.mjs 9001 …` (probe-only)   | 0      | 5 s to `/health` 200 | A second backend on 9001 starts from the same build. Its log has `Server is ready on port: 9001 – 3209ms`. Pid 1810.                           |
| 3   | `node probe-read.mjs` (read-only, both ports)  | 0      | —                    | Both ports return 200 for `/health` and for `GET /store/products`, the same 4 product ids (§4.1).                                              |
| 4   | `ps`, `/proc/<pid>/status` (memory)            | —      | —                    | RSS of both backends, and the Postgres container (§4.3).                                                                                       |
| 5   | `kill -TERM 1810` (probe-only stop)            | —      | gone after 3 s       | The probe-only backend exits and port 9001 closes (`curl` → 000).                                                                              |
| 6   | `npm run down:medusa`                          | 0      | 1 s                  | The harness stops its pid (`medusa-backend.pid` = 1527) and the compose stack (volumes kept).                                                  |
| 7   | `ps`, `lsof` on 9000/9001/5433/6380            | lsof 1 | —                    | No process left, no listener on the four ports, no Medusa container (§4.4). `lsof` exit 1 means no listeners.                                  |
| 8   | `MEDUSA_REDIS=1 npm run up:medusa`             | 0      | 32 s wall            | Redis mode starts. The build is skipped (`harness-build.json` matches HEAD `f677db43`). Migrate 11.4 s. `/health` 200 in 6.1 s.                |
| 9   | `node launch-second.mjs 9001 …` (Redis mode)   | 0      | 7 s to `/health` 200 | Same second backend with `REDIS_URL` from `.env`. Pid 3001. Ready in 3408 ms.                                                                  |
| 10  | `node probe-read.mjs` (Redis mode)             | 0      | —                    | Same reads, same ids.                                                                                                                          |
| 11  | `redis-cli INFO clients`, `CLIENT LIST`        | 0      | —                    | 23 connected clients. Eight `bzpopmin` blocking clients: four bull or event-bus queues, two per instance. Both instances use one Redis (§4.2). |
| 12  | `kill -TERM 3001` (probe-only stop)            | —      | gone after 3 s       | Probe-only backend stopped.                                                                                                                    |
| 13  | `npm run down:medusa`                          | 0      | 1 s                  | Harness stops pid 2676 and the compose stack.                                                                                                  |
| 14  | `ps`, `lsof` (after `down`)                    | lsof 1 | —                    | Right after `down`, `ps` lists two `[node] <defunct>` entries (parent pid 1). Five seconds later, none (§4.4). No listeners.                   |
| 15  | `npm run check` on the branch, before any edit | 0      | 21 s                 | Prettier passes. **452** unit tests pass (`# tests 452`, `# fail 0`). This is the baseline the plan cites.                                     |

Summary of exit codes: `up` no-Redis 0, `down` no-Redis 0, `up` Redis 0, `down` Redis 0, `npm run check` 0.

## 4. What the probe proves, per spec item

### 4.1 Ports (spec item 1)

Harness facts (read in the pinned package `node_modules/qa-portfolio-harness/src`):

- `config.ts` line 38: `MEDUSA_BASE_URL` defaults to `http://127.0.0.1:9000`.
- `adapters/medusa-env.ts` line 11: `MEDUSA_DEFAULT_PORT = "9000"`. Line 98: `medusaListen(baseUrl)` accepts only an http URL on
  `127.0.0.1` (line 110 rejects `localhost`), and returns the port.
- The Medusa CLI reads the port from the `PORT` environment variable (`@medusajs/cli` `dist/create-cli.js` line 467,
  `default: process.env.PORT || defaultPort`). The probe used `PORT=9001` and got `/health` 200 on 9001 while 9000 stayed up.

Ports in use across the harness defaults and this repo (grep for `127.0.0.1:` and `localhost:` in the pinned package and
in P6). `9001` appears in neither:

| Stack                        | Ports                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Medusa (harness)             | 9000 backend, 8000 storefront (not started here, `MEDUSA_SKIP_STOREFRONT=1`), 5433 Postgres, 6380 Redis |
| Cal                          | 3000 app, 5450 Postgres, 5555 API                                                                       |
| Documenso                    | 3001                                                                                                    |
| Twenty                       | 3002 app, 5434 Postgres, 8025 and 1025 Mailpit                                                          |
| **Second Medusa (proposed)** | **9001**, no container of its own                                                                       |

Shared state. The two backends used the **same** `apps/backend/.env`, so the same `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
and `COOKIE_SECRET`. Probe read (`probe-read.mjs`, read-only, both modes):

```
db: product rows (not deleted)=4, publishable api_key rows=1
port 9000: /health=200 GET /store/products=200 count=4 returned=4 firstId=prod_01M5N1XTCEDHFJBAG7NKT4WBCE
port 9001: /health=200 GET /store/products=200 count=4 returned=4 firstId=prod_01M5N1XTCEDHFJBAG7NKT4WBCE
same product ids on both ports: true
```

The primary evidence that both backends use one database is the shared `DATABASE_URL`: the probe launched the second
backend from the same `apps/backend/.env` that the harness writes once per `up` (`writeBackendEnv`). The matching product
ids are runtime corroboration only. Two databases restored from the same dump would return the same ids, so the ids alone
do not prove sharing. Redis mode returned the same ids (`probe-read-redis.out`). The read was read-only; no write went
through the second backend. A write through one port and a read through the other would be the direct proof; it was not
run, because this task is read-only.

### 4.2 Lock provider per mode (spec item 2)

| Mode             | Runtime `.medusa/server/medusa-config.js` (written by `renderServerMedusaConfigJs`)                               | Startup log, lock line                          | Lock provider              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| No Redis         | `projectConfig` only, no `modules` block                                                                          | `Locking module: Using "in-memory" as default.` | in-memory, one per process |
| `MEDUSA_REDIS=1` | `redisUrl` plus three modules: `event-bus-redis`, `cache-redis`, `workflow-engine-redis`. **No `locking` entry.** | `Locking module: Using "in-memory" as default.` | in-memory, one per process |

Evidence:

- `apps/backend/medusa-config.ts` in the starter registers **no** modules. The roadmap's assumption holds.
- In Redis mode the log shows `Connection to Redis in module 'event-bus-redis' established`, `'cache-redis'` and
  `'workflow-engine-redis'` (and its PubSub). The two processes share the bus, cache and workflow engine through one Redis
  (`CLIENT LIST` in §3 step 11). **The lock does not**: it is still per process.
- In no-Redis mode the log says `Local Event Bus installed. This is not recommended for production.`, so each process has
  its own event bus.
- `renderServerMedusaConfigJs` (`medusa-env.ts` lines 235 to 300) writes no `locking` entry at all, so no P6 switch yields
  a Redis lock today.
- `@medusajs/locking-redis` 2.21.2 is **not** a direct dependency of the starter. It sits in the pnpm store under
  `node_modules/.pnpm`, pulled in by `@medusajs/medusa`. It is not linked in `apps/backend/node_modules`. The roadmap says
  "installed in the starter's `node_modules`", which is only true of the pnpm virtual store.
- From the built server directory (`.medusa/server`), plain Node resolution behaves as follows:

  | `require.resolve(...)`           | Result                                                                    |
  | -------------------------------- | ------------------------------------------------------------------------- |
  | `@medusajs/locking-redis`        | `MODULE_NOT_FOUND`                                                        |
  | `@medusajs/locking`              | `MODULE_NOT_FOUND`                                                        |
  | `@medusajs/medusa/locking-redis` | resolves to `node_modules/@medusajs/medusa/dist/modules/locking-redis.js` |
  | `@medusajs/medusa/locking`       | resolves to `node_modules/@medusajs/medusa/dist/modules/locking.js`       |

  That shim re-exports the package from inside the `@medusajs/medusa` tree. So `@medusajs/medusa/locking-redis` is the
  resolve string H3 should use. **Whether Medusa then registers it as the lock provider is not run here: the live probe
  in Phase 3 must confirm it** (the startup log should stop saying `Using "in-memory" as default`).

What this means for the cases:

- `P6-MED-RACE-003` (two instances, in-memory lock, characterization) runs on today's default lock. It needs only the
  second instance.
- `P6-MED-RACE-002` (two instances, Redis lock) **needs H3 to add a lock switch** (§5.7). Without it, the test would run
  on the in-memory lock and would not be the Redis-lock case the roadmap names.

### 4.3 Memory (spec item 3). VM, proof only.

Idle, after start, no load. `VmRSS` from `/proc/<pid>/status` and `docker stats --no-stream`:

| Mode     | Process  | Role                          | VmRSS (kB) | VmHWM (kB, peak) |
| -------- | -------- | ----------------------------- | ---------- | ---------------- |
| No Redis | pid 1527 | harness backend, port 9000    | 347,656    | 423,948          |
| No Redis | pid 1810 | probe-only backend, port 9001 | 342,896    | 422,460          |
| Redis    | pid 2676 | harness backend, port 9000    | 350,744    | not captured     |
| Redis    | pid 3001 | probe-only backend, port 9001 | 432,688    | not captured     |

| Mode     | Containers (docker stats)                           |
| -------- | --------------------------------------------------- |
| No Redis | Postgres 65.88 MiB                                  |
| Redis    | Postgres 37.27 to 37.37 MiB; Redis 4.82 to 5.09 MiB |

Totals (VM, proof only): two backends ≈ 675 MiB (no Redis), ≈ 765 MiB (Redis). Postgres and Redis add under 70 MiB. The
VM has 16 GB RAM, so these are about 4 to 5 per cent of it.

Limits of these numbers:

- They are **idle** numbers. The race load (N=10 bursts, several trials) was not measured. VmHWM (about 423 MB) is the
  lifetime peak of each process, and it includes boot.
- They say nothing about the GitHub-hosted runner. **The live probe in Phase 3 must confirm the runner figure**, under race load.

### 4.4 Down and cleanup (spec item 4)

Code path, read in the pinned package (`medusa.adapter.ts`):

- `down()` (line 1088) runs `stopStorefront()`, then `stopBackend(host, port)` with the port of `MEDUSA_BASE_URL`,
  then the compose `down`.
- `stopBackend()` (line 929) stops the **one** pid recorded in `.harness/medusa-backend.pid`, then calls
  `reapProductListeners(port, "backend")` (line 940, listeners on the base port only), then waits for that port to close.
- So a second backend that the harness does not record is **not known to `down`**. This is from reading the code. The live
  probe did not test it, because the probe rules say to stop the second backend before `down`. **The live probe in Phase 3
  must confirm it:** start the H3 second instance, run `down`, and expect port 9001 closed. The second pid is a separate, asynchronous check:
  an exited Node process can stay a zombie for a few seconds (§4.4 zombie note), so it is not required to be gone at once.

Live results, clean path (both modes): after our `kill -TERM` and `npm run down:medusa` (exit 0):

- `ps` showed no Medusa process (no-Redis: none; Redis: two defunct entries, see below).
- `lsof -nP -iTCP:9000 -iTCP:9001 -iTCP:5433 -iTCP:6380 -sTCP:LISTEN` exit 1 (no listeners), in both modes.
- No Medusa container (`docker ps -a`); the compose stack was removed, volumes kept.
- `/health` on 9000 and 9001: `000` (connection refused) after `down`.

Zombie note. After the Redis-mode `down`, `ps` showed `[node] <defunct>` for pid 2676 (the harness backend) and pid 3324
(a child, parent 1). Both had exited. Five seconds later neither had a `/proc` entry. PID 1 here (`process_api`) reaps
asynchronously.

Consequence for H3: `isPidRunning` is `process.kill(pid, 0)` (`internal/spawn-detached.ts` line 107 to 131), which
returns true for a zombie. So H3 must decide "stopped" by **the port closing**, not by the pid being gone.

## 5. Harness H3 spec (for the harness repo; P6 does not build this)

H3 is a change in `Jayami123/qa-portfolio-harness`, after v0.2.12. The release number is for the harness owner to set.
P6 pins it only after that release, in a later task. Everything below names the files of the pinned v0.2.12 source.

### 5.1 Env names (next to `MEDUSA_BASE_URL`)

| Name                     | Default                    | Meaning                                                                                                                                     |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDUSA_SECOND_BASE_URL` | unset (no second instance) | URL of the second backend, for example `http://127.0.0.1:9001`. Validated by `medusaListen`. Its port must differ from `MEDUSA_BASE_URL`'s. |
| `MEDUSA_LOCK`            | `memory`                   | `memory` keeps today's behaviour. `redis` adds the `locking-redis` provider. It is an error when `MEDUSA_REDIS` is not `1`.                 |

Where they go:

- `src/config.ts` line 38, next to `MEDUSA_BASE_URL`:

  ```ts
  MEDUSA_SECOND_BASE_URL: z.string().trim().url().optional(),
  ```

- `MEDUSA_LOCK` is a harness switch. It is read in `parseMedusaHarnessSwitches` (`src/adapters/medusa-env.ts` line 146),
  next to `MEDUSA_REDIS` and `MEDUSA_STRIPE`.

### 5.2 The second port and why it clashes with nothing

- `9001` has **no default**. The harness only starts a second backend when `MEDUSA_SECOND_BASE_URL` is set. In the P6
  examples it is set to `http://127.0.0.1:9001`.
- It is free on this VM and appears in no harness default or P6 file (§4.1). The second backend has no compose container,
  so no new Docker port is published.
- If another process holds 9001, `up` refuses, the same way it refuses for 9000 today (`medusa.adapter.ts` line 991 to
  996: "Port … is in use … The harness did not stop anything"). Nothing is killed.

### 5.3 Pid and log tracking

- `src/adapters/medusa-backend-pid.ts`, next to `MEDUSA_BACKEND_PID_BASENAME` (line 8):

  ```ts
  export const MEDUSA_BACKEND_2_PID_BASENAME = "medusa-backend-2.pid";
  ```

- Same file, next to `writeMedusaBackendPid` (line 109), reusing `writeMedusaPid` (line 97):

  ```ts
  export function writeMedusaBackend2Pid(pid: number, harnessRoot: string = HARNESS_ROOT): void {
    writeMedusaPid(MEDUSA_BACKEND_2_PID_BASENAME, pid, harnessRoot);
  }
  ```

- Same file, next to `stopMedusaBackendFromPidFile` (line 212), reusing `stopMedusaPidFile` (line 160):

  ```ts
  export function stopMedusaBackend2FromPidFile(
    harnessRoot: string = HARNESS_ROOT,
    deps?: Partial<StopMedusaBackendFromPidFileDeps>,
  ): void {
    stopMedusaPidFile(MEDUSA_BACKEND_2_PID_BASENAME, harnessRoot, deps);
  }
  ```

- Log file: `.harness/medusa-backend-2.log`, next to `logFile()` (`src/adapters/medusa.adapter.ts` line 121).

### 5.4 Start (`src/adapters/medusa.adapter.ts`, NEW method, called from `up()`)

Called from `up()` (line 954) after `startBackend()` and `waitReady()`. Same command, cwd and env as `startBackend()`
(line 879), with `PORT` set explicitly so an inherited `PORT` cannot move it:

```ts
// NEW. Second backend: same built server as startBackend(), PORT set explicitly.
private startSecondBackend(): void {
  const url = this.cfg.secondBaseUrl; // from MEDUSA_SECOND_BASE_URL; undefined = no-op
  if (url === undefined) return;
  const { port } = medusaListen(url);
  const logFile = path.join(HARNESS_ROOT, ".harness", "medusa-backend-2.log");
  this.secondBackendProcess = spawnLogged(
    process.execPath,
    [path.join(this.backendDir(), "node_modules", "@medusajs", "cli", "cli.js"), "start"],
    {
      cwd: this.backendStartCwd(),
      logFile,
      env: { ...this.backendProcessEnv(), PORT: port },
      detached: true,
      shell: false,
    },
  );
  if (this.secondBackendProcess.pid !== undefined) {
    writeMedusaBackend2Pid(this.secondBackendProcess.pid);
  }
  this.secondBackendProcess.unref();
}
```

Then, in `up()`: `startSecondBackend()`, then `pollHealth(\`${url}/health\`)` for the second URL. Before anything starts,
the second port gets the same "in use but not 200, do not stop" check as the base port (line 991).

### 5.5 Down semantics (`down()`, line 1088)

Order: `stopStorefront()`, `stopBackend()`, **`stopSecondBackend()` (NEW)**, then compose `down`.

```ts
// NEW. Stops only the recorded second backend. Success means its port closed, not that its pid is gone.
private async stopSecondBackend(): Promise<void> {
  const url = this.cfg.secondBaseUrl;
  if (url === undefined) return; // env unset: no-op, nothing changes for existing runs
  const { host, port } = medusaListen(url);
  // A recorded pid that cannot be stopped throws here (MedusaBackendStopError). Nothing is reaped after that.
  stopMedusaBackend2FromPidFile(HARNESS_ROOT);
  // No pid file: reap only listeners started from productRoot (reapProductListeners checks argv and cwd).
  await this.reapProductListeners(port, "backend-2");
  const closed = await this.waitForPortClosed(host, port, STOP_POLL_MS);
  if (!closed) {
    throw new Error(`Second Medusa backend still listening on ${host}:${port}; not killed.`);
  }
}
```

Rules, in words:

- Env unset: nothing happens, so existing runs do not change.
- No pid file and the port is open: reap only listeners whose argv or cwd is in `productRoot`
  (`reapProductListeners`, line 731, the same check `stopBackend` uses today). Any other process on the port **throws;
  nothing is killed.**
- A recorded pid that cannot be stopped throws before any reap, so a stop error is never reported as success.
- Success is the port closing (`waitForPortClosed`, line 778). A zombie still answers `kill(pid, 0)`, so a pid check would
  report a stopped process as running.

### 5.6 Config: the lock switch (`src/adapters/medusa-env.ts`)

- `parseMedusaHarnessSwitches` (line 146): add `lock: "memory" | "redis"` from `MEDUSA_LOCK`. Throw when it is `redis`
  and `MEDUSA_REDIS` is not `1`.
- `renderServerMedusaConfigJs` (line 235): when `lock === "redis"`, add one entry to the `modules` array, in the same
  style as the three Redis entries that are already there:

  ```js
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: process.env.REDIS_URL },
            },
          ],
        },
      }
  ```

- `is_default: true` makes the Redis provider the module's default (as Medusa's Redis locking provider docs set it,
  per the owner's review). Without it, the in-memory lock may stay the default even with the entry present.
- **The live probe must confirm** that Medusa accepts this shape, and that the startup log stops saying
  `Locking module: Using "in-memory" as default.` and names `locking-redis` instead. If it does not, H3 is not done.
  This is a harness question; P6 does not work around it.

### 5.7 What `-002` and `-003` need

| Need                                                                                                        | `P6-MED-RACE-002` (two instances, Redis lock)                     | `P6-MED-RACE-003` (two instances, in-memory lock)                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Second backend started and stopped by the harness (§5.4, §5.5)                                              | Yes                                                               | Yes                                                                                                                                           |
| `MEDUSA_REDIS=1`                                                                                            | Yes: same bus, cache and workflow engine through one Redis (§4.2) | Yes, same as `-002` (the two cases differ only in the lock provider; Q6 answer)                                                               |
| `MEDUSA_LOCK` (§5.6): `-002` sets `redis`, `-003` sets `memory`                                             | `redis`                                                           | `memory` (set explicitly, not left to the default)                                                                                            |
| Race spec sees both URLs (`MEDUSA_BASE_URL`, `MEDUSA_SECOND_BASE_URL`) and alternates requests between them | Yes                                                               | Yes                                                                                                                                           |
| Invariant                                                                                                   | Single winner across both instances                               | Characterization: record whether two in-memory locks let two winners through. No `test.fail()` until repeated CI runs reproduce it (rule 13). |
| Shared-state proof before the race (the §4.1 read through each port)                                        | Yes                                                               | Yes                                                                                                                                           |
| Phase 3 probe must confirm                                                                                  | The lock line (§4.2) and both pids                                | Both pids, and that the lock is `memory`                                                                                                      |

### 5.8 Harness tests (the H3 change)

Named test files in the pinned package, each with what it adds. Counts are for H3 to set.

- `src/adapters/medusa-env.test.ts`: `MEDUSA_LOCK=redis` without `MEDUSA_REDIS=1` throws; rendered config contains
  `@medusajs/medusa/locking-redis` only when `lock === "redis"`.
- `src/adapters/medusa-backend-pid.test.ts`: the new basename and the write and stop helpers, using the injected `deps`
  as the existing tests do.
- `src/adapters/medusa.adapter.test.ts`: `stopSecondBackend` is a no-op when the env is unset; it throws when the pid file
  is missing and the port is open; it succeeds when the port closes.

## 6. Phase 3: what `P6-MED-RACE-002` and `-003` need, risks, contradictions, questions

### 6.1 Phase 3 first steps

1. Read the released harness (not v0.2.12) and pin it. Repeat the probe (§3) against the released harness **before** writing the case.
2. Confirm the spec items marked "the live probe must confirm": the runner memory (§4.3), the second-backend survival case
   for `down` (§4.4), and the `locking-redis` wiring (§4.2, §5.6).

### 6.2 Risks

1. **Redis lock not wired today.** `-002` cannot be the Redis-lock case until H3 adds `MEDUSA_LOCK` and the probe confirms it.
2. **Harness internals move.** The roadmap names this risk. The pin and this report's line numbers are for v0.2.12.
3. **Memory on the runner.** Two backends ≈ 765 MiB idle on the VM, more under load. The runner figure is unknown.
4. **Job time.** The reference is Task 3's `medusa-smoke` job, 17 min 36 s, timeout 45 min (§6.3 below). Two backends add
   about 6 s of boot each and the extra trials. Phase 3's CI estimate must stay under 35 min (45 min minus the 10 min
   margin, rule F(c)). **Not estimated here.**
5. **No-Redis event bus is local.** The log says `Local Event Bus installed`. A subscriber or workflow started on one
   instance does not run on the other. Resolved for `-003` by the Q6 answer: it runs with `MEDUSA_REDIS=1`, so the bus is
   shared. The unset run (extra E1) keeps this risk.
6. **Search seeding runs on the first instance only.** The second instance logged no `[Search]` lines (§4.1). Under H3 the
   second backend starts only after the first passes health (§5.4), so the fresh-database seeding race does not apply to
   harness starts. It remains only for starts outside the harness, which were not tried.
7. **Zombies and pid liveness.** Stop by port, not pid (§4.4, §5.5).
8. **Inherited `PORT`.** `startSecondBackend` sets `PORT` explicitly (§5.4). A shell `PORT` would otherwise move the first
   backend.
9. **Harness refuses to start when a backend is already healthy.** `onAlreadyHealthy` (`medusa.adapter.ts` line 1017)
   does not re-read `MEDUSA_REDIS` or `MEDUSA_LOCK`. A stale backend keeps its old lock. H3 must say so, or `-002` needs a
   `down` first.

### 6.3 Reference numbers (from the Task 3 plan, not re-measured here)

- `medusa-smoke` job (`main` run `39829474241`): 17 min 36 s, race step 16 min 01 s at 50 trials, job timeout 45 min.
- That is the baseline; the budget for Phase 3 is the 35 min left after the 10 min margin.

### 6.4 Contradictions with the roadmap

| #   | Roadmap says                                                                                             | Probe shows                                                                                                                                             | Effect                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| C1  | Harness `v0.2.11` (Task 8 "Main risks", the header)                                                      | `package.json` and the lock pin **v0.2.12** (`09c30048…`). The pin moved in `420f6a0` ("pin qa-portfolio-harness v0.2.12 for the twenty seed exports"). | This report reads v0.2.12. The roadmap's version is stale.                             |
| C2  | `MEDUSA_REDIS=1` gives a Redis lock for `-002` (Task 8 item 2 asks whether it registers `locking-redis`) | **It does not.** The log says `Using "in-memory" as default` in both modes.                                                                             | `-002` needs H3's lock switch (§5.6). This adds H3 scope; it does not change P6 scope. |
| C3  | `@medusajs/locking-redis` "installed in the starter's `node_modules`"                                    | Only in the pnpm virtual store, pulled in by `@medusajs/medusa`. Not linked in `apps/backend/node_modules`. Bare `require.resolve` fails.               | H3 must use `@medusajs/medusa/locking-redis` (resolves).                               |
| C4  | Probe uses `ss` (implied by the port checks)                                                             | `ss` is not installed on this VM.                                                                                                                       | Used `lsof` and `/proc/net/tcp`. A tool gap, not a scope change.                       |

Nothing else in the roadmap's Task 8 contradicts the probe. The ports (9000, Redis 6380, same `DATABASE_URL`), the
Medusa start (`apps/backend/.medusa/server`, `MEDUSA_BASE_URL`, optional Redis, a gitignored runtime `medusa-config.js`)
and the starter's empty `medusa-config.ts` are all as the roadmap describes.

### 6.5 Proposed extras (not in scope until accepted)

- **E1.** Run `-003` with `MEDUSA_REDIS` unset as well (per-process event bus). The main `-003` run uses `MEDUSA_REDIS=1`
  (Q6 answer), so E1 shows whether the event bus changes the result.
- **E2.** A cross-instance token check: sign in on one instance and call an authenticated route on the other. The two share
  `JWT_SECRET`, so it should pass. It is a cheap smoke test for the shared-state claim.

### 6.6 Open questions, with proposed answers

| Q   | Question                                                                                    | Proposed answer                                                                                                                                                                    | Who decides                                             |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Q1  | Does `-002` keep "Redis lock" (the roadmap's name)?                                         | **Answer (owner): yes.** `-002` keeps the Redis lock, gated on `MEDUSA_LOCK=redis` and the Phase 3 probe. If H3 cannot wire the lock, it is a harness gap, not a product result.   | Owner, answered in review.                              |
| Q2  | Is `MEDUSA_SECOND_BASE_URL` set by default?                                                 | No. Env only; 9001 is the example. A silent second backend in other stacks would be a surprise.                                                                                    | Decided here (routine).                                 |
| Q3  | Should `down` stop a second backend whose pid file is missing but whose port is open?       | Only listeners whose argv or cwd is in `productRoot` are reaped; anything else throws and nothing is killed (§5.5).                                                                | Decided here (routine; matches today's base-port rule). |
| Q4  | Does H3 set `PORT` explicitly for both backends?                                            | Yes (§5.4).                                                                                                                                                                        | Decided here (routine).                                 |
| Q5  | Who measures memory under race load, and where?                                             | Phase 3 records VmRSS during a race, on the runner, before any runner figure is quoted.                                                                                            | Decided here (routine).                                 |
| Q6  | Does `-003` run with `MEDUSA_REDIS` unset (per-process event bus) or set?                   | **Answer (owner): set.** `-003` runs with `MEDUSA_REDIS=1` and `MEDUSA_LOCK=memory`, so `-002` and `-003` differ only in the lock provider. The unset run stays optional extra E1. | Owner, answered in review.                              |
| Q7  | Does Medusa register `@medusajs/medusa/locking-redis` from the array-style `modules` entry? | Unknown until the Phase 3 probe. Expected yes, given the three Redis entries already work the same way.                                                                            | Phase 3 probe (not a question for the owner).           |

## 7. Decisions made in this task (with reasons)

- **D-T8-1.** Ran both modes (`up` with and without `MEDUSA_REDIS=1`), each with the second backend, because the spec asks
  for the lock provider and memory per mode.
- **D-T8-2.** Did not edit the built `medusa-config.js` to test a Redis lock. The harness rewrites it on every `up`, and
  testing a config change is a Phase 3 probe, not this read-only probe.
- **D-T8-3.** Shared-state proof uses reads only. A write through the second backend would make this a write probe.
- **D-T8-4.** `lsof` and `/proc/net/tcp` replace the missing `ss`. Results are the same: no listeners.
- **D-T8-5.** Stopped the probe-only backend with `kill -TERM` before `down`, as the probe rules require. So the
  "second backend survives `down`" case stays "the live probe must confirm".

## 8. Self-check (rule 20, and deviations)

### 8.1 (a) Roadmap "Done when"

- Ports: met (§4.1). Lock provider per mode: met (§4.2), with the Redis-lock gap as a finding. Memory: met as VM proof
  (§4.3); runner figure is "the live probe in Phase 3 must confirm". Down and cleanup: clean path live (§4.4); the
  survival case is listed as "the live probe must confirm". H3 input spec: met (§5). Harness version pinned: v0.2.12
  (§0). README lists `P6-MED-RACE-002/003` first in Phase 3: done in the second commit.
- **Gaps** (listed in §6.6 and §4.4): runner memory, the second-backend survival case, and the lock wiring.

### 8.2 (b) Grep check of every named file and function

Every existing name below was grepped in this session, with its line in the pinned package (`node_modules/qa-portfolio-harness/src`):

- `config.ts` `MEDUSA_BASE_URL` (line 38). `adapters/medusa-env.ts` `MEDUSA_DEFAULT_PORT` (11), `medusaListen` (98),
  `parseMedusaHarnessSwitches` (146), `medusaBuiltServerConfigPath` (225), `renderServerMedusaConfigJs` (235).
- `adapters/medusa.adapter.ts` `logFile` (121), `startBackend` (879), `stopBackend` (929), `up` (954), `down` (1088),
  `reapProductListeners` (731), `waitForPortClosed` (778), `isPortOpen` (761), `writeRuntimeMedusaConfig` (415),
  `backendStartCwd` (873).
- `adapters/medusa-backend-pid.ts` `MEDUSA_BACKEND_PID_BASENAME` (8), `writeMedusaPid` (97), `writeMedusaBackendPid` (109),
  `stopMedusaPidFile` (160), `stopMedusaBackendFromPidFile` (212).
- `internal/spawn-detached.ts` `spawnLogged` (28), `isPidRunning` (107).
- Medusa: `@medusajs/cli` `dist/create-cli.js` line 467 (`PORT`); `@medusajs/medusa` `dist/modules/locking-redis.js` and
  `dist/modules/locking.js` (the shims).

NEW (not in the pinned package; planned for H3): `MEDUSA_SECOND_BASE_URL`, `MEDUSA_LOCK`, `startSecondBackend`,
`stopSecondBackend`, `writeMedusaBackend2Pid`, `stopMedusaBackend2FromPidFile`, `MEDUSA_BACKEND_2_PID_BASENAME`.

Names in P6 that a Phase 3 race uses: `src/races/fire-together.ts`, `src/medusa/admin.ts`, `src/medusa/store.ts`,
`src/oracles/pg.ts`. These are the ones the Task 3 probe imported. Phase 3 re-greps them.

### 8.3 (c) CI time

No CI change, no CI run added. The Phase 3 estimate is out of scope here; the reference and the budget are in §6.2 item 4
and §6.3.

### 8.4 (d) Code skeletons and commands

- H3 skeletons: §5.3 to §5.6 (every new function and the env names).
- Commands for this task: `npm run check` on the branch, before the plan edit: exit 0, 452 unit tests pass.
  After the plan and README commits, `npm run check` is run again before the push (result recorded in the chat report).
- Commit list: (1) this plan; (2) the README change. `git add` by path only.

### 8.5 (e) Owner answers

Owner answers, from the review of PR #48, recorded as given: **Q1** (yes, `-002` keeps the Redis lock, gated on
`MEDUSA_LOCK=redis` and the Phase 3 probe) and **Q6** (`-003` runs with `MEDUSA_REDIS=1` and `MEDUSA_LOCK=memory`; the
unset run is extra E1). No other owner answer was given. Q2 to Q5 and Q7 remain as labelled in §6.6.

## 9. Closeout notes

- **Merge SHA.** Not merged yet. The owner merges (rule 6). Fill this in before the merge.
- **Findings.** (1) No Redis lock in either mode; H3 needs `MEDUSA_LOCK` (C2). (2) The Redis-lock package is only in the pnpm
  store (C3). (3) Two backends share the DB and, in Redis mode, the Redis (§4.1, §4.2). (4) Idle memory ≈ 675 MiB and
  ≈ 765 MiB for two backends, VM proof only. (5) Zombie processes after `down`: stop by port (§4.4).
- **Deviations.** Harness v0.2.12, not v0.2.11 (C1). `ss` not installed; `lsof` used (C4). The clean-path `down` was run
  live; the survival case is left to Phase 3.
- **Rule slips.** None known at the time of writing. Fill in before the merge if any are found.
