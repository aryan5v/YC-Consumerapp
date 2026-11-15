import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

const KEY = "fork.deviceToken";
let pending: Promise<string> | null = null;

export function getDeviceToken() {
  pending ??= SecureStore.getItemAsync(KEY).then(async (stored) => {
    if (stored) return stored;
    const token = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, token);
    return token;
  });
  return pending;
}

export function useDeviceToken() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    getDeviceToken().then(
      (value) => { if (active) setToken(value); },
      (reason) => { if (active) setError(reason instanceof Error ? reason : new Error("Unable to load device identity")); },
    );
    return () => { active = false; };
  }, []);
  if (error) throw error;
  return token;
}
