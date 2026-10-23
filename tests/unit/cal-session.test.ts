import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractHostPassword } from "../../src/cal/session.ts";

// A fixture, not the real seed: the test checks the parser only.
const fixture = `await createUserAndEventType({\n    user: {\n      email: "pro@example.com",\n      password: "fixture-pw",\n      username: "pro",\n    },\n  });`;

describe("extractHostPassword", () => {
  it("reads the pro user password from seed text", () => {
    assert.equal(extractHostPassword(fixture), "fixture-pw");
  });

  it("throws TEST BUG when the pro user is missing", () => {
    assert.throws(
      () => extractHostPassword('email: "other@example.com", password: "x"'),
      /TEST BUG/,
    );
  });
});
