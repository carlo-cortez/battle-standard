import { describe, expect, it } from "vitest";
import { allowedEmailsFromEnvironment, isEmailAllowed } from "./accessPolicy.js";

describe("sign-in allowlist", () => {
  it("stays open when ALLOWED_EMAILS is unset or empty", () => {
    expect(allowedEmailsFromEnvironment({})).toBeNull();
    expect(allowedEmailsFromEnvironment({ ALLOWED_EMAILS: "   " })).toBeNull();
    expect(allowedEmailsFromEnvironment({ ALLOWED_EMAILS: " , , " })).toBeNull();
    expect(isEmailAllowed("anyone@example.com", null)).toBe(true);
    expect(isEmailAllowed(null, null)).toBe(true);
  });

  it("parses and matches case-insensitively, ignoring whitespace", () => {
    const allowed = allowedEmailsFromEnvironment({ ALLOWED_EMAILS: "Friend@Example.com, other@test.dev " });
    expect(allowed).not.toBeNull();
    expect(isEmailAllowed("friend@example.com", allowed)).toBe(true);
    expect(isEmailAllowed("  OTHER@TEST.DEV  ", allowed)).toBe(true);
    expect(isEmailAllowed("stranger@example.com", allowed)).toBe(false);
  });

  it("rejects a missing email once an allowlist is configured", () => {
    const allowed = allowedEmailsFromEnvironment({ ALLOWED_EMAILS: "friend@example.com" });
    expect(isEmailAllowed(null, allowed)).toBe(false);
    expect(isEmailAllowed(undefined, allowed)).toBe(false);
    expect(isEmailAllowed("", allowed)).toBe(false);
  });
});
