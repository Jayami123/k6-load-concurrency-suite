// Lost update join (P6-TW-LOAD-004, Twenty plan §6, plan Task 4 §Oracles). Pure: the intents and the final rows are passed
// in, nothing is read here. Variant A: two serialized writers on different fields of one record. Variant B: read-modify-write
// increments on one field; the loss is the deficit between the acknowledged increments and the observed final value.

export type Variant = "A" | "B";
export type LostUpdateVerdict = "PASS" | "FINDING" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";

/** One write attempt as the k6 case logs it (`TW004` lines). status 0 = timed out; ambiguous = status 0 or 5xx. */
export interface WriteIntent {
  intentId: string;
  variant: Variant;
  recordId: string;
  field: "employees" | "name";
  writer: string;
  stage: number;
  readValue: string | null; // variant B only: the value read before the increment
  value: string; // what the PATCH wrote
  readMs: number | null; // variant B only: when the GET was sent
  sentMs: number;
  ackMs: number;
  status: number;
  ambiguous: boolean;
}

/** The record as read back after the run. initialEmployees is what setup wrote (not an intent). */
export interface FinalRow {
  recordId: string;
  employees: string | null;
  name: string | null;
  initialEmployees: string | null;
}

export interface RecordLoss {
  recordId: string;
  stage: number;
  acked: number; // acknowledged increments on this record
  ambiguous: number; // timed-out or 5xx attempts
  observed: number; // final - initial
  lostLower: number; // max(0, acked - observed)
  lostUpper: number; // max(0, acked + ambiguous - observed)
}

export interface StageLoss {
  stage: number;
  acked: number;
  lostLower: number;
  lossRate: number;
  verdict: LostUpdateVerdict; // INCONCLUSIVE when the stage has no acknowledged increment
}

export interface LostField {
  recordId: string;
  field: "employees" | "name";
  lastAckedIntentId: string;
  lastAckedValue: string;
  finalValue: string | null;
}

export interface JoinResult {
  variant: Variant;
  duplicates: number; // intents with an intentId already seen
  acked: number; // acknowledged writes of this variant
  lostA: number; // variant A: fields whose final value is not the last acknowledged write
  ambiguousA: number; // variant A: finals equal to a later ambiguous write (not a loss)
  lostFields: LostField[]; // variant A evidence
  records: RecordLoss[]; // variant B
  stageLoss: StageLoss[]; // variant B
  overlapWindows: number; // variant B: pairs of attempts from different writers whose [readMs, ackMs] windows overlap
  verdict: LostUpdateVerdict;
  verdictReason: string;
}

const isAcked = (i: WriteIntent) => !i.ambiguous && i.status >= 200 && i.status < 300;

/** Keeps the first copy of each intentId. Pure. */
export function dedupeIntents(intents: WriteIntent[]): {
  kept: WriteIntent[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const kept: WriteIntent[] = [];
  let duplicates = 0;
  for (const intent of intents) {
    if (seen.has(intent.intentId)) {
      duplicates += 1;
      continue;
    }
    seen.add(intent.intentId);
    kept.push(intent);
  }
  return { kept, duplicates };
}

/** lossRate = lostLower / acked, 0 when acked is 0 (never a division by zero). Pure. */
export function lossRate(lostLower: number, acked: number): number {
  return acked === 0 ? 0 : lostLower / acked;
}

/** Pairs of variant B attempts on one record from different writers whose [readMs, ackMs] windows overlap. Pure. */
export function countOverlapWindows(intents: WriteIntent[]): number {
  const byRecord = new Map<string, WriteIntent[]>();
  for (const i of intents) {
    if (i.variant !== "B" || i.readMs === null) continue;
    const list = byRecord.get(i.recordId) ?? [];
    list.push(i);
    byRecord.set(i.recordId, list);
  }
  let pairs = 0;
  for (const list of byRecord.values()) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const x = list[a]!;
        const y = list[b]!;
        if (x.writer === y.writer) continue;
        if (x.readMs! < y.ackMs && y.readMs! < x.ackMs) pairs += 1;
      }
    }
  }
  return pairs;
}

/**
 * Variant A. Per (record, field): the last acknowledged write (by sentMs) is the expected final value. A final that differs is
 * a lost write, unless it equals a later ambiguous write (then the ambiguous write applied: counted in ambiguousA, not lostA).
 * A field with no acknowledged write is not checked. Pure.
 */
export function joinVariantA(intents: WriteIntent[], finals: FinalRow[]): JoinResult {
  const { kept, duplicates } = dedupeIntents(intents);
  const writes = kept.filter((i) => i.variant === "A");
  const finalOf = new Map(finals.map((f) => [f.recordId, f]));
  const groups = new Map<string, WriteIntent[]>();
  for (const w of writes) {
    const key = `${w.recordId}|${w.field}`;
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  let acked = 0;
  let lostA = 0;
  let ambiguousA = 0;
  const lostFields: LostField[] = [];
  for (const group of groups.values()) {
    const ackedWrites = group.filter(isAcked).sort((a, b) => a.sentMs - b.sentMs);
    acked += ackedWrites.length;
    const last = ackedWrites[ackedWrites.length - 1];
    if (!last) continue;
    const recordId = last.recordId;
    const field = last.field;
    const final = finalOf.get(recordId);
    const finalValue = final ? (final[field] ?? null) : null;
    if (finalValue === last.value) continue;
    const laterAmbiguous = group.some(
      (w) => w.ambiguous && w.sentMs > last.sentMs && w.value === finalValue,
    );
    if (laterAmbiguous) {
      ambiguousA += 1;
      continue;
    }
    lostA += 1;
    lostFields.push({
      recordId,
      field,
      lastAckedIntentId: last.intentId,
      lastAckedValue: last.value,
      finalValue,
    });
  }
  const verdict: LostUpdateVerdict =
    acked === 0 ? "INCONCLUSIVE" : lostA > 0 ? "PRODUCT_BUG_SUSPECTED" : "PASS";
  const verdictReason =
    verdict === "PRODUCT_BUG_SUSPECTED"
      ? `lost write on ${lostFields.length} field(s): ${lostFields
          .map((f) => `${f.recordId}.${f.field} last acked ${f.lastAckedIntentId}`)
          .join("; ")}`
      : verdict === "INCONCLUSIVE"
        ? "no acknowledged variant A write"
        : "every field keeps its last acknowledged write";
  return {
    variant: "A",
    duplicates,
    acked,
    lostA,
    ambiguousA,
    lostFields,
    records: [],
    stageLoss: [],
    overlapWindows: 0,
    verdict,
    verdictReason,
  };
}

/**
 * Variant B. Per record: observed = final - initial. lostLower = max(0, acked - observed) is the loss that certainly happened;
 * lostUpper = max(0, acked + ambiguous - observed) adds the timed-out attempts that may not have applied. A value outside
 * [0, acked + ambiguous] is impossible under the model: a TEST BUG (thrown, no verdict). Pure.
 */
export function joinVariantB(intents: WriteIntent[], finals: FinalRow[]): JoinResult {
  const { kept, duplicates } = dedupeIntents(intents);
  const writes = kept.filter((i) => i.variant === "B");
  const finalOf = new Map(finals.map((f) => [f.recordId, f]));
  const byRecord = new Map<string, WriteIntent[]>();
  for (const w of writes) byRecord.set(w.recordId, [...(byRecord.get(w.recordId) ?? []), w]);

  const records: RecordLoss[] = [];
  for (const [recordId, list] of byRecord) {
    const final = finalOf.get(recordId);
    if (!final || final.employees === null || final.initialEmployees === null) {
      throw new Error(`TEST BUG: variant B record ${recordId} has no final or initial value`);
    }
    const acked = list.filter(isAcked).length;
    const ambiguous = list.filter((w) => w.ambiguous).length;
    const observed = Number(final.employees) - Number(final.initialEmployees);
    if (!Number.isInteger(observed) || observed < 0 || observed > acked + ambiguous) {
      throw new Error(
        `TEST BUG: infeasible final value on ${recordId}: observed ${observed}, acked ${acked}, ambiguous ${ambiguous}`,
      );
    }
    records.push({
      recordId,
      stage: list[0]!.stage,
      acked,
      ambiguous,
      observed,
      lostLower: Math.max(0, acked - observed),
      lostUpper: Math.max(0, acked + ambiguous - observed),
    });
  }

  const stages = [...new Set(records.map((r) => r.stage))].sort((a, b) => a - b);
  const stageLoss: StageLoss[] = stages.map((stage) => {
    const rows = records.filter((r) => r.stage === stage);
    const acked = rows.reduce((sum, r) => sum + r.acked, 0);
    const lostLower = rows.reduce((sum, r) => sum + r.lostLower, 0);
    return {
      stage,
      acked,
      lostLower,
      lossRate: lossRate(lostLower, acked),
      verdict: acked === 0 ? "INCONCLUSIVE" : lostLower > 0 ? "FINDING" : "PASS",
    };
  });

  const acked = records.reduce((sum, r) => sum + r.acked, 0);
  const lostLower = records.reduce((sum, r) => sum + r.lostLower, 0);
  const overlapWindows = countOverlapWindows(writes);
  const verdict: LostUpdateVerdict =
    lostLower > 0 ? "FINDING" : acked > 0 ? "PASS" : "INCONCLUSIVE";
  const verdictReason =
    verdict === "FINDING"
      ? `silent lost update, read-modify-write: lostLower ${lostLower} over ${acked} acknowledged increments`
      : verdict === "PASS"
        ? overlapWindows === 0
          ? "no lost increment; no contention reached (no overlapping attempts)"
          : `no lost increment; ${overlapWindows} overlapping attempt pair(s)`
        : "no acknowledged variant B increment";
  return {
    variant: "B",
    duplicates,
    acked,
    lostA: 0,
    ambiguousA: 0,
    lostFields: [],
    records,
    stageLoss,
    overlapWindows,
    verdict,
    verdictReason,
  };
}
