import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySignin, signinPayload } from "../../src/documenso/signin.ts";

const INVALID_CREDENTIALS = '{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}';
const INVALID_REQUEST = '{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}';
const ZOD_400 =
  '{"data":{"email":"a@example.com","password":"abc"},"error":[{"code":"too_small","path":["password"],"message":"Must be at least 6 characters in length"}],"success":false}';

describe("signinPayload", () => {
  it("sends exactly email, password and csrfToken", () => {
    assert.deepEqual(signinPayload({ email: "a@example.com", password: "p", csrfToken: "t" }), {
      email: "a@example.com",
      password: "p",
      csrfToken: "t",
    });
  });
});

describe("classifySignin", () => {
  it("201 is success with no code", () => {
    assert.deepEqual(classifySignin(201, ""), { kind: "success", code: null });
  });
  it("500 INVALID_CREDENTIALS is bad-credentials", () => {
    assert.deepEqual(classifySignin(500, INVALID_CREDENTIALS), {
      kind: "bad-credentials",
      code: "INVALID_CREDENTIALS",
    });
  });
  it("500 INVALID_REQUEST is bad-csrf", () => {
    assert.deepEqual(classifySignin(500, INVALID_REQUEST), {
      kind: "bad-csrf",
      code: "INVALID_REQUEST",
    });
  });
  it("400 with a zod issue list is validation", () => {
    assert.deepEqual(classifySignin(400, ZOD_400), { kind: "validation", code: null });
  });
  it("500 with a non-JSON body is server-error with no code", () => {
    assert.deepEqual(classifySignin(500, "<html>boom</html>"), {
      kind: "server-error",
      code: null,
    });
  });
  it("201 with an INVALID_CREDENTIALS body is still success (a success never passes the guard as bad-credentials)", () => {
    assert.deepEqual(classifySignin(201, INVALID_CREDENTIALS), { kind: "success", code: null });
  });
  it("never reports success for 4xx or 5xx", () => {
    for (const status of [400, 401, 403, 500]) {
      assert.notEqual(classifySignin(status, INVALID_CREDENTIALS).kind, "success");
    }
  });
});
