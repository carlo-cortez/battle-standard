import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createMatch, createTurn } from "../lib/factories";
import { switchMatchFormat } from "../lib/matchDrafts";
import { deleteRecord as removeSavedRecord, loadMatch, loadRecords, loadTeam, loadTurn, localStore, saveMatch, saveRecord, saveTeam, saveTurn } from "../lib/storage";
import type { BattleRecord, MatchSetupState, PokemonBuild, SyncState, TeamSets, TurnState } from "../types";

export function useBattleStore(user: User | null) {
  const [teams, setTeamsState] = useState<TeamSets>(localStore.loadTeam());
  const [match, setMatchState] = useState<MatchSetupState>(localStore.loadMatch() ?? createMatch());
  const [turn, setTurnState] = useState<TurnState>(() => { const saved = localStore.loadTurn(); const initial = saved ? { ...saved, updatedAt: saved.updatedAt ?? new Date().toISOString() } : createTurn(); localStore.saveTurn(initial); return initial; });
  const [records, setRecords] = useState<BattleRecord[]>(localStore.loadRecords());
  const [syncState, setSyncState] = useState<SyncState>("local");
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnSaveChain = useRef<Promise<void>>(Promise.resolve());
  const turnVersion = useRef(0);
  const userId = user?.id ?? null;

  useEffect(() => { let active = true; const startingTurnVersion = turnVersion.current; Promise.all([loadTeam(user), loadMatch(user), loadRecords(user)]).then(async ([remoteTeam, remoteMatch, remoteRecords]) => {
    if (!active) return; setTeamsState(remoteTeam); if (remoteMatch) { setMatchState(remoteMatch); const latestTurn = await loadTurn(user, remoteMatch.id); if (active && latestTurn && turnVersion.current === startingTurnVersion) setTurnState(latestTurn); } setRecords(remoteRecords); setSyncState(user ? "synced" : "local");
  }).catch(() => setSyncState("error")); return () => { active = false; }; }, [userId]);

  const run = useCallback(async (task: () => Promise<void>) => { setSyncState(user ? "syncing" : "local"); try { await task(); setSyncState(user ? "synced" : "local"); } catch { setSyncState("error"); } }, [user]);
  const team = teams[match.format];
  const setTeam = (next: PokemonBuild[]) => { const updated = { ...teams, [match.format]: next }; const nextMatch = match.preview ? { ...match, preview: undefined } : match; setTeamsState(updated); if (match.preview) setMatchState(nextMatch); void run(async () => { await saveTeam(updated, user); if (match.preview) await saveMatch(nextMatch, user); }); };
  const setMatch = (next: MatchSetupState) => { setMatchState(next); void run(() => saveMatch(next, user)); };
  const setFormat = (format: MatchSetupState["format"]) => setMatch(switchMatchFormat(match, format));
  const setTurn = (next: TurnState) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    turnVersion.current += 1;
    setTurnState(stamped); localStore.saveTurn(stamped); setSyncState(user ? "syncing" : "local");
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => void run(() => { turnSaveChain.current = turnSaveChain.current.catch(() => undefined).then(() => saveTurn(stamped, match.id, user)); return turnSaveChain.current; }), 650);
  };
  const addRecord = (record: BattleRecord) => { const next = [record, ...records]; setRecords(next); void run(() => saveRecord(record, user)); };
  const deleteRecord = (recordId: string) => { setRecords((current) => current.filter((record) => record.id !== recordId)); void run(() => removeSavedRecord(recordId, user)); };
  return { team, teams, setTeam, match, setMatch, setFormat, turn, setTurn, records, addRecord, deleteRecord, syncState };
}
