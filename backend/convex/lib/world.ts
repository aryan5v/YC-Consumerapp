import { episodeAspect, episodeSeconds, pollMs, maxPolls } from "./config";
import { envFlag, sleep } from "./env";
import { deepseekJSON, directorKey, parseJSONObject } from "./deepseek";
import { instanceForSeed, trayCancel, trayDownload, trayGenerate, trayGetJob, trayMode } from "./tray";
import { inlineConditions, uniserveModel, uniserveTask, v1BaseUrl } from "./trayUniserve";

export const SLOTS = ["lighthouse", "arch", "boat", "cabin", "lantern", "well", "stranger"] as const;
export type Slot = (typeof SLOTS)[number];
export type Weather = "clear" | "cloudy" | "mist" | "rain" | "snow";
export const WEATHERS: Weather[] = ["clear", "cloudy", "mist", "rain", "snow"];

export const REWIND_HOURS = 0.5;
export const NO_CHANGE_REASON = "no change";

export const DEFAULT_CAST = {
  name: "Mira",
  look: "a woman in her thirties, lean build, dark hair tied back, a faded blue wool coat and grey boots, a thin scar through her left eyebrow",
  voice: "quiet and dry, never explains more than she has to",
};

export const DEFAULT_LANDMARKS: Landmark[] = [
  { slot: "lighthouse", name: "Lighthouse", description: "A white tower on the headland, with birds circling the lamp." },
  { slot: "arch", name: "Stone arch", description: "A worn arch standing alone where the path bends." },
  { slot: "boat", name: "Rowboat", description: "A small boat pulled up on the shore, oars still in it." },
  { slot: "cabin", name: "Cabin", description: "A dark cabin with a thin line of smoke from the chimney." },
  { slot: "lantern", name: "Lantern", description: "A lantern on a post, swinging a little in the wind." },
  { slot: "well", name: "Well", description: "A stone well with a rope and a still bucket." },
  { slot: "stranger", name: "Stranger", description: "A cloaked figure standing where the path meets the grass." },
];

export const CINEMATIC_PROFILE =
  "Photorealistic, natural skin and fabric texture, real materials, physically plausible light, soft natural contrast, shallow to medium depth of field, no stylisation and no painterly or animated look. Colour is natural and restrained: cool pearl highlights, deep blue-green shadows, and at most one small warm coral-rose accent. Vertical portrait, one camera move with small amplitude at slow speed, no shake and no fast moves. One or two figures at most, hands doing one simple thing, no crowds. Never legible text, logos, screens, extra limbs or fingers, gore, or a real person's name or likeness.";

export type Palette = {
  sky: string;
  fog: string;
  ground: string;
  water: string;
  accentLight: string;
};

export type ConfigurePalette = {
  sky?: string;
  fog?: string;
  ground?: string;
  water?: string;
  accentLight?: string;
};

export type Landmark = { slot: Slot; name: string; description: string };

export type Change = {
  lit?: boolean;
  doorOpen?: boolean;
  gone?: boolean;
  position?: { x?: number; y?: number; z?: number };
};

export type Clock = { day: number; timeOfDay: number };

export type Configure = {
  timeOfDay: number;
  weather: Weather;
  palette: ConfigurePalette;
  mood: string;
  landmarks: Landmark[];
  transitionMs: number;
};

export type DirectResult = {
  configure: Configure;
  transitionMs: number;
  narration: string;
  reason: string;
  weatherChanged: boolean;
  day: number;
};

export type Continuation = {
  narration: string;
  spokenLine: string;
  action: string;
  change: Change;
};

const PALETTE_KEYS = ["sky", "fog", "ground", "water", "accentLight"] as const;
const MOOD_MAX = 160;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

export function thingCap(): number {
  return positiveInt(process.env.WORLD_THING_PER_MINUTE, 3);
}

export function deviceCap(): number {
  return positiveInt(process.env.WORLD_DEVICE_CONCURRENT, 2);
}

export function deployCap(): number {
  return positiveInt(process.env.WORLD_DEPLOY_CONCURRENT, 4);
}

export function weatherCooldownMs(): number {
  return positiveInt(process.env.WORLD_WEATHER_COOLDOWN_MS, 120_000);
}

export function promptMax(): number {
  return positiveInt(process.env.WORLD_PROMPT_MAX, 400);
}

export function thingWindowMs(): number {
  return positiveInt(process.env.WORLD_THING_WINDOW_MS, 60_000);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}

export function normalizeWeather(value: unknown): Weather | null {
  if (value === "fair") return "clear";
  if (typeof value !== "string") return null;
  return WEATHERS.includes(value as Weather) ? (value as Weather) : null;
}

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (match === null) return null;
  const hex = match[1];
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  return `#${full.toLowerCase()}`;
}

export function paletteOrNull(value: unknown): Palette | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length === 0) return null;
  const palette = {} as Palette;
  for (const key of PALETTE_KEYS) {
    const hex = normalizeHex(row[key]);
    if (hex === null) return null;
    palette[key] = hex;
  }
  return palette;
}

export function paletteOut(palette: Palette | null): ConfigurePalette {
  if (palette === null) return {};
  return {
    sky: palette.sky,
    fog: palette.fog,
    ground: palette.ground,
    water: palette.water,
    accentLight: palette.accentLight,
  };
}

export function clampMood(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MOOD_MAX);
}

export function clampHours(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const wrapped = ((value % 24) + 24) % 24;
  return Math.round(wrapped * 1000) / 1000;
}

export function clampDay(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const day = Math.floor(value);
  if (day < 1) return null;
  return day;
}

export function clockMove(current: Clock, next: Clock): "same" | "forward" | "rewind" | "back" {
  const delta = next.day * 24 + next.timeOfDay - (current.day * 24 + current.timeOfDay);
  if (Math.abs(delta) < 0.01) return "same";
  if (delta > 0) return "forward";
  if (delta >= -REWIND_HOURS) return "rewind";
  return "back";
}

export function slotOf(thingId: string, name: string): Slot | null {
  const hay = `${thingId} ${name}`.toLowerCase();
  const ordered = [...SLOTS].sort((left, right) => right.length - left.length);
  for (const slot of ordered) {
    if (hay.includes(slot)) return slot;
  }
  return null;
}

export function landmarksOrDefault(value: unknown): Landmark[] {
  const parsed = parseLandmarks(value);
  if (parsed === null) return DEFAULT_LANDMARKS.map((entry) => ({ ...entry }));
  return parsed;
}

export function parseLandmarks(value: unknown): Landmark[] | null {
  if (!Array.isArray(value)) return null;
  const bySlot = new Map<Slot, Landmark>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.slot !== "string" || !SLOTS.includes(row.slot as Slot)) continue;
    const slot = row.slot as Slot;
    const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    const description =
      typeof row.description === "string" ? row.description.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX) : "";
    if (name === "") continue;
    bySlot.set(slot, { slot, name, description });
  }
  if (bySlot.size !== SLOTS.length) return null;
  return SLOTS.map((slot) => bySlot.get(slot) as Landmark);
}

export function mergeLandmarks(current: Landmark[], proposal: unknown): Landmark[] {
  if (!Array.isArray(proposal)) return current.map((entry) => ({ ...entry }));
  const next = new Map(current.map((entry) => [entry.slot, { ...entry }]));
  for (const entry of proposal) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.slot !== "string" || !SLOTS.includes(row.slot as Slot)) continue;
    const slot = row.slot as Slot;
    const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    const description =
      typeof row.description === "string" ? row.description.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX) : "";
    if (name === "" || unsafeText(name) || unsafeText(description)) continue;
    const existing = next.get(slot);
    next.set(slot, { slot, name, description: description === "" ? (existing?.description ?? "") : description });
  }
  return SLOTS.map((slot) => next.get(slot) as Landmark);
}

export function seedFor(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash) % 100_000;
  return seed === 0 ? 8741 : seed;
}

export function clipSeed(worldSeed: number, thingId: string): number {
  return Math.abs((worldSeed + seedFor(thingId)) % 1_000_000_000);
}

const UNSAFE =
  /\b(nude|naked|porn|nsfw|sex|gore|dismember|suicide|kill yourself|child porn|underage)\b/i;

export function unsafeText(value: string): boolean {
  return UNSAFE.test(value);
}

export function softenDream(prompt: string): { ok: true; prompt: string } | { ok: false; message: string } {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length > promptMax()) {
    throw new Error("keep the dream under 400 characters");
  }
  if (trimmed === "") throw new Error("describe the shore you want to walk");
  if (unsafeText(trimmed)) {
    return { ok: false, message: "Let's keep this shore gentle. I dreamed a quiet coast instead." };
  }
  return { ok: true, prompt: trimmed };
}

export type ClientClock = Clock & {
  weather: Weather;
  palette: Palette | null;
  mood: string;
};

export function echoConfigure(current: ClientClock, landmarks: Landmark[], transitionMs: number): Configure {
  return {
    timeOfDay: current.timeOfDay,
    weather: current.weather,
    palette: paletteOut(current.palette),
    mood: clampMood(current.mood),
    landmarks: landmarks.map((entry) => ({ ...entry })),
    transitionMs,
  };
}

export function noChange(current: ClientClock, landmarks: Landmark[]): DirectResult {
  const configure = echoConfigure(current, landmarks, 0);
  return {
    configure,
    transitionMs: 0,
    narration: "",
    reason: NO_CHANGE_REASON,
    weatherChanged: false,
    day: current.day,
  };
}

export function decideDirect(args: {
  failed: boolean;
  now: number;
  lastWeatherChangeAt: number | null;
  current: ClientClock;
  landmarks: Landmark[];
  proposal: unknown;
}): DirectResult {
  if (args.failed || args.proposal === null || typeof args.proposal !== "object") {
    return noChange(args.current, args.landmarks);
  }
  const row = args.proposal as Record<string, unknown>;
  let timeOfDay = args.current.timeOfDay;
  let day = args.current.day;
  const proposedDay = clampDay(row.day);
  const dayCandidate =
    proposedDay !== null && proposedDay >= args.current.day && proposedDay <= args.current.day + 1
      ? proposedDay
      : args.current.day;
  const proposedHour = clampHours(row.timeOfDay);
  if (proposedHour !== null) {
    const move = clockMove(args.current, { day: dayCandidate, timeOfDay: proposedHour });
    if (move === "forward" || move === "rewind") {
      timeOfDay = proposedHour;
      day = dayCandidate;
    }
  }
  let weather = args.current.weather;
  let weatherChanged = false;
  const proposedWeather = normalizeWeather(row.weather);
  const cooled =
    args.lastWeatherChangeAt !== null && args.now - args.lastWeatherChangeAt < weatherCooldownMs();
  if (proposedWeather !== null && proposedWeather !== args.current.weather && !cooled) {
    weather = proposedWeather;
    weatherChanged = true;
  }
  const proposedPalette = paletteOrNull(row.palette);
  const palette = proposedPalette ?? args.current.palette;
  const landmarks = mergeLandmarks(args.landmarks, row.landmarks);
  const timeChanged = timeOfDay !== args.current.timeOfDay || day !== args.current.day;
  const paletteChanged = JSON.stringify(paletteOut(palette)) !== JSON.stringify(paletteOut(args.current.palette));
  const namesChanged = JSON.stringify(landmarks) !== JSON.stringify(args.landmarks);
  const changed = timeChanged || weatherChanged || paletteChanged || namesChanged;
  const transitionMs = changed ? clampTransition(row.transitionMs) : 0;
  const narration = shortText(row.narration, 180);
  const reason = shortText(row.reason, 200);
  const configure = echoConfigure(
    { ...args.current, timeOfDay, weather, palette, mood: args.current.mood },
    landmarks,
    transitionMs,
  );
  if (!changed) {
    return {
      configure,
      transitionMs: 0,
      narration: "",
      reason: reason === "" ? NO_CHANGE_REASON : reason,
      weatherChanged: false,
      day: args.current.day,
    };
  }
  return {
    configure,
    transitionMs,
    narration,
    reason: reason === "" ? "the shore shifts" : reason,
    weatherChanged,
    day,
  };
}

function clampTransition(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 1800;
  return Math.min(120_000, Math.max(400, Math.round(parsed)));
}

function shortText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function directMessages(args: {
  current: ClientClock;
  day: number;
  event: "enter" | "interact" | "tick";
  landmarks: Landmark[];
  notes: string[];
  lastWeatherChangeAt: number | null;
  now: number;
}): { role: "system" | "user"; content: string }[] {
  const since =
    args.lastWeatherChangeAt === null ? "never" : `${Math.round((args.now - args.lastWeatherChangeAt) / 1000)}s ago`;
  return [
    {
      role: "system",
      content: [
        "You direct the weather and the clock of a walkable coast for the sake of the story.",
        "Return one JSON object. Omit a field you are not changing.",
        "weather is only clear, cloudy, mist, rain or snow. Change it rarely, at most once every two minutes.",
        "timeOfDay is hours from 0 to 24. It may move forward, or back by at most half an hour. Never jump further back.",
        "day may stay or increase, never decrease.",
        "palette colours are #rrggbb. landmarks.slot is only lighthouse, arch, boat, cabin, lantern, well or stranger.",
        "Do not invent a mood. The mood you are given must be returned unchanged, or omitted.",
        "narration is one short sentence or empty. reason is one short sentence. transitionMs is 400 to 120000.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        event: args.event,
        timeOfDay: args.current.timeOfDay,
        day: args.day,
        weather: args.current.weather,
        palette: paletteOut(args.current.palette),
        mood: args.current.mood,
        landmarks: args.landmarks,
        notes: args.notes.slice(-4),
        lastWeatherChange: since,
      }),
    },
  ];
}

export async function askDirect(args: Parameters<typeof directMessages>[0]): Promise<DirectResult> {
  if (directorKey() === null) return noChange(args.current, args.landmarks);
  try {
    const raw = await deepseekJSON(directMessages(args), 700);
    return decideDirect({
      failed: false,
      now: args.now,
      lastWeatherChangeAt: args.lastWeatherChangeAt,
      current: args.current,
      landmarks: args.landmarks,
      proposal: parseJSONObject(raw),
    });
  } catch {
    return noChange(args.current, args.landmarks);
  }
}

export type DescribeResult = {
  seed: number;
  timeOfDay: number;
  palette: Palette;
  weather: Weather;
  landmarks: Landmark[];
  mood: string;
  message: string | null;
  castName: string;
  castLook: string;
  castVoice: string;
};

export function describeDefaults(prompt: string, message: string | null): DescribeResult {
  return {
    seed: seedFor(prompt === "" ? "quiet-coast" : prompt),
    timeOfDay: 18.5,
    palette: {
      sky: "#1c3e4a",
      fog: "#c5d0d4",
      ground: "#3d5c4e",
      water: "#0e2c36",
      accentLight: "#ff8e9e",
    },
    weather: "mist",
    landmarks: DEFAULT_LANDMARKS.map((entry) => ({ ...entry })),
    mood: message === null ? clampMood(prompt) : "",
    message,
    castName: DEFAULT_CAST.name,
    castLook: DEFAULT_CAST.look,
    castVoice: DEFAULT_CAST.voice,
  };
}

export function parseDescribe(prompt: string, raw: unknown): DescribeResult | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const timeOfDay = clampHours(row.timeOfDay);
  const weather = normalizeWeather(row.weather);
  const palette = paletteOrNull(row.palette);
  const landmarks = parseLandmarks(row.landmarks);
  if (timeOfDay === null || weather === null || palette === null || landmarks === null) return null;
  const look = shortText(row.characterLook, 280);
  const name = shortText(row.characterName, 40);
  return {
    seed: seedFor(prompt),
    timeOfDay,
    palette,
    weather,
    landmarks,
    mood: clampMood(prompt),
    message: null,
    castName: name === "" || unsafeText(name) ? DEFAULT_CAST.name : name,
    castLook: look === "" || unsafeText(look) ? DEFAULT_CAST.look : look,
    castVoice: DEFAULT_CAST.voice,
  };
}

export function describeMessages(prompt: string): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "Turn a short dream into a walkable coast. Return one JSON object with timeOfDay, weather, palette, landmarks, characterName and characterLook.",
        "palette must include sky, fog, ground, water and accentLight as #rrggbb.",
        "weather is clear, cloudy, mist, rain or snow.",
        "landmarks must list every slot exactly once: lighthouse, arch, boat, cabin, lantern, well, stranger. name up to 60 characters, description up to 280.",
        "characterLook is age, build, hair, clothing with colours, and one distinguishing feature. No real person's name or likeness.",
        "Soften anything harsh into a gentle shore. Do not repeat unsafe details.",
      ].join(" "),
    },
    { role: "user", content: prompt },
  ];
}

export async function askDescribe(prompt: string): Promise<DescribeResult> {
  const softened = softenDream(prompt);
  if (!softened.ok) return describeDefaults(softened.message, softened.message);
  if (directorKey() === null) return describeDefaults(softened.prompt, null);
  try {
    const raw = await deepseekJSON(describeMessages(softened.prompt), 900);
    return parseDescribe(softened.prompt, parseJSONObject(raw)) ?? describeDefaults(softened.prompt, null);
  } catch {
    return describeDefaults(softened.prompt, null);
  }
}

export function defaultChange(slot: Slot | null): Change {
  if (slot === "cabin") return { doorOpen: true };
  if (slot === "lantern" || slot === "lighthouse" || slot === "well") return { lit: true };
  return {};
}

export function parseChange(value: unknown, slot: Slot | null): Change {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return defaultChange(slot);
  const row = value as Record<string, unknown>;
  const change: Change = {};
  if (typeof row.lit === "boolean") change.lit = row.lit;
  if (typeof row.doorOpen === "boolean") change.doorOpen = row.doorOpen;
  if (typeof row.gone === "boolean") change.gone = row.gone;
  if (row.position !== null && typeof row.position === "object" && !Array.isArray(row.position)) {
    const position = row.position as Record<string, unknown>;
    const next: { x?: number; y?: number; z?: number } = {};
    for (const key of ["x", "y", "z"] as const) {
      if (typeof position[key] === "number" && Number.isFinite(position[key])) next[key] = position[key] as number;
    }
    if (Object.keys(next).length > 0) change.position = next;
  }
  return Object.keys(change).length === 0 ? defaultChange(slot) : change;
}

export function fallbackContinuation(name: string, slot: Slot | null): Continuation {
  const place = name.trim() === "" ? "the place" : name.trim();
  return {
    narration: `${place} holds still. She does not rush it.`,
    spokenLine: "Not yet. Look closer.",
    action: `She walks up to the ${place} and sets one hand on it`,
    change: defaultChange(slot),
  };
}

export function parseContinuation(raw: unknown, name: string, slot: Slot | null): Continuation {
  const fallback = fallbackContinuation(name, slot);
  if (raw === null || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  const action = shortText(row.action, 180);
  const narration = shortText(row.narration, 240);
  const spokenLine = shortText(row.spokenLine ?? row.spoken_line, 160);
  if (action === "" || unsafeText(action) || unsafeText(narration) || unsafeText(spokenLine)) return fallback;
  return {
    narration: narration === "" ? fallback.narration : narration,
    spokenLine,
    action,
    change: parseChange(row.change, slot),
  };
}

export function continuationMessages(args: {
  name: string;
  description: string;
  timeOfDay: number;
  weather: Weather;
  mood: string;
  castLook: string;
  notes: string[];
  story: { items: string[]; trust: number; clues: string[] } | null;
}): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "Write one continuation for a single tap on a coast. Return JSON with narration, spokenLine, action and change.",
        "narration is one or two sentences of story, not a camera note. spokenLine is one short line the character says, or empty.",
        "action is one physical action and contains no style words. change uses only lit, doorOpen, gone and position.",
        "The clip is a cut to live action. Do not describe a stylised screenshot. No readable text. No real people.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        thing: args.name,
        description: args.description,
        timeOfDay: timeLabel(args.timeOfDay),
        weather: args.weather,
        mood: args.mood,
        character: args.castLook,
        visited: args.notes.slice(-4),
        story: args.story,
      }),
    },
  ];
}

export async function askContinuation(args: Parameters<typeof continuationMessages>[0] & { slot: Slot | null }): Promise<Continuation> {
  if (directorKey() === null) return fallbackContinuation(args.name, args.slot);
  try {
    const raw = await deepseekJSON(continuationMessages(args), 400);
    return parseContinuation(parseJSONObject(raw), args.name, args.slot);
  } catch {
    return fallbackContinuation(args.name, args.slot);
  }
}

export function timeLabel(timeOfDay: number): string {
  if (timeOfDay < 5 || timeOfDay >= 21) return "night";
  if (timeOfDay < 8) return "dawn";
  if (timeOfDay < 17) return "day";
  return "dusk";
}

export function weatherFacts(weather: Weather): { visual: string; sound: string } {
  if (weather === "rain") {
    return {
      visual: "Rain is falling and visible. Stone, wood and the coat are wet, water beading and running, the path dark and reflective.",
      sound: "rain on stone and on cloth, wet footsteps, and wind in the rain",
    };
  }
  if (weather === "snow") {
    return {
      visual: "Snow is falling and visible. It settles on the coat, the path and the thing, and the ground is pale.",
      sound: "snow underfoot, wind, and the quiet of falling snow",
    };
  }
  if (weather === "mist") {
    return { visual: "Mist sits low over the water and softens the far shore.", sound: "a muffled wind and distant surf" };
  }
  if (weather === "cloudy") {
    return { visual: "Cloud covers the sky and the light is flat.", sound: "wind and a low surf" };
  }
  return { visual: "The air is clear.", sound: "wind across open water and a footstep on the path" };
}

export function worldClipPrompt(args: {
  name: string;
  description: string;
  action: string;
  timeOfDay: number;
  weather: Weather;
  castName: string;
  castLook: string;
}): string {
  const who = `${args.castName}, ${args.castLook}`;
  const place = args.description.trim() === "" ? args.name : `${args.name}, ${args.description.trim()}`;
  const facts = weatherFacts(args.weather);
  const action = args.action.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const shot = [
    `[Shot 1] Live-action, cinematic, a medium-wide portrait shot frames ${who} at ${place}.`,
    `It is ${timeLabel(args.timeOfDay)}. ${facts.visual}`,
    `${action}.`,
    `${who} stays the same person, the same clothes, the same colours.`,
    `The reference images are not a first frame and the shot must not start on them. The character sheet is identity only. The other image is a stylised map of the place and must not set the look.`,
    `She comes to rest; the camera settles into a static wide framing with the ${args.name}, the path and the figure clearly separated and none cut off by the frame edge.`,
    CINEMATIC_PROFILE,
  ].join(" ");
  return [
    `integrated_multimodal_description: ${shot}`,
    "",
    `overall_soundscape: ${facts.sound}.`,
    "",
    "non_diegetic_music: N/A",
  ].join("\n");
}

export async function submitWorldClip(args: {
  prompt: string;
  seed: number;
  characterSheetUrl: string;
  screenshotUrl: string;
}): Promise<{ jobId: string }> {
  const anchors = {
    continuityFrameUrl: null,
    continuityVideoUrl: null,
    characterSheetUrl: args.characterSheetUrl,
    styleImageUrl: args.screenshotUrl,
  };
  if (trayMode() === "mock") {
    return await trayGenerate({
      prompt: args.prompt,
      seed: args.seed,
      aspect: episodeAspect(),
      seconds: episodeSeconds(),
      ...anchors,
    });
  }
  const baseUrl = instanceForSeed(args.seed);
  if (baseUrl === null) throw new Error("FASTH3_URLS is not set");
  const conditions = await inlineConditions({
    baseUrl,
    apiKey: envFlag("FASTH3_API_KEY"),
    model: uniserveModel(),
    task: uniserveTask(),
    prompt: args.prompt,
    seed: args.seed,
    aspect: episodeAspect(),
    seconds: episodeSeconds(),
    ...anchors,
  });
  const references = conditions.filter((entry) => entry.role === "reference" && entry.frame_index === undefined);
  if (references.length !== conditions.length || conditions.some((entry) => entry.role === "keyframe")) {
    throw new Error("a world clip must not start on a keyframe");
  }
  if (references.length === 0) throw new Error("the tray needs at least one reference image to start a shot");
  const body: Record<string, unknown> = {
    model: uniserveModel(),
    prompt: args.prompt,
    conditions: references,
    target: {
      short_edge: 768,
      aspect_ratio: episodeAspect(),
      duration_seconds: episodeSeconds(),
    },
    seed: args.seed,
  };
  const task = uniserveTask();
  if (task !== null) body.task = task;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = envFlag("FASTH3_API_KEY");
  if (key !== null) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${v1BaseUrl(baseUrl)}/v1/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`uniserve POST /v1/videos failed: ${res.status} ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text) as { id?: unknown; video_id?: unknown };
  const jobId = typeof parsed.id === "string" ? parsed.id : typeof parsed.video_id === "string" ? parsed.video_id : null;
  if (jobId === null || jobId.trim() === "") throw new Error("uniserve POST /v1/videos returned no job id");
  return { jobId: `${jobId.trim()}@${baseUrl}` };
}

export async function waitForClip(jobId: string): Promise<string> {
  const polls = maxPolls();
  for (let attempt = 1; attempt <= polls; attempt += 1) {
    const job = await trayGetJob(jobId);
    if (job.status === "ready" && job.mp4Url !== null) return job.mp4Url;
    if (job.status === "failed") throw new Error(job.error ?? "tray job failed");
    if (attempt === polls) break;
    await sleep(pollMs());
  }
  await trayCancel(jobId).catch(() => null);
  throw new Error(`tray job ${jobId} did not finish`);
}

export async function fetchClipBytes(mp4Url: string): Promise<Blob> {
  const downloaded = await trayDownload(mp4Url);
  const type = downloaded.contentType.split(";")[0].trim() || "video/mp4";
  return new Blob([new Uint8Array(downloaded.bytes)], { type });
}

export async function dataUriFromBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  return `data:${mime};base64,${base64(bytes)}`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
