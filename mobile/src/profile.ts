import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export type CaseRecord = { runId: string; solved: boolean; movesUsed: number; movesTotal: number; at: number };
export type Profile = { name: string; results: CaseRecord[] };

const KEY = "synqui.profile";
let profile: Profile = { name: "Detective", results: [] };
const listeners = new Set<() => void>();

const save = () => {
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(profile)).catch(() => {});
};

AsyncStorage.getItem(KEY)
  .then((stored) => {
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed || typeof parsed !== "object") return;
    profile = {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : profile.name,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function setName(name: string) {
  profile = { ...profile, name: name.trim() || "Detective" };
  save();
}

export function recordResult(runId: string, result: { solved: boolean; movesUsed: number; movesTotal: number }) {
  if (profile.results.some((r) => r.runId === runId)) return;
  profile = { ...profile, results: [...profile.results, { runId, ...result, at: Date.now() }] };
  save();
}

export function useProfile() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => profile,
  );
}
