import { envFlag, envNumber } from "./env";

export const TTS_MODEL = "gpt-4o-mini-tts-2025-12-15";
export const STT_MODEL = "gpt-transcribe";

const VOICES = [
  "marin", "cedar", "onyx", "fable", "ash", "echo", "sage", "ballad",
  "coral", "alloy", "verse", "nova", "shimmer",
];

export function openaiConfigured(): boolean {
  return envFlag("OPENAI_API_KEY") !== null;
}

export function ttsModel(): string {
  return envFlag("OPENAI_TTS_MODEL") ?? TTS_MODEL;
}

export function sttModel(): string {
  return envFlag("OPENAI_STT_MODEL") ?? STT_MODEL;
}

export function voiceFor(characterName: string): string {
  let hash = 2166136261;
  for (let i = 0; i < characterName.length; i += 1) {
    hash ^= characterName.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return VOICES[Math.abs(hash) % VOICES.length];
}

function apiKey(): string {
  const key = envFlag("OPENAI_API_KEY");
  if (key === null) throw new Error("OPENAI_API_KEY is not set on this deployment");
  return key;
}

function baseUrl(): string {
  return (envFlag("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
}

export async function synthesize(args: { text: string; voice: string; instructions?: string }): Promise<Blob> {
  return (await synthesizeWithModel(args)).audio;
}

export async function synthesizeWithModel(args: { text: string; voice: string; instructions?: string }): Promise<{ audio: Blob; model: string }> {
  const primary = ttsModel();
  const fallback = envFlag("OPENAI_TTS_FALLBACK_MODEL") ?? "gpt-4o-mini-tts";
  for (const [index, model] of [...new Set([primary, fallback])].entries()) {
    try {
      return { audio: await requestSpeech(args, model), model };
    } catch (error) {
      if (index === 1 || primary === fallback) throw error;
    }
  }
  throw new Error("speech generation failed");
}

async function requestSpeech(args: { text: string; voice: string; instructions?: string }, model: string): Promise<Blob> {
  const voice = args.voice.trim() === "" ? "marin" : args.voice.trim();
  const body: Record<string, unknown> = {
    model,
    voice,
    input: args.text,
    response_format: "mp3",
  };
  if (args.instructions !== undefined && args.instructions.trim() !== "") {
    body.instructions = args.instructions.trim().slice(0, 800);
  }
  const res = await fetch(`${baseUrl()}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(envNumber("OPENAI_TIMEOUT_MS", 60000)),
  });
  if (!res.ok) {
    throw new Error(`openai speech ${res.status}`);
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("openai speech returned no audio");
  return blob;
}

export function extensionFor(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("flac")) return "flac";
  return "m4a";
}

export async function transcribe(blob: Blob, hint: string): Promise<string> {
  return (await transcribeWithModel(blob, hint)).text;
}

export async function transcribeWithModel(blob: Blob, hint: string): Promise<{ text: string; model: string }> {
  const primary = sttModel();
  const fallback = envFlag("OPENAI_STT_FALLBACK_MODEL") ?? "gpt-4o-transcribe";
  for (const [index, model] of [...new Set([primary, fallback])].entries()) {
    try {
      return { text: await requestTranscript(blob, hint, model), model };
    } catch (error) {
      if (index === 1 || primary === fallback) throw error;
    }
  }
  throw new Error("transcription failed");
}

async function requestTranscript(blob: Blob, hint: string, model: string): Promise<string> {
  const extension = extensionFor(blob.type === "" ? hint : blob.type);
  const fileName = `recording.${extension}`;
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("model", model);
  form.append("response_format", "json");
  const res = await fetch(`${baseUrl()}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}` },
    body: form,
    signal: AbortSignal.timeout(envNumber("OPENAI_TIMEOUT_MS", 60000)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`openai transcription ${res.status}`);
  const parsed = JSON.parse(text) as { text?: unknown };
  if (typeof parsed.text !== "string") throw new Error("openai transcription returned no text");
  return parsed.text.trim();
}
