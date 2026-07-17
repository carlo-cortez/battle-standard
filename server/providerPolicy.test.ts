import { describe, expect, it } from "vitest";
import { isRateLimitError, isRecoverableProviderError, shouldFallbackToGemini, shouldForceGeminiFallback } from "./providerPolicy.js";

describe("AI provider fallback policy", () => {
  it("falls back for Groq structured-output schema failures", () => {
    const error = new Error("Groq request failed (400): Generated JSON does not match the expected schema. failed_generation: jsonschema validation failed");

    expect(isRecoverableProviderError(error)).toBe(true);
    expect(shouldFallbackToGemini(error, true)).toBe(true);
  });

  it("falls back for rate limits and transient network failures", () => {
    expect(isRateLimitError(new Error("429 rate limit"))).toBe(true);
    expect(shouldFallbackToGemini(new Error("request timed out"), true)).toBe(true);
  });

  it("does not hide configuration errors or fall back without Gemini", () => {
    expect(shouldFallbackToGemini(new Error("Groq request failed (401): invalid API key"), true)).toBe(false);
    expect(shouldFallbackToGemini(new Error("failed_generation"), false)).toBe(false);
  });

  it("only forces the manual Gemini smoke path when both providers exist", () => {
    expect(shouldForceGeminiFallback({ AI_FORCE_GEMINI_FALLBACK: "true", GROQ_API_KEY: "groq", GEMINI_API_KEY: "gemini" })).toBe(true);
    expect(shouldForceGeminiFallback({ AI_FORCE_GEMINI_FALLBACK: "true", GROQ_API_KEY: "groq" })).toBe(false);
    expect(shouldForceGeminiFallback({ AI_FORCE_GEMINI_FALLBACK: "false", GROQ_API_KEY: "groq", GEMINI_API_KEY: "gemini" })).toBe(false);
  });
});
