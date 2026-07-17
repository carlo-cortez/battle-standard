import type { BattleFormat, MatchFormatDraft, MatchSetupState } from "../types";

const draftOf = (match: MatchSetupState): MatchFormatDraft => ({
  opponentTeam: match.opponentTeam,
  selectedTeam: match.selectedTeam,
  expectedLead: match.expectedLead,
  preview: match.preview,
});

const emptyDraft = (): MatchFormatDraft => ({ opponentTeam: "", selectedTeam: [], expectedLead: "" });

export const switchMatchFormat = (match: MatchSetupState, format: BattleFormat): MatchSetupState => {
  if (match.format === format) return match;
  const formatDrafts = { ...match.formatDrafts, [match.format]: draftOf(match) };
  const target = formatDrafts[format] ?? emptyDraft();
  return { ...match, format, ...target, formatDrafts };
};
