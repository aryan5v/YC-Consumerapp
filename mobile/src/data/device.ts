import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

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
