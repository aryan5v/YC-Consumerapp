export type EnvName =
  | "FASTH3_URL"
  | "FASTH3_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_BASE_URL"
  | "DEEPSEEK_MODEL"
  | "TRAY_POLL_MS"
  | "TRAY_MAX_POLLS"
  | "MOCK_LATENCY_MS"
  | "EPISODE_BEATS"
  | "EPISODE_SECONDS"
  | "EPISODE_ASPECT"
  | "STYLE_IMAGE_URL"
  | "CHARACTER_SHEET_URL"
  | "VOICE_REF_URL"
  | "DIRECTOR_TIMEOUT_MS";

export function env(name: EnvName): string | undefined {
  switch (name) {
    case "FASTH3_URL":
      return process.env.FASTH3_URL;
    case "FASTH3_API_KEY":
      return process.env.FASTH3_API_KEY;
    case "DEEPSEEK_API_KEY":
      return process.env.DEEPSEEK_API_KEY;
    case "DEEPSEEK_BASE_URL":
      return process.env.DEEPSEEK_BASE_URL;
    case "DEEPSEEK_MODEL":
      return process.env.DEEPSEEK_MODEL;
    case "TRAY_POLL_MS":
      return process.env.TRAY_POLL_MS;
    case "TRAY_MAX_POLLS":
      return process.env.TRAY_MAX_POLLS;
    case "MOCK_LATENCY_MS":
      return process.env.MOCK_LATENCY_MS;
    case "EPISODE_BEATS":
      return process.env.EPISODE_BEATS;
    case "EPISODE_SECONDS":
      return process.env.EPISODE_SECONDS;
    case "EPISODE_ASPECT":
      return process.env.EPISODE_ASPECT;
    case "STYLE_IMAGE_URL":
      return process.env.STYLE_IMAGE_URL;
    case "CHARACTER_SHEET_URL":
      return process.env.CHARACTER_SHEET_URL;
    case "VOICE_REF_URL":
      return process.env.VOICE_REF_URL;
    case "DIRECTOR_TIMEOUT_MS":
      return process.env.DIRECTOR_TIMEOUT_MS;
  }
}

export function envFlag(name: EnvName): string | null {
  const raw = env(name);
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function envNumber(name: EnvName, fallback: number): number {
  const raw = envFlag(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
