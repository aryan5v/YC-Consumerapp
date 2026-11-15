// The one place the cinematic profile lives. Swap these strings to change the look.
export const PROFILE = {
  opener: "Live-action, cinematic,",
  look: "photorealistic with natural skin and fabric texture and real materials — wet stone, brushed metal, worn wood — physically plausible light from one named source, soft natural contrast, medium depth of field, no stylisation",
  colour:
    "natural restrained colour with cool pearl highlights and deep blue-green shadows, and one small warm coral-rose accent somewhere in frame",
  cameraNote: "with small amplitude at slow speed",
  never:
    "No legible text, signage, logos or screens; no extra limbs or fingers; no gore; no real people's likenesses.",
  cast:
    "the protagonist is a person in their early thirties, short dark hair, a pale grey canvas jacket over a dark jumper, dark trousers and worn boots",
  endingFrame: "static wide framing",
} as const;

export const SHOT_SIZES = [
  "extreme wide shot",
  "wide shot",
  "medium wide shot",
  "medium shot",
  "medium close-up",
  "close-up",
  "extreme close-up",
  "over-the-shoulder shot",
] as const;

export const CAMERA_MOVES = [
  "Static Shot",
  "Push In",
  "Pull Out",
  "Truck Left",
  "Truck Right",
  "Pan Left",
  "Pan Right",
  "Tilt Up",
  "Tilt Down",
  "Pedestal Up",
  "Pedestal Down",
  "Arc Shot",
  "Tracking Shot",
] as const;

export type CameraMove = (typeof CAMERA_MOVES)[number];

export type H3Shot = {
  mode: "t2va" | "i2va";
  shotSize: string;
  cameraMove: string;
  cameraNote: string | null;
  light: string;
  materials: string;
  preserved: string | null;
  beats: string[];
  ambience: string;
  ending: string;
  cast: string;
};

// The first line the vendor's I2VA guide requires, followed by one blank line.
export const I2VA_INSTRUCTION =
  "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";

const CAMERA_CLAUSE: Record<CameraMove, string> = {
  "Static Shot": "holds a static shot",
  "Push In": "pushes in",
  "Pull Out": "pulls out",
  "Truck Left": "trucks left",
  "Truck Right": "trucks right",
  "Pan Left": "pans left",
  "Pan Right": "pans right",
  "Tilt Up": "tilts up",
  "Tilt Down": "tilts down",
  "Pedestal Up": "pedestals up",
  "Pedestal Down": "pedestals down",
  "Arc Shot": "moves in an Arc Shot",
  "Tracking Shot": "follows in a Tracking Shot",
};

export function normalizeShotSize(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return SHOT_SIZES.find((size) => size === cleaned) ?? null;
}

export function normalizeCameraMove(raw: string): CameraMove | null {
  const cleaned = raw.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return CAMERA_MOVES.find((move) => move.toLowerCase() === cleaned) ?? null;
}

function article(size: string): string {
  return /^(extreme|over)\b/.test(size) ? `an ${size}` : `a ${size}`;
}

function period(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function stripCutMarks(text: string): string {
  return text
    .replace(/\[Shot\s+\d+\]/gi, " ")
    .replace(/\bAt\s+\d{2}:\d{2}(?:\.\d+)?\s*,?/gi, " ")
    .replace(/\b(?:the camera cuts to|the shot cuts to|the shot transitions to|the shot changes to|the shot switches to)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cameraSentence(move: CameraMove, note: string | null): string {
  if (move === "Static Shot") return "The camera holds a Static Shot";
  const pace = note !== null && note.trim() !== "" ? note.trim().replace(/\.$/, "") : PROFILE.cameraNote;
  const clause = CAMERA_CLAUSE[move];
  const named = clause.includes(move) ? clause : `${clause} (${move})`;
  return `The camera ${named} ${pace}`;
}

function weaveCamera(beat: string, camera: string): string {
  const clean = stripCutMarks(beat);
  if (clean === "") return period(camera);
  if (/\bcamera\b/i.test(clean)) return period(clean);
  const action = clean.replace(/[.!?]+$/, "");
  const lowered = action.charAt(0).toLowerCase() + action.slice(1);
  return period(`${camera} as ${lowered}`);
}

export function buildH3Prompt(shot: H3Shot): string {
  const move = normalizeCameraMove(shot.cameraMove) ?? "Pull Out";
  const size = normalizeShotSize(shot.shotSize) ?? "medium wide shot";
  const note = move === "Static Shot" ? null : shot.cameraNote;
  const camera = cameraSentence(move, note);
  const beats = shot.beats.map(stripCutMarks).filter((beat) => beat !== "").slice(0, 5);
  const first = weaveCamera(beats[0] ?? "", camera);
  const rest = beats.slice(1).map(period).filter((beat) => beat !== "");
  const materials = shot.materials.trim() === "" ? "" : period(`The surfaces are ${shot.materials.replace(/\.$/, "")}`);
  const light = shot.light.trim() === "" ? "" : period(`The scene is lit by ${shot.light.replace(/\.$/, "")}`);
  const preserved =
    shot.mode === "i2va"
      ? period(
          `The shot begins exactly on <Picture 1>, preserving ${
            shot.preserved === null || shot.preserved.trim() === ""
              ? "identity, clothing, colours, key objects and spatial layout"
              : shot.preserved.replace(/\.$/, "")
          }`,
        )
      : "";
  const opening =
    shot.mode === "i2va"
      ? `${PROFILE.opener} ${article(size)} begins on the first frame, in which ${PROFILE.cast}.`
      : `${PROFILE.opener} ${article(size)} in which ${PROFILE.cast}.`;
  const ending = period(
    stripCutMarks(shot.ending) === ""
      ? "They come to rest; the camera settles into a static wide framing with the main objects clearly separated and none cut off by the frame edge"
      : stripCutMarks(shot.ending),
  );
  const description = [`[Shot 1] ${opening}`, preserved, materials, light, first, ...rest, ending]
    .filter((part) => part !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sound = period(shot.ambience.trim() === "" ? "Room tone and the physical sounds of the action continue under the shot" : shot.ambience);
  const fields = [`integrated_multimodal_description: ${description}`, "", `overall_soundscape: ${sound}`, "", "non_diegetic_music: N/A"].join("\n");
  return shot.mode === "i2va" ? `${I2VA_INSTRUCTION}\n\n${fields}` : fields;
}

export function isH3Prompt(text: string): boolean {
  return text.includes("integrated_multimodal_description:") && text.includes("non_diegetic_music:");
}
