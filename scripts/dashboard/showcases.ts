// The three showcases of the site and the README (plan Phase 4b task 13 §6.4). The notes come from src/dashboard/site-model.ts.
import { showcaseNote, type ShowcaseId } from "../../src/dashboard/site-model.ts";

export const SHOWCASE_IDS: readonly ShowcaseId[] = ["knee", "soak", "two-instance"];

/** The showcase title shown above each note. */
export const SHOWCASE_TITLES: Record<ShowcaseId, string> = {
  knee: "Knee chart with the first saturated resource",
  soak: "Soak leak check",
  "two-instance": "Two-instance Medusa conservation",
};

export function showcaseNotes(): Array<{ id: ShowcaseId; title: string; note: string }> {
  return SHOWCASE_IDS.map((id) => ({ id, title: SHOWCASE_TITLES[id], note: showcaseNote(id) }));
}
