import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

const KEY = "synqui.deviceToken";
let pending: Promise<string> | null = null;

async function read() {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) return stored;
  } catch {}
  return AsyncStorage.getItem(KEY).catch(() => null);
}

async function write(token: string) {
  try {
    await SecureStore.setItemAsync(KEY, token);
    return;
  } catch {}
  await AsyncStorage.setItem(KEY, token).catch(() => {});
}

export function getDeviceToken() {
  pending ??= read().then(async (stored) => {
    if (stored) return stored;
    const token = Crypto.randomUUID();
    await write(token);
    return token;
  });
  return pending;
}

export function useDeviceToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getDeviceToken().then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return token;
}
