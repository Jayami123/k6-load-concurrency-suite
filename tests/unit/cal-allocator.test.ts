import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type pg from "pg";
import { createSlotAllocator } from "../../src/cal/api.ts";
import { HOST_OVERLAP_SQL, skippedEvidence, type SlotRow } from "../../src/cal/oracle.ts";

// Frozen clock: first window starts 2026-10-23T00:00Z (today + 2 d). The seed booking is the 21 Oct
// incident shape: it ends 54 s after the 09:00 slot starts.
const NOW = Date.parse("2026-10-21T10:00:00Z");
const HOST = 42;
const SEED: SlotRow = {
  id: 7,
  uid: "seedYoga",
  status: "accepted",
  start: "2026-10-29T08:30:54.000Z",
  end: "2026-10-29T09:00:54.000Z",
};

/** Answers HOST_OVERLAP_SQL the way Postgres would for the given rows (half-open overlap). */
function fakePool(rows: SlotRow[]): pg.Pool {
  return {
    query: async (sql: string, params: unknown[]) => {
      assert.equal(sql, HOST_OVERLAP_SQL);
      const [userId, from, to] = params as [number, string, string];
      assert.equal(userId, HOST);
      const f = Date.parse(`${from.replace(" ", "T")}Z`);
      const t = Date.parse(`${to.replace(" ", "T")}Z`);
      return { rows: rows.filter((r) => Date.parse(r.start) < t && Date.parse(r.end) > f) };
    },
  } as unknown as pg.Pool;
}

/** getSchedule answer: every offered slot on 2026-10-29, whatever window was asked for. */
function offer(times: string[]): void {
  const body = {
    result: { data: { json: { slots: { "2026-10-29": times.map((time) => ({ time })) } } } },
  };
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe("createSlotAllocator skips host overlaps", () => {
  beforeEach(() => {
    mock.method(Date, "now", () => NOW);
  });
  afterEach(() => {
    mock.restoreAll();
  });

  it("skips the 09:00 slot that overlaps the seed booking by 54 s and records it", async () => {
    offer(["2026-10-29T09:00:00.000Z", "2026-10-29T10:00:00.000Z"]);
    const allocator = createSlotAllocator(1, { pool: fakePool([SEED]), userId: HOST });
    const got = await allocator.next();
    assert.deepEqual(got, {
      start: "2026-10-29T10:00:00.000Z",
      end: "2026-10-29T10:30:00.000Z",
      skipped: [
        {
          slotStart: "2026-10-29T09:00:00.000Z",
          slotEnd: "2026-10-29T09:30:00.000Z",
          overlaps: [SEED],
        },
      ],
    });
    assert.equal(
      skippedEvidence(got.skipped),
      "window 2026-10-29T09:00:00.000Z..2026-10-29T09:30:00.000Z overlaps id=7 uid=seedYoga status=accepted 2026-10-29T08:30:54.000Z..2026-10-29T09:00:54.000Z",
    );
  });

  it("returns the first offered slot and skips nothing when the host has no overlap", async () => {
    offer(["2026-10-29T09:00:00.000Z", "2026-10-29T10:00:00.000Z"]);
    const allocator = createSlotAllocator(1, { pool: fakePool([]), userId: HOST });
    assert.deepEqual(await allocator.next(), {
      start: "2026-10-29T09:00:00.000Z",
      end: "2026-10-29T09:30:00.000Z",
      skipped: [],
    });
  });

  it("keeps the candidate when the overlap read fails once, and offers it on the next call", async () => {
    offer(["2026-10-29T10:00:00.000Z"]);
    let reads = 0;
    const flaky = {
      query: async () => {
        reads += 1;
        if (reads === 1) throw new Error("connection reset");
        return { rows: [] };
      },
    } as unknown as pg.Pool;
    const allocator = createSlotAllocator(1, { pool: flaky, userId: HOST });
    await assert.rejects(allocator.next(), /connection reset/);
    assert.deepEqual(await allocator.next(), {
      start: "2026-10-29T10:00:00.000Z",
      end: "2026-10-29T10:30:00.000Z",
      skipped: [],
    });
    assert.equal(reads, 2);
  });

  it("never offers a skipped slot again, so a later call reports no skip for it", async () => {
    offer(["2026-10-29T09:00:00.000Z", "2026-10-29T10:00:00.000Z", "2026-10-29T11:00:00.000Z"]);
    const allocator = createSlotAllocator(1, { pool: fakePool([SEED]), userId: HOST });
    assert.equal((await allocator.next()).start, "2026-10-29T10:00:00.000Z");
    assert.deepEqual(await allocator.next(), {
      start: "2026-10-29T11:00:00.000Z",
      end: "2026-10-29T11:30:00.000Z",
      skipped: [],
    });
  });
});
