import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { BattleRecord, MatchSetupState, PokemonBuild, TeamSets, TurnState } from "../types";

const keys = { team: "battle-standard:team", match: "battle-standard:match", turn: "battle-standard:turn", records: "battle-standard:records" };
const read = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; } };
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const asTeamSets = (value: PokemonBuild[] | TeamSets | null | undefined): TeamSets => Array.isArray(value) ? { Singles: value, Doubles: [] } : { Singles: value?.Singles ?? [], Doubles: value?.Doubles ?? [] };

const userId = (user: User | null) => { if (!user) throw new Error("Sign in to sync across devices."); return user.id; };

export const localStore = {
  loadTeam: () => asTeamSets(read<PokemonBuild[] | TeamSets>(keys.team, [])), saveTeam: (teams: TeamSets) => write(keys.team, teams),
  loadMatch: () => read<MatchSetupState | null>(keys.match, null), saveMatch: (match: MatchSetupState) => write(keys.match, match),
  loadTurn: () => read<TurnState | null>(keys.turn, null), saveTurn: (turn: TurnState) => write(keys.turn, turn),
  loadRecords: () => read<BattleRecord[]>(keys.records, []), saveRecords: (records: BattleRecord[]) => write(keys.records, records),
};

export async function loadTeam(user: User | null): Promise<TeamSets> {
  if (!supabase || !user) return localStore.loadTeam();
  const { data, error } = await supabase.from("teams").select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error; const value = asTeamSets(data?.data as PokemonBuild[] | TeamSets | undefined ?? localStore.loadTeam()); localStore.saveTeam(value); return value;
}
export async function saveTeam(teams: TeamSets, user: User | null) {
  localStore.saveTeam(teams); if (!supabase || !user) return;
  const { error } = await supabase.from("teams").upsert({ user_id: userId(user), data: teams, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); if (error) throw error;
}
export async function loadMatch(user: User | null): Promise<MatchSetupState | null> {
  if (!supabase || !user) return localStore.loadMatch();
  const { data, error } = await supabase.from("matches").select("data").eq("user_id", user.id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error; const value = (data?.data as MatchSetupState | undefined) ?? localStore.loadMatch(); if (value) localStore.saveMatch(value); return value;
}
export async function saveMatch(match: MatchSetupState, user: User | null) {
  localStore.saveMatch(match); if (!supabase || !user) return;
  const { error } = await supabase.from("matches").upsert({ id: match.id, user_id: userId(user), status: match.status, data: match, updated_at: new Date().toISOString() }); if (error) throw error;
}
export async function loadTurn(user: User | null, matchId?: string): Promise<TurnState | null> {
  if (!supabase || !user || !matchId) return localStore.loadTurn();
  const { data, error } = await supabase.from("battle_turns").select("data").eq("user_id", user.id).eq("match_id", matchId).order("turn_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error; const value = (data?.data as TurnState | undefined) ?? localStore.loadTurn(); if (value) localStore.saveTurn(value); return value;
}
export async function saveTurn(turn: TurnState, matchId: string, user: User | null) {
  localStore.saveTurn(turn); if (!supabase || !user) return;
  const { error } = await supabase.from("battle_turns").upsert({ id: turn.id, user_id: userId(user), match_id: matchId, turn_number: turn.turn, data: turn, synced_at: new Date().toISOString() }, { onConflict: "match_id,turn_number" }); if (error) throw error;
}
export async function loadRecords(user: User | null): Promise<BattleRecord[]> {
  if (!supabase || !user) return localStore.loadRecords();
  const { data, error } = await supabase.from("battle_history").select("data").eq("user_id", user.id).order("created_at", { ascending: false }); if (error) throw error;
  const value = data?.map((row) => row.data as BattleRecord) ?? []; localStore.saveRecords(value); return value;
}
export async function saveRecord(record: BattleRecord, user: User | null) {
  const records = [record, ...localStore.loadRecords().filter((entry) => entry.id !== record.id)]; localStore.saveRecords(records); if (!supabase || !user) return;
  const { error } = await supabase.from("battle_history").upsert({ id: record.id, user_id: userId(user), data: record, created_at: record.createdAt }); if (error) throw error;
}
