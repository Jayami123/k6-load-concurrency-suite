// Removes local Playwright and race outputs so a new run never mixes with an older one.
import { rmSync } from "node:fs";
for (const dir of ["results/playwright", "results/races"]) {
  rmSync(dir, { recursive: true, force: true });
}
