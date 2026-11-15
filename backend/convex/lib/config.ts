import { envFlag, envNumber } from "./env";
import { STOCK_MP4S } from "./stock";

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

export function heldClipUrl(): string {
  return envFlag("HELD_CLIP_URL") ?? STOCK_MP4S[0];
}

export function maxActiveRuns(): number {
  return Math.max(1, Math.round(envNumber("MAX_ACTIVE_RUNS", 12)));
}

export function activeRunTtlMs(): number {
  return Math.max(60_000, envNumber("ACTIVE_RUN_TTL_MS", 45 * 60_000));
}

export function speechAttemptsPerBeat(): number {
  return Math.max(1, Math.round(envNumber("SPEECH_ATTEMPTS_PER_BEAT", 4)));
}

export function maxUploadBytes(): number {
  return Math.max(64_000, envNumber("MAX_UPLOAD_BYTES", 4_000_000));
}

export function directorTimeoutMs(): number {
  return Math.max(1000, envNumber("DIRECTOR_TIMEOUT_MS", 60000));
}
