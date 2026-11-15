export type EnvName =
  | "FASTH3_URL"
  | "FASTH3_URLS"
  | "FASTH3_API_KEY"
  | "FASTH3_MODEL"
  | "FASTH3_TASK"
  | "FASTH3_SHORT_EDGE"
  | "FASTH3_CONTINUITY_VIDEO"
  | "FASTH3_SUBMIT_TIMEOUT_MS"
  | "DETECT_URL"
  | "DETECT_API_KEY"
  | "SEGMENT_URL"
  | "SEGMENT_API_KEY"
  | "CUSTOM_RUNS_PER_HOUR"
  | "OBJECTS_PER_BEAT"
  | "ACTIONS_PER_OBJECT"
  | "DIRECTOR_PROVIDER"
  | "DIRECTOR_BASE_URL"
  | "DIRECTOR_MODEL"
  | "DIRECTOR_API_KEY"
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
  | "DIRECTOR_TIMEOUT_MS"
  | "KEIKI_API_KEY"
  | "KEIKI_AGENT_ID"
  | "KEIKI_AGENT_NAME"
  | "KEIKI_LINE"
  | "KEIKI_TOOL_SECRET"
  | "KEIKI_BASE_URL"
  | "KEIKI_OUTBOUND"
  | "OPENAI_API_KEY"
  | "OPENAI_TTS_MODEL"
  | "OPENAI_STT_MODEL"
  | "OPENAI_BASE_URL"
  | "OPENAI_TIMEOUT_MS"
  | "HELD_CLIP_URL"
  | "MAX_ACTIVE_RUNS"
  | "ACTIVE_RUN_TTL_MS"
  | "IDLE_RUN_TTL_MS"
  | "STUCK_CLIP_MS"
  | "SPEECH_ATTEMPTS_PER_BEAT"
  | "MAX_UPLOAD_BYTES"
  | "DEMO_CACHE"
  | "DEMO_DATE"
  | "DEMO_DEPTH";

export function env(name: EnvName): string | undefined {
  switch (name) {
    case "FASTH3_URL":
      return process.env.FASTH3_URL;
    case "FASTH3_URLS":
      return process.env.FASTH3_URLS;
    case "FASTH3_API_KEY":
      return process.env.FASTH3_API_KEY;
    case "FASTH3_MODEL":
      return process.env.FASTH3_MODEL;
    case "FASTH3_TASK":
      return process.env.FASTH3_TASK;
    case "FASTH3_SHORT_EDGE":
      return process.env.FASTH3_SHORT_EDGE;
    case "FASTH3_CONTINUITY_VIDEO":
      return process.env.FASTH3_CONTINUITY_VIDEO;
    case "FASTH3_SUBMIT_TIMEOUT_MS":
      return process.env.FASTH3_SUBMIT_TIMEOUT_MS;
    case "DETECT_URL":
      return process.env.DETECT_URL;
    case "DETECT_API_KEY":
      return process.env.DETECT_API_KEY;
    case "SEGMENT_URL":
      return process.env.SEGMENT_URL;
    case "SEGMENT_API_KEY":
      return process.env.SEGMENT_API_KEY;
    case "CUSTOM_RUNS_PER_HOUR":
      return process.env.CUSTOM_RUNS_PER_HOUR;
    case "OBJECTS_PER_BEAT":
      return process.env.OBJECTS_PER_BEAT;
    case "ACTIONS_PER_OBJECT":
      return process.env.ACTIONS_PER_OBJECT;
    case "DIRECTOR_PROVIDER":
      return process.env.DIRECTOR_PROVIDER;
    case "DIRECTOR_BASE_URL":
      return process.env.DIRECTOR_BASE_URL;
    case "DIRECTOR_MODEL":
      return process.env.DIRECTOR_MODEL;
    case "DIRECTOR_API_KEY":
      return process.env.DIRECTOR_API_KEY;
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
    case "KEIKI_API_KEY":
      return process.env.KEIKI_API_KEY;
    case "KEIKI_AGENT_ID":
      return process.env.KEIKI_AGENT_ID;
    case "KEIKI_AGENT_NAME":
      return process.env.KEIKI_AGENT_NAME;
    case "KEIKI_LINE":
      return process.env.KEIKI_LINE;
    case "KEIKI_TOOL_SECRET":
      return process.env.KEIKI_TOOL_SECRET;
    case "KEIKI_BASE_URL":
      return process.env.KEIKI_BASE_URL;
    case "KEIKI_OUTBOUND":
      return process.env.KEIKI_OUTBOUND;
    case "OPENAI_API_KEY":
      return process.env.OPENAI_API_KEY;
    case "OPENAI_TTS_MODEL":
      return process.env.OPENAI_TTS_MODEL;
    case "OPENAI_STT_MODEL":
      return process.env.OPENAI_STT_MODEL;
    case "OPENAI_BASE_URL":
      return process.env.OPENAI_BASE_URL;
    case "OPENAI_TIMEOUT_MS":
      return process.env.OPENAI_TIMEOUT_MS;
    case "HELD_CLIP_URL":
      return process.env.HELD_CLIP_URL;
    case "MAX_ACTIVE_RUNS":
      return process.env.MAX_ACTIVE_RUNS;
    case "ACTIVE_RUN_TTL_MS":
      return process.env.ACTIVE_RUN_TTL_MS;
    case "IDLE_RUN_TTL_MS":
      return process.env.IDLE_RUN_TTL_MS;
    case "STUCK_CLIP_MS":
      return process.env.STUCK_CLIP_MS;
    case "SPEECH_ATTEMPTS_PER_BEAT":
      return process.env.SPEECH_ATTEMPTS_PER_BEAT;
    case "MAX_UPLOAD_BYTES":
      return process.env.MAX_UPLOAD_BYTES;
    case "DEMO_CACHE":
      return process.env.DEMO_CACHE;
    case "DEMO_DATE":
      return process.env.DEMO_DATE;
    case "DEMO_DEPTH":
      return process.env.DEMO_DEPTH;
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
