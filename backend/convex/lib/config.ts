import { envFlag, envNumber } from "./env";

export function episodeBeats(): number {
  return Math.max(2, Math.round(envNumber("EPISODE_BEATS", 7)));
}

export function episodeSeconds(): number {
  return envNumber("EPISODE_SECONDS", 5);
}

export function episodeAspect(): string {
  return envFlag("EPISODE_ASPECT") ?? "9:16";
}

export function styleImageUrl(): string {
  return envFlag("STYLE_IMAGE_URL") ?? "https://picsum.photos/seed/fork-style-bible/1080/1920";
}

export function characterSheetUrl(): string {
  return envFlag("CHARACTER_SHEET_URL") ?? "https://picsum.photos/seed/fork-character/1080/1920";
}

export function voiceRefUrl(): string {
  return envFlag("VOICE_REF_URL") ?? "https://picsum.photos/seed/fork-voice/64/64";
}

export function pollMs(): number {
  return Math.max(0, envNumber("TRAY_POLL_MS", 1200));
}

export function maxPolls(): number {
  return Math.max(1, Math.round(envNumber("TRAY_MAX_POLLS", 150)));
}

export function mockLatencyMs(): number {
  return Math.max(0, envNumber("MOCK_LATENCY_MS", 1200));
}

export function directorTimeoutMs(): number {
  return Math.max(1000, envNumber("DIRECTOR_TIMEOUT_MS", 60000));
}
