import { directorKey, deepseekJSON, directorMode, parseJSONObject } from "./deepseek";
import { episodeAspect, episodeBeats, episodeSeconds, characterSheetUrl, styleImageUrl, voiceRefUrl } from "./config";
import { STYLE_BIBLE } from "./style";
import { voiceFor } from "./openai";

export const MAX_CUSTOM_PROMPT = 240;

const REFUSALS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(child|kid|minor|underage|schoolgirl|schoolboy)\b/i, reason: "minors" },
  { pattern: /\b(nude|naked|nsfw|porn|sexual|erotic|fetish)\b/i, reason: "sexual content" },
  { pattern: /\b(gore|dismember|behead|torture|mutilat)\w*\b/i, reason: "graphic violence" },
  { pattern: /\b(kill|murder|stab|shoot|bomb|explosive|weapon|gun|rifle)\w*\b/i, reason: "violence or weapons" },
  { pattern: /\b(suicide|self[- ]?harm|cutting myself)\b/i, reason: "self-harm" },
  { pattern: /\b(nazi|swastika|genocide|lynch)\b/i, reason: "hate" },
  { pattern: /\b(heroin|cocaine|meth|fentanyl)\b/i, reason: "drugs" },
];

export type CustomPrompt = { ok: true; prompt: string } | { ok: false; message: string };

const SOFT_NO =
  "I can't build that one. Try a place, a time of day and one thing you want to find — a floating market above the clouds at dawn, a workshop under a harbour at midnight.";

export function sanitizeCustomPrompt(raw: string): CustomPrompt {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean.length < 8) {
    return { ok: false, message: "Give me a little more: a place, a time of day, and one thing out of place." };
  }
  if (clean.length > MAX_CUSTOM_PROMPT) {
    return { ok: false, message: `Keep the description under ${MAX_CUSTOM_PROMPT} characters.` };
  }
  for (const rule of REFUSALS) {
    if (rule.pattern.test(clean)) return { ok: false, message: SOFT_NO };
  }
  return { ok: true, prompt: clean };
}

export type CustomSeed = {
  title: string;
  tagline: string;
  premise: string;
  character: { name: string; voice: string };
};

export function defaultCustomSeed(prompt: string): CustomSeed {
  const words = prompt.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const title = words.slice(0, 4).join(" ") || "A New Place";
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    tagline: prompt.length <= 90 ? prompt : `${prompt.slice(0, 87)}...`,
    premise: prompt,
    character: {
      name: "the keeper of this place",
      voice: "Calm, curious, speaks in short plain sentences.",
    },
  };
}

// The episode seed the player's own description grows into: setting, mood, one recurring
// character and a goal. Falls back to the description itself when the model is unavailable.
export async function writeCustomSeed(prompt: string): Promise<CustomSeed> {
  const fallback = defaultCustomSeed(prompt);
  if (directorMode() === "fixture" || directorKey() === null) return fallback;
  try {
    const raw = await deepseekJSON(
      [
        {
          role: "system",
          content: [
            "You are the showrunner of Synqui, a daily interactive live-action video story.",
            "A player has described a world they want to step into. Turn it into one episode seed.",
            "Write for an ultra-realistic live-action look: real places, real materials, daylight or golden hour, one clear protagonist and simple physical actions.",
            "No text or signage in frame, no crowds, no fantasy renders.",
            "Reply with one JSON object and nothing else.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `The player's description: "${prompt}"`,
            "",
            "Return:",
            '{"title": "three to five words", "tagline": "one short line for the home card, under 60 characters",',
            ' "premise": "three or four sentences: the place, the time of day, the light, the mood, and the one thing that is out of place",',
            ' "character": {"name": "a short concrete name, like the ferryman of the cloud sea", "voice": "one line describing how they speak"}}',
          ].join("\n"),
        },
      ],
      800,
    );
    const parsed = parseJSONObject(raw) as {
      title?: unknown;
      tagline?: unknown;
      premise?: unknown;
      character?: { name?: unknown; voice?: unknown };
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 60) : fallback.title;
    const tagline = typeof parsed.tagline === "string" ? parsed.tagline.trim().slice(0, 90) : fallback.tagline;
    const premise = typeof parsed.premise === "string" ? parsed.premise.trim().slice(0, 600) : fallback.premise;
    const name =
      typeof parsed.character?.name === "string" && parsed.character.name.trim() !== ""
        ? parsed.character.name.trim().slice(0, 60)
        : fallback.character.name;
    const voice =
      typeof parsed.character?.voice === "string" && parsed.character.voice.trim() !== ""
        ? parsed.character.voice.trim().slice(0, 200)
        : fallback.character.voice;
    if (title === "" || premise === "") return fallback;
    return { title, tagline: tagline === "" ? fallback.tagline : tagline, premise, character: { name, voice } };
  } catch {
    return fallback;
  }
}

function hashString(raw: string): number {
  let hash = 0;
  for (const character of raw) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return hash;
}

export function customEpisodeRow(seed: CustomSeed) {
  const slug = (seed.title || "custom").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 24);
  return {
    date: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    dayIndex: 0,
    seed: Math.abs(hashString(`${seed.title}:${seed.premise}`)) % 100000,
    title: seed.title,
    tagline: seed.tagline,
    premise: seed.premise,
    character: seed.character,
    voiceId: voiceFor(seed.character.name),
    styleBible: STYLE_BIBLE,
    styleImageUrl: styleImageUrl(),
    characterSheetUrl: characterSheetUrl(),
    voiceRefUrl: voiceRefUrl(),
    posterUrl: `https://picsum.photos/seed/${slug === "" ? "custom" : slug}/1080/1920`,
    beatsTotal: episodeBeats(),
    aspect: episodeAspect(),
    seconds: episodeSeconds(),
    createdAt: Date.now(),
  };
}
