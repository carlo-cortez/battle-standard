export type BattleFormat = "Singles" | "Doubles";
export type SyncState = "local" | "syncing" | "synced" | "error";

export interface PokemonBuild {
  id: string;
  name: string;
  maxHp?: number;
  ability: string;
  item: string;
  moves: string[];
  role: string;
  notes: string;
}

export interface TeamSets {
  Singles: PokemonBuild[];
  Doubles: PokemonBuild[];
}

export interface MatchSetupState {
  id: string;
  format: BattleFormat;
  opponentTeam: string;
  selectedTeam: string[];
  expectedLead: string;
  preview?: TeamPreviewRecommendation;
  formatDrafts?: Partial<Record<BattleFormat, MatchFormatDraft>>;
  status: "active" | "complete";
}

export interface MatchFormatDraft {
  opponentTeam: string;
  selectedTeam: string[];
  expectedLead: string;
  preview?: TeamPreviewRecommendation;
}

export interface ActivePokemon {
  name: string;
  hp: number;
  currentHp?: number;
  maxHp?: number;
  lastMove?: string;
  replacement?: string;
  status: string;
  moves: string[];
}

export interface TeamStatusEntry {
  name: string;
  state: "Active" | "Bench" | "Fainted";
  condition: "Healthy" | "Burn" | "Paralysis" | "Poison" | "Sleep" | "Frozen";
  moves?: string[];
  maxHp?: number;
}

export interface TurnRestrictions {
  choiceLock: boolean;
  focusSash: boolean;
  fakeOutUsed: boolean;
  protectUnavailable: boolean;
  status: string;
}

export interface TurnState {
  id: string;
  updatedAt?: string;
  turn: number;
  emergency: boolean;
  myActive: ActivePokemon[];
  opponentActive: ActivePokemon[];
  teamStatus?: TeamStatusEntry[];
  bench: string;
  weather: string;
  field: string;
  restrictions: TurnRestrictions;
  previousTurn: string;
  question: string;
  recommendation?: Recommendation;
  turnLog?: BattleTurnEntry[];
}

export interface BattleTurnEntry {
  turn: number;
  actions: string[];
  myActions?: string[];
  opponentActions?: string[];
  myActive: string[];
  opponentActive: string[];
}

export interface BattleRecord {
  id: string;
  createdAt: string;
  opponentTeam: string;
  mySelectedTeam: string;
  leadMatchup: string;
  keyEvents: string;
  result: "Win" | "Loss" | "Forfeit" | "Unknown";
  mainMistake: string;
  whatWorked: string;
  adjustment: string;
  myTeam?: string;
  myBrought?: string;
  opponentBrought?: string;
  format?: BattleFormat;
  source?: "Live Battle" | "Manual";
  turns?: BattleTurnEntry[];
}

export interface PokemonData {
  name: string;
  types: string[];
  commonMoves?: string[];
  stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number };
}

export interface MoveData {
  name: string;
  type: string;
  category: "physical" | "special" | "status";
  power: number;
  priority: number;
  target: "single" | "spread" | "self";
}

export interface DamageEstimate {
  attacker: string;
  defender: string;
  move: string;
  minPercent: number;
  maxPercent: number;
  ko: boolean;
  assumed?: boolean;
  note?: string;
}

export interface LocalAnalysis {
  damage: DamageEstimate[];
  order: string[];
  restrictions: string[];
  targeting: string[];
  assumptions: string[];
  warnings: string[];
}

export interface Recommendation {
  provider?: "Groq" | "Gemini fallback" | "Gemini" | "Groq fallback";
  actions: Array<{ pokemon: string; action: string; target: string }>;
  reason: string;
  risk: string;
  next: string;
  preservation: string;
  assumptions: string[];
}

export interface TeamPreviewRecommendation {
  provider?: "Groq" | "Gemini fallback" | "Gemini" | "Groq fallback";
  selected: Array<{ name: string; position: string; role: string; assumedMoves: string[] }>;
  leads: string[];
  gamePlan: string;
  matchupNotes: string[];
  assumptions: string[];
}
