/** Database size in bytes of the run's own database. NEW: pg_database_size is not read anywhere on main (checked). */
export const DB_SIZE_SQL = `SELECT pg_database_size(current_database())::bigint AS bytes`;

/**
 * Bytes added per unit of work (order, booking or document) between two reads. null when units is 0 (L7: no divide by zero).
 * The result is reported next to the RSS slope and never added to it.
 */
export function dbGrowthPerUnit(
  bytesStart: number,
  bytesEnd: number,
  units: number,
): { bytesPerUnit: number | null; reason: "ok" | "no units" } {
  if (units === 0) return { bytesPerUnit: null, reason: "no units" };
  return { bytesPerUnit: (bytesEnd - bytesStart) / units, reason: "ok" };
}
