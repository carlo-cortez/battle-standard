const normalized = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const parseExpectedLead = (value: string) => value
  .split(/\s*\+\s*|\r?\n/)
  .map((name) => name.trim())
  .filter(Boolean);

export const serializeExpectedLead = (names: string[]) => names.map((name) => name.trim()).filter(Boolean).join(" + ");

export const duplicateMoveNames = (moves: string[]) => {
  const values = moves.map((move) => move.trim()).filter(Boolean);
  return [...new Map(values.filter((move, index) => values.findIndex((candidate) => normalized(candidate) === normalized(move)) !== index).map((move) => [normalized(move), move])).values()];
};

export const uniqueMoveSlots = (moves: string[], size = 4) => {
  const seen = new Set<string>();
  const unique = moves.map((move) => move.trim()).filter((move) => {
    if (!move) return false;
    const key = normalized(move);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Array.from({ length: size }, (_, index) => unique[index] ?? "");
};
