import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export type Settings = { voice: boolean; microphone: boolean; demo: boolean };

const KEY = "fork.settings";
let settings: Settings = { voice: true, microphone: true, demo: false };
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((stored) => {
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return;
    for (const key of Object.keys(settings) as (keyof Settings)[]) {
      if (typeof parsed[key] === "boolean") settings = { ...settings, [key]: parsed[key] };
    }
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function setSetting(key: keyof Settings, value: boolean) {
  settings = { ...settings, [key]: value };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => settings,
  );
}
