import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export type Settings = { voice: boolean; microphone: boolean };

const KEY = "fork.settings";
let settings: Settings = { voice: true, microphone: true };
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((stored) => {
    if (!stored) return;
    settings = { ...settings, ...JSON.parse(stored) };
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
