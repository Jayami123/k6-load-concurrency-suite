// The soak thresholds per product (plan Phase 4b task 7 §6.5, Q-SOAKTHR, D5). Pure. Only a calibration PR writes an entry, from
// VALID 30-min soaks; with no entry a product reports NO THRESHOLD YET (soak/verdict.ts).

export const SOAK_PRODUCTS = ["cal", "medusa", "documenso"] as const;

export interface SoakBound {
  slopePerMin: number; // least-squares RSS slope above which the run fails (MB per minute, positive)
  plateauRatio: number; // last third over middle third above which the run fails (above 1)
}

export interface SoakBoundsFile {
  schema: 1;
  metric: string;
  unit: string;
  release: string;
  products: Partial<Record<(typeof SOAK_PRODUCTS)[number], SoakBound>>;
  notes: string[];
}

/** Validates a parsed soak-bounds file: schema 1, known products only, a positive slope and a plateau ratio above 1, both finite. */
export function parseSoakBounds(value: unknown): SoakBoundsFile {
  const t = value as SoakBoundsFile;
  if (!t || t.schema !== 1) throw new Error("soak bounds: schema must be 1");
  if (!t.products || typeof t.products !== "object")
    throw new Error("soak bounds: products must be an object");
  for (const [product, b] of Object.entries(t.products)) {
    if (!(SOAK_PRODUCTS as readonly string[]).includes(product))
      throw new Error(`soak bounds: unknown product ${product}`);
    if (!Number.isFinite(b.slopePerMin) || b.slopePerMin <= 0)
      throw new Error(`soak bounds: ${product} slopePerMin must be a finite number above 0`);
    if (!Number.isFinite(b.plateauRatio) || b.plateauRatio <= 1)
      throw new Error(`soak bounds: ${product} plateauRatio must be a finite number above 1`);
  }
  return t;
}

/** The thresholds of one product, or null when the file has no entry for it (NO THRESHOLD YET). */
export function thresholdsFor(file: SoakBoundsFile, product: string): SoakBound | null {
  return (file.products as Record<string, SoakBound | undefined>)[product] ?? null;
}
