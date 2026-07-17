const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const isRateLimitError = (error: unknown) =>
  /quota|resource.?exhausted|rate.?limit|429/i.test(errorMessage(error));

export const isRecoverableProviderError = (error: unknown) =>
  /timed?\s*out|timeout|abort|fetch failed|network|econn|socket|502|503|504|failed_generation|generated json|jsonschema|expected schema|does not (?:match|validate)/i.test(errorMessage(error));

export const shouldFallbackToGemini = (error: unknown, geminiConfigured: boolean) =>
  geminiConfigured && (isRateLimitError(error) || isRecoverableProviderError(error));

export const shouldForceGeminiFallback = (environment: NodeJS.ProcessEnv) =>
  environment.AI_FORCE_GEMINI_FALLBACK === "true" && Boolean(environment.GROQ_API_KEY) && Boolean(environment.GEMINI_API_KEY);
