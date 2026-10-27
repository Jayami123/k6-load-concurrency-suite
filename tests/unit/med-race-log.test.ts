import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRaceLog, raceOfEmail } from "../../src/load/med/raced-orders.ts";

describe("medusa race log", () => {
  it("reads the race and the HTTP status of each race request per order, and ignores other lines", () => {
    const text = [
      "INFO[0001] some other line",
      "INFO[0002] P6-MED-LOAD-009 race double-cancel order ord_01A statuses 200,400",
      "INFO[0003] P6-MED-LOAD-009 race cancel-fulfil order ord_01B statuses 200,200",
      "WARN[0004] P6-MED-LOAD-009 race double-cancel order ord_01A HTTP 400 type=invalid_data message=x",
    ].join("\n");
    const log = parseRaceLog(text);
    assert.deepEqual(log.get("ord_01A"), { race: "double-cancel", statuses: [200, 400] });
    assert.deepEqual(log.get("ord_01B"), { race: "cancel-fulfil", statuses: [200, 200] });
    assert.equal(log.size, 2);
  });

  it("a race type comes from the email's iteration: 19 is cancel-fulfil, 9 double-cancel, 8 none", () => {
    const prefix = "p6-qa-20261027t080000z-abcdef12-p6-med-load-009";
    assert.equal(raceOfEmail(`${prefix}-i19@qa.local`), "cancel-fulfil");
    assert.equal(raceOfEmail(`${prefix}-i9@qa.local`), "double-cancel");
    assert.equal(raceOfEmail(`${prefix}-i8@qa.local`), null);
    assert.equal(raceOfEmail("someone@example.com"), null);
  });
});
