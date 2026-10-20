import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error -- plain .mjs module without types
import { chooseDocumensoNode } from "../../scripts/lib/documenso-node.mjs";

describe("chooseDocumensoNode", () => {
  it("uses the current Node when it is 24 or newer", () => {
    assert.deepEqual(
      chooseDocumensoNode({ currentVersion: "24.21.0", home: "/opt/node24", exists: () => false }),
      { kind: "current" },
    );
  });
  it("switches to the home binary under Node 22", () => {
    assert.deepEqual(
      chooseDocumensoNode({ currentVersion: "22.23.3", home: "/opt/node24/", exists: () => true }),
      {
        kind: "home",
        node: "/opt/node24/bin/node",
        binDir: "/opt/node24/bin",
      },
    );
  });
  it("reports an ENV error when no Node 24 exists", () => {
    const r = chooseDocumensoNode({
      currentVersion: "22.23.3",
      home: "/opt/node24",
      exists: () => false,
    });
    assert.equal(r.kind, "missing");
    assert.match(r.message, /^ENV: Documenso needs Node 24/);
  });
});
