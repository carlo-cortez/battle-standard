// Optional sign-in allowlist. When ALLOWED_EMAILS is set, only those addresses
// may call the AI endpoints; everyone else is authenticated but forbidden (403).
// When it is unset or empty the app stays open to any signed-in user, so adding
// the variable is opt-in and cannot lock an existing deployment out by accident.

export const allowedEmailsFromEnvironment = (environment: NodeJS.ProcessEnv): Set<string> | null => {
  const raw = environment.ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  const emails = raw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return emails.length ? new Set(emails) : null;
};

export const isEmailAllowed = (email: string | null | undefined, allowed: Set<string> | null): boolean => {
  if (!allowed) return true;
  if (!email) return false;
  return allowed.has(email.trim().toLowerCase());
};
