import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createMatch, createTurn } from "../lib/factories";
import { loadMatch, loadRecords, loadTeam, loadTurn, localStore, saveMatch, saveRecord, saveTeam, saveTurn } from "../lib/storage";
import type { BattleRecord, MatchSetupState, PokemonBuild, SyncState, TeamSets, TurnState } from "../types";

export function useBattleStore(user: User | null) {
  const [teams, setTeamsState] = useState<TeamSets>(localStore.loadTeam());
  const [match, setMatchState] = useState<MatchSetupState>(localStore.loadMatch() ?? createMatch());
  const [turn, setTurnState] = useState<TurnState>(localStore.loadTurn() ?? createTurn());
  const [records, setRecords] = useState<BattleRecord[]>(localStore.loadRecords());
  const [syncState, setSyncState] = useState<SyncState>("local");
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnVersion = useRef(0);

  useEffect(() => { let active = true; const startingTurnVersion = turnVersion.current; Promise.all([loadTeam(user), loadMatch(user), loadRecords(user)]).then(async ([remoteTeam, remoteMatch, remoteRecords]) => {
    if (!active) return; setTeamsState(remoteTeam); if (remoteMatch) { setMatchState(remoteMatch); const latestTurn = await loadTurn(user, remoteMatch.id); if (active && latestTurn && turnVersion.current === startingTurnVersion) setTurnState(latestTurn); } setRecords(remoteRecords); setSyncState(user ? "synced" : "local");
  }).catch(() => setSyncState("error")); return () => { active = false; }; }, [user]);

  const run = useCallback(async (task: () => Promise<void>) => { setSyncState(user ? "syncing" : "local"); try { await task(); setSyncState(user ? "synced" : "local"); } catch { setSyncState("error"); } }, [user]);
  const team = teams[match.format];
  const setTeam = (next: PokemonBuild[]) => { const updated = { ...teams, [match.format]: next }; const nextMatch = match.preview ? { ...match, preview: undefined } : match; setTeamsState(updated); if (match.preview) setMatchState(nextMatch); void run(async () => { await saveTeam(updated, user); if (match.preview) await saveMatch(nextMatch, user); }); };
  const setMatch = (next: MatchSetupState) => { setMatchState(next); void run(() => saveMatch(next, user)); };
  const setTurn = (next: TurnState) => {
    turnVersion.current += 1;
    setTurnState(next); localStore.saveTurn(next); setSyncState(user ? "syncing" : "local");
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => void run(() => saveTurn(next, match.id, user)), 650);
  };
  const addRecord = (record: BattleRecord) => { const next = [record, ...records]; setRecords(next); void run(() => saveRecord(record, user)); };
  return { team, teams, setTeam, match, setMatch, turn, setTurn, records, addRecord, syncState };
}
