// The gate of P6-CAL-LOAD-010 (Phase 4 Task 6 §6.7): the case needs the journey to call reserveSlot, and the probe found that the Cal
// journey calls getSchedule and POST /api/book/event only. The gate records that failure with its evidence; the case stays in "Later".

/**
 * @param files the text of the files under k6/journeys and k6/cases, by path
 * @returns passes true only when some file calls reserveSlot
 */
export function reserveSlotGate(files: Record<string, string>): {
  passes: boolean;
  evidence: string;
} {
  const hit = Object.keys(files).find((f) => files[f]?.includes("reserveSlot"));
  return hit
    ? { passes: true, evidence: `reserveSlot is called in ${hit}` }
    : {
        passes: false,
        evidence: "the Cal journey calls getSchedule and POST /api/book/event only",
      };
}
