import { ChatMessage } from "./deepseek";
import {
  CAMERA_MOVES,
  H3Shot,
  PROFILE,
  SHOT_SIZES,
  buildH3Prompt,
  isH3Prompt,
  normalizeCameraMove,
  normalizeShotSize,
} from "./h3";
import { Region } from "./segment";
import { clipPrompt } from "./style";

export type StopAction = {
  id: string;
  label: string;
  clip_prompt: string;
  narration: string;
  spoken_line: string;
};

export type StopObject = {
  id: string;
  label: string;
  target: string;
  region: Region | null;
  actions: StopAction[];
};

export function optionToObject(option: DirectorOption): StopObject {
  return {
    id: option.id,
    label: option.label,
    target: option.target,
    region: null,
    actions: [
      {
        id: `${option.id}1`,
        label: option.label,
        clip_prompt: option.clip_prompt ?? option.leads_to,
        narration: option.narration ?? option.label,
        spoken_line: option.spoken_line,
      },
    ],
  };
}

export type DirectorOption = {
  id: string;
  label: string;
  target: string;
  leads_to: string;
  clip_prompt?: string;
  narration?: string;
  spoken_line: string;
};

export type DirectorChildIntent = {
  id: string;
  label: string;
  leads_to: string;
  clip_prompt?: string;
  narration?: string;
  spoken_line: string;
};

export type LegacyChoiceStop = { kind: "choice"; options: DirectorOption[] };

export function legacyStopToObjects(stop: LegacyChoiceStop): DirectorChoiceStop {
  return { kind: "choice", objects: stop.options.map(optionToObject) };
}

export type DirectorChoiceStop = {
  kind: "choice";
  objects: StopObject[];
};

export type DirectorPuzzleStop = {
  kind: "puzzle";
  question: string;
  answer_type: "pick" | "number" | "text";
  choices: string[] | null;
  answers: string[];
  success: DirectorChildIntent;
  failure: DirectorChildIntent;
};

export type DirectorStop = DirectorChoiceStop | DirectorPuzzleStop;

export type DirectorBeatState = {
  items: string[];
  trust: number;
  clues: string[];
  beats_left: number;
};

export type DirectorCharacter = { name: string; voice: string };

export type DirectorBeat = {
  beat_id: string;
  clip_prompt: string;
  narration: string;
  spoken_line: string;
  stop: DirectorStop | null;
  state: DirectorBeatState;
  ending: { title: string; summary: string } | null;
};

export type DirectorContinuation = {
  previousClipPrompt: string;
  optionLabel: string;
  optionAction: string;
  optionTarget: string | null;
};

export type DirectorContext = {
  episodeTitle: string;
  premise: string;
  character: DirectorCharacter;
  beatIndex: number;
  beatsTotal: number;
  beatsLeft: number;
  expectedKind: "choice" | "puzzle" | "ending";
  pathLabels: string[];
  state: DirectorBeatState;
  lastPlayerText: string | null;
  continuation: DirectorContinuation | null;
};

export const CHOICE_OPTION_COUNT = 3;
export const MAX_SPOKEN_WORDS = 14;

const SMALL_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "and", "or", "with", "for", "its", "his", "her",
  "their", "my", "your", "under", "over", "into", "from", "that", "this",
]);

export function shortenSpokenLine(raw: string): string {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") return text;
  const words = text.split(" ");
  if (words.length <= MAX_SPOKEN_WORDS) return text;
  const head = words.slice(0, MAX_SPOKEN_WORDS).join(" ");
  const boundary = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(". "));
  const cut = boundary > head.length * 0.5 ? head.slice(0, boundary) : head;
  const trimmed = cut.replace(/[,;:\s]+$/, "");
  if (trimmed === "") return head;
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function significantTokens(raw: string): string[] {
  const out: string[] = [];
  for (const token of raw.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)) {
    if (token === "" || SMALL_WORDS.has(token)) continue;
    if (token.length < 3 && !/^[0-9]/.test(token)) continue;
    out.push(token);
  }
  return out;
}

export function targetIsVisible(target: string, clipPrompt: string): boolean {
  const wanted = significantTokens(target);
  if (wanted.length === 0) return true;
  const shown = new Set(significantTokens(clipPrompt));
  let hits = 0;
  for (const token of wanted) {
    if (shown.has(token)) hits += 1;
  }
  return hits >= 1 && hits / wanted.length >= 0.5;
}
export const DEFAULT_SPOKEN_LINE = "So what do you do?";

export function expectedStopKind(depth: number, beatsTotal: number, rhythm = 3): "choice" | "puzzle" | "ending" {
  if (depth >= beatsTotal - 1) return "ending";
  const slot = depth % rhythm;
  if (slot === 2) return "puzzle";
  return "choice";
}

const OPENING_EXAMPLE: H3Shot = {
  mode: "t2va",
  shotSize: "medium wide shot",
  cameraMove: "Pull Out",
  cameraNote: "with small amplitude at slow speed",
  light: "a single sodium lamp from the left, low and warm against the cool night",
  materials: "wet stone underfoot, a worn wooden shutter, and brushed metal on the lamp housing",
  preserved: null,
  beats: [
    "The protagonist steps off the kerb onto the wet stone and stops, a paper parcel taped inside the pale grey jacket.",
    "Their left hand rests once on the parcel and then drops to their side.",
    "A red wooden door stands on the left, the long street runs ahead under the lamps, and a man in a grey coat leans at the corner.",
    "Rain ticks on the lamp housing while their boots scuff once and then hold still.",
  ],
  ambience:
    "Rain ticks on wet stone and the lamp housing. One boot scuffs the pavement, and paper rustles once under the jacket. A low street hum continues underneath.",
  ending:
    "They come to rest; the camera settles into a static wide framing with the red door, the long street and the man in the grey coat clearly separated.",
  cast: PROFILE.cast,
};

const CONTINUING_EXAMPLE: H3Shot = {
  mode: "i2va",
  shotSize: "medium shot",
  cameraMove: "Push In",
  cameraNote: "with small amplitude at slow speed",
  light: "the sodium lamp from the left, with a warmer spill from the doorway as it opens",
  materials: "wet stone, worn wood on the red door, and brushed metal on the handle",
  preserved: "identity, clothing, colours, the paper parcel, and the layout of the wet street",
  beats: [
    "The protagonist lifts their left hand from the parcel and sets it on the worn wooden door.",
    "The brushed-metal handle turns under their fingers.",
    "The door opens a hand's width and warm interior light spills onto the wet stone.",
    "They pause with one hand on the door and the parcel still taped inside the jacket.",
  ],
  ambience:
    "Rain continues on the wet stone. The wooden door scrapes once, and the metal handle clicks. A low interior hum spills out as the door opens.",
  ending:
    "They come to rest; the camera settles into a static wide framing with the open door, the counter inside and the lamp on the street clearly separated.",
  cast: PROFILE.cast,
};

function shotFields(shot: H3Shot): string {
  return JSON.stringify(
    {
      shot_size: shot.shotSize,
      camera_move: shot.cameraMove,
      camera_note: shot.cameraNote,
      light: shot.light,
      materials: shot.materials,
      preserved: shot.preserved,
      beats: shot.beats,
      ambience: shot.ambience,
      ending: shot.ending,
    },
    null,
    2,
  );
}

export function buildDirectorMessages(context: DirectorContext, previousError?: string): ChatMessage[] {
  const character = context.character.name;
  const system = [
    "You are the director of Synqui, a daily interactive live-action video story. Each turn you write exactly one beat as structured JSON. You write the content. Code assembles the FastH3 prompt. Never write vendor field names, [Shot] labels, timestamps, or dialogue tags.",
    "",
    "A beat is one shot of about five seconds, portrait, one clear action, no cut inside the shot. The player may answer by tapping something in the finished frame or by saying their answer out loud, so the character has to ask for it in words.",
    "",
    `Every assembled shot begins "${PROFILE.opener}" then the shot size, then this cast description word for word. Do not rewrite it and do not add hair, age, or clothing: "${PROFILE.cast}".`,
    "",
    "The shot object, every time:",
    `- shot_size: one of ${SHOT_SIZES.join(", ")}.`,
    "- materials: real surfaces a camera can see, such as wet stone, worn wood, brushed metal. A material is a fact, not a mood.",
    "- light: one named source and a direction. A sodium lamp from the left. Overcast skylight from above. A single window from the right.",
    `- camera_move: exactly one of ${CAMERA_MOVES.join(", ")}. No shake. No fast move.`,
    `- camera_note: "${PROFILE.cameraNote}" unless the move is Static Shot, in which case null.`,
    "- beats: four or five strings in time order. Each one is something visible or audible in this shot. No timestamps. No second shot. No cut.",
    "- ambience: the concrete sounds of this shot. Rain on stone, a door scrape, a boot scuff. No music. No dialogue.",
    "- ending: the last sentence of the shot. They come to rest; the camera settles into a static wide framing with three named things clearly separated and none cut off by the frame edge.",
    "- preserved: null on an opening shot or a cut. On a continuing shot, what stays from the first frame: identity, clothing, colours, key objects, layout. Do not invent a pose the previous shot did not show.",
    "",
    "Hard rules:",
    "1. No style adjective with no visible fact behind it. Do not write cinematic, beautiful, moody, dramatic, stunning, atmospheric, painterly, epic, or gorgeous. Write the thing a camera would see.",
    "2. No legible text, signs, logos, screens, or digits in the picture. A code or a number is said in spoken_line, never printed in the shot.",
    "3. Continuity. The same protagonist, the same night, the same place, the same moment. No time skips, no new faces you did not already introduce, no weather changes.",
    `4. ${character} speaks in every shot. spoken_line is what ${character} says out loud at the end of the shot, fourteen words or fewer. Count them. Contractions, plain words, no stage directions, no quotation marks inside it.`,
    "5. The rhythm is choice, choice, puzzle. The player is never only watching.",
    "6. On a choice beat you write the shot only. Do not name options, targets, or objects to tap. Those are chosen later from the finished frame.",
    "7. A puzzle has exactly one correct answer, and every string in answers is another way of saying that same answer. The clue is something a video model renders reliably: a shape, a colour, a position, or a count of large objects. Never small text or digits in the picture.",
    "8. Failure is never game over. A failed puzzle sends the story somewhere worse and more interesting.",
    "9. Reply with a single JSON object and nothing else. No prose, no markdown fence.",
    "",
    "Worked example, an opening shot. You write these fields:",
    shotFields(OPENING_EXAMPLE),
    "Code assembles this, and you do not write this text yourself:",
    buildH3Prompt(OPENING_EXAMPLE),
    "",
    "Worked example, a continuing shot. The first frame is already on screen. You write these fields:",
    shotFields(CONTINUING_EXAMPLE),
    "Code assembles this:",
    buildH3Prompt(CONTINUING_EXAMPLE),
  ].join("\n");

  const choiceShape = [
    "{",
    '  "beat_id": "b<index>",',
    '  "shot": {',
    '    "shot_size": "medium wide shot",',
    '    "camera_move": "Pull Out",',
    `    "camera_note": "${PROFILE.cameraNote}",`,
    '    "light": "a named source and a direction",',
    '    "materials": "wet stone, worn wood, brushed metal",',
    '    "preserved": null,',
    '    "beats": ["four or five visible actions, in time order"],',
    '    "ambience": "the concrete sounds of this shot",',
    '    "ending": "They come to rest; the camera settles into a static wide framing with three named things clearly separated."',
    "  },",
    '  "narration": "one line of narration, present tense, under 14 words",',
    '  "spoken_line": "what the character says out loud at the end of this shot, under 14 words",',
    '  "stop": { "kind": "choice" },',
    '  "state": { "items": [], "trust": 0, "clues": [], "beats_left": <N> },',
    '  "ending": null',
    "}",
    "A choice beat is the shot only. Do not add options. Objects are chosen later from the finished frame.",
  ].join("\n");

  const puzzleShape = [
    "{",
    '  "beat_id": "b<index>",',
    '  "shot": { "shot_size": "medium shot", "camera_move": "Push In", "camera_note": "with small amplitude at slow speed", "light": "a named source and a direction", "materials": "real surfaces", "preserved": null, "beats": ["four or five visible actions"], "ambience": "concrete sounds", "ending": "They come to rest; the camera settles into a static wide framing with three named things clearly separated." },',
    '  "narration": "one line of narration, present tense, under 14 words",',
    '  "spoken_line": "the question itself, said out loud by the character at the end of this shot, under 14 words",',
    '  "stop": {',
    '    "kind": "puzzle",',
    '    "question": "one short question the scene has just set up",',
    '    "answer_type": "number",',
    '    "choices": null,',
    '    "answers": ["every acceptable answer, lowercase, digits only for a number"],',
    '    "success": { "id": "success", "label": "3 word outcome", "leads_to": "one line", "narration": "one narration line" },',
    '    "failure": { "id": "failure", "label": "3 word outcome", "leads_to": "one line", "narration": "one narration line" }',
    "  },",
    '  "state": { "items": [], "trust": 0, "clues": [], "beats_left": <N> },',
    '  "ending": null',
    "}",
    'For a pick puzzle use "answer_type": "pick" with 2 to 4 "choices" and the same strings in "answers". For a short free text puzzle use "answer_type": "text".',
  ].join("\n");

  const endingShape = [
    "{",
    '  "beat_id": "b<index>",',
    '  "shot": { "shot_size": "wide shot", "camera_move": "Pull Out", "camera_note": "with small amplitude at slow speed", "light": "a named source and a direction", "materials": "real surfaces", "preserved": null, "beats": ["four or five visible actions"], "ambience": "concrete sounds", "ending": "They come to rest; the camera settles into a static wide framing with three named things clearly separated." },',
    '  "narration": "one closing narration line, present tense, under 14 words",',
    '  "spoken_line": "the character\'s last line, said out loud at the end of the closing shot, under 14 words",',
    '  "stop": null,',
    '  "state": { "items": [], "trust": 0, "clues": [], "beats_left": 1 },',
    '  "ending": { "title": "three words", "summary": "one or two sentences naming what the player did and where it left them" }',
    "}",
  ].join("\n");

  const wantsEnding = context.expectedKind === "ending";
  const lines: string[] = [];

  if (context.continuation !== null) {
    const option = context.continuation;
    lines.push(
      `The shot the player is watching right now: ${option.previousClipPrompt}`,
      "",
      `The player has chosen: ${option.optionLabel}. ${option.optionAction}`,
      option.optionTarget === null ? "" : `What they are heading for is the ${option.optionTarget}.`,
      "",
      "Write the very next beat of that choice happening, as one continuing shot. Set preserved to what stays from the frame on screen: identity, clothing, colours, key objects, layout. The shot must show the choice actually happening. If the stop is a puzzle, the clue is a shape, a colour, a position, or a count of large objects, never text or digits in the picture, and the answer is said out loud.",
      "",
    );
  }

  lines.push(
    `Episode: ${context.episodeTitle}`,
    `Premise: ${context.premise}`,
    "",
    `Recurring character: ${character}. ${context.character.voice}`,
    `${character} is the only other person in tonight's story and speaks every spoken_line.`,
    "",
    `This is beat ${context.beatIndex + 1} of at most ${context.beatsTotal}. You have ${context.beatsLeft} beat(s) left including this one.`,
    `The path so far: ${context.pathLabels.length === 0 ? "(the player has just arrived)" : context.pathLabels.join(" -> ")}`,
    `Hidden state carried forward: items=${JSON.stringify(context.state.items)}, trust=${context.state.trust}, clues=${JSON.stringify(context.state.clues)}`,
  );

  if (context.lastPlayerText !== null) {
    lines.push(
      "",
      `After the last episode the player texted ${character}: "${context.lastPlayerText}"`,
      `Open this episode from that. ${character} remembers it, and the first shot, the first narration and the first spoken_line all follow from what the player said. Do not ignore it and do not explain it away.`,
    );
  }

  lines.push(
    "",
    wantsEnding
      ? 'This beat must END the episode. Set "stop" to null and "ending" to the ending object. Do not offer a choice or a puzzle.'
      : `This beat must end on a ${context.expectedKind.toUpperCase()} stop. The rhythm of the episode is choice, choice, puzzle, and the house rule is that the player is never only watching.`,
    context.beatsLeft <= 2 && !wantsEnding
      ? "You are running out of beats: this stop must steer the story toward a real ending on the next beat."
      : "",
    "",
    "Return exactly one JSON object in one of these three shapes.",
    "",
    "Choice beat:",
    choiceShape,
    "",
    "Puzzle beat:",
    puzzleShape,
    "",
    "Ending beat:",
    endingShape,
  );

  if (previousError !== undefined) {
    lines.push("", `Your previous reply was rejected: ${previousError}. Reply again with valid JSON only.`);
  }

  return [
    { role: "system", content: system },
    { role: "user", content: lines.filter((line) => line !== "").join("\n") },
  ];
}

export type ObjectContext = {
  episodeTitle: string;
  premise: string;
  character: DirectorCharacter;
  beatIndex: number;
  beatsLeft: number;
  pathLabels: string[];
  state: DirectorBeatState;
  clipPrompt: string;
  spokenLine: string;
  lastPlayerText: string | null;
  frameObjects: { name: string; score: number }[];
  objectCount: number;
  actionCount: number;
};

export function buildObjectsMessages(context: ObjectContext, previousError?: string): ChatMessage[] {
  const character = context.character.name;
  const system = [
    "You are the director of Synqui, a daily interactive live-action video story. One shot has just been rendered and the player will now touch one object in it.",
    "",
    "You are given the shot that is on screen. Name the two to three separate physical objects in it that the player could reach out and touch, and write what happens next for each of them.",
    "",
    "Hard rules:",
    "1. Every object must be something the shot actually shows, named with the words of the shot, so a player who has only watched the shot can find it on screen.",
    "2. The objects are separate things, never the same thing twice, and never a person, a body part, or something off screen.",
    `3. ${character} speaks the line you write for each follow-up shot: fourteen words or fewer, contractions, no stage directions, no quotation marks.`,
    "4. Each action's clip_prompt is a full shot in the same live-action terms as a beat, continuing from the frame on screen: real materials, one named light source with a direction, one camera move with amplitude and speed, four or five beats of the one action in time order, what is preserved from the frame (identity, clothing, colours, key objects, layout), and a last sentence that settles into a static wide framing with three things clearly separated. Same protagonist, same place, same moment. No style adjective with no visible fact behind it. No legible text, signs, logos, screens, or digits.",
    "5. No dialogue in a clip_prompt. The shots carry ambient and physical sound only and the spoken line is recorded separately.",
    "6. If a follow-up sets up a puzzle, the clue is something a video model renders reliably: a shape, a colour, a position, or a count of large objects. Never small text, never digits printed in the picture.",
    "7. Reply with a single JSON object and nothing else. No prose, no markdown fence.",
  ].join("\n");

  const shape = [
    "{",
    '  "objects": [',
    "    {",
    '      "id": "o1",',
    '      "label": "3-5 word phrase the player taps, like open the mailbox",',
    '      "target": "the physical thing, using the words of the shot",',
    '      "actions": [',
    '        { "id": "a1", "label": "2-4 words for this way of touching it", "clip_prompt": "a full continuing shot: materials, the light and its direction, one camera move with small amplitude at slow speed, four or five beats of the one action, what stays from the frame, and a last sentence that settles into a static wide framing with three things separated", "narration": "one narration line for that shot, under 14 words", "spoken_line": "what the character says out loud at the end of that shot, under 14 words" }',
    "      ]",
    "    }",
    "  ]",
    "}",
  ].join("\n");

  const lines = [
    `Episode: ${context.episodeTitle}`,
    `Premise: ${context.premise}`,
    "",
    `Recurring character: ${character}. ${context.character.voice}`,
    "",
    "The shot on screen right now, word for word:",
    context.clipPrompt,
    context.spokenLine === "" ? "" : `As it ends, ${character} says: "${context.spokenLine}"`,
    "",
  ];

  if (context.frameObjects.length > 0) {
    lines.push(
      `A segmenter found these in the finished frame, ranked by confidence: ${context.frameObjects
        .map((entry) => `${entry.name} (${entry.score.toFixed(2)})`)
        .join(", ")}.`,
      "Choose the objects from that list, and only from that list.",
      "",
    );
  }

  lines.push(
    `This is beat ${context.beatIndex + 1} and the player is about to choose.`,
    `Path so far: ${context.pathLabels.length === 0 ? "(just arrived)" : context.pathLabels.join(" -> ")}`,
    `Hidden state: items=${JSON.stringify(context.state.items)}, trust=${context.state.trust}, clues=${JSON.stringify(
      context.state.clues,
    )}`,
  );

  if (context.lastPlayerText !== null && context.beatIndex === 0) {
    lines.push(`The player texted ${character} after the last episode: "${context.lastPlayerText}"`);
  }

  lines.push(
    "",
    `Write exactly ${context.objectCount} objects, and exactly ${context.actionCount} action(s) for each object.`,
    context.beatsLeft <= 2 ? "You are nearly out of beats: every follow-up shot must push toward a real ending." : "",
    "",
    shape,
  );

  if (previousError !== undefined) {
    lines.push("", `Your previous reply was rejected: ${previousError}. Reply again with valid JSON only.`);
  }

  return [
    { role: "system", content: system },
    { role: "user", content: lines.filter((line) => line !== "").join("\n") },
  ];
}

export function validateObjects(
  raw: unknown,
  options: { objectCount: number; actionCount: number; clipPrompt: string; frameNames: string[] },
): { ok: true; objects: StopObject[] } | { ok: false; error: string } {
  const source = (raw ?? {}) as { objects?: unknown };
  const list = Array.isArray(source.objects) ? source.objects : [];
  const parsed: StopObject[] = [];
  const frameNames = options.frameNames.map((name) => name.toLowerCase());
  for (const entry of list) {
    if (parsed.length >= options.objectCount) break;
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const label = asText(row.label);
    if (label === null) continue;
    const id = asText(row.id) ?? `o${parsed.length + 1}`;
    if (parsed.some((object) => object.id === id)) continue;
    const target = asText(row.target) ?? label;
    const visible =
      frameNames.length === 0
        ? targetIsVisible(target, options.clipPrompt)
        : frameNames.some(
            (name) => name.includes(target.toLowerCase()) || target.toLowerCase().includes(name),
          );
    if (!visible) {
      return {
        ok: false,
        error: `the object "${label}" names "${target}", which the shot on screen does not show. Name something the shot actually shows, using its words.`,
      };
    }
    const actionsRaw = Array.isArray(row.actions) ? row.actions : [];
    const actions: StopAction[] = [];
    for (const actionEntry of actionsRaw) {
      if (actions.length >= options.actionCount) break;
      if (actionEntry === null || typeof actionEntry !== "object") continue;
      const action = actionEntry as Record<string, unknown>;
      const actionLabel = asText(action.label) ?? label;
      const resolved = actionPrompt(action);
      if (resolved === null) continue;
      if (!resolved.ok) return resolved;
      actions.push({
        id: asText(action.id) ?? `a${actions.length + 1}`,
        label: actionLabel,
        clip_prompt: resolved.prompt,
        narration: asText(action.narration) ?? actionLabel,
        spoken_line: shortenSpokenLine(asText(action.spoken_line ?? action.spokenLine) ?? actionLabel),
      });
    }
    if (actions.length < options.actionCount) {
      return {
        ok: false,
        error: `the object "${label}" needs exactly ${options.actionCount} action(s), each with its own clip_prompt.`,
      };
    }
    parsed.push({ id, label, target, region: null, actions });
  }
  if (parsed.length < options.objectCount) {
    return { ok: false, error: `exactly ${options.objectCount} objects are needed, got ${parsed.length}` };
  }
  return { ok: true, objects: parsed };
}

const PROMPT_NOISE = new Set([
  "integrated", "multimodal", "description", "overall", "soundscape", "diegetic", "music",
  "picture", "shot", "live", "action", "cinematic", "camera", "static", "protagonist",
  "their", "early", "thirties", "short", "dark", "hair", "pale", "grey", "canvas", "jacket",
  "jumper", "trousers", "worn", "boots", "surfaces", "scene", "light", "preserving",
]);

export function fallbackObjects(clipPrompt: string, objectCount: number, characterName: string): StopObject[] {
  const words = clipPrompt
    .replace(/[^A-Za-z ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !PROMPT_NOISE.has(word.toLowerCase()));
  const nouns = [...new Set(words.map((word) => word.toLowerCase()))].slice(0, objectCount);
  while (nouns.length < objectCount) nouns.push("the ground");
  return nouns.map((noun, index) => ({
    id: `o${index + 1}`,
    label: `head for the ${noun}`,
    target: noun,
    region: null,
    actions: [
      {
        id: `a${index + 1}`,
        label: `the ${noun}`,
        clip_prompt: `You move toward the ${noun} and the shot follows you there. ${clipPrompt}`,
        narration: `You go for the ${noun}.`,
        spoken_line: `Go on then. Take the ${noun}.`,
      },
    ],
  }));
}

type ValidationResult = { ok: true; beat: DirectorBeat } | { ok: false; error: string };

const DIRECTION_WORD = /\b(left|right|above|below|behind|overhead|front|side|window|east|west|north|south|down|up|low|high)\b/i;
const CUT_OR_STAMP = /\[Shot\s+\d+\]|\b\d{2}:\d{2}(?:\.\d+)?\b|\b(?:cuts to|shot cuts|shot transitions|shot changes|shot switches)\b/i;

function shotRecord(source: Record<string, unknown>): Record<string, unknown> | null {
  const nested = source.shot;
  if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
  const keys = ["shot_size", "shotSize", "beats", "camera_move", "cameraMove", "light", "materials", "ambience"];
  return keys.some((key) => source[key] !== undefined) ? source : null;
}

function settlingOf(shot: Record<string, unknown>): unknown {
  if (typeof shot.ending === "string") return shot.ending;
  return shot.settle ?? shot.shot_ending;
}

function assembleShot(
  shot: Record<string, unknown>,
  continuing: boolean,
): { ok: true; prompt: string } | { ok: false; error: string } {
  const sizeRaw = asText(shot.shot_size ?? shot.shotSize);
  if (sizeRaw === null) return { ok: false, error: `shot_size is required and must be one of: ${SHOT_SIZES.join(", ")}` };
  const shotSize = normalizeShotSize(sizeRaw);
  if (shotSize === null) return { ok: false, error: `shot_size must be one of: ${SHOT_SIZES.join(", ")}` };

  const moveRaw = asText(shot.camera_move ?? shot.cameraMove);
  if (moveRaw === null) return { ok: false, error: `camera_move is required and must be one of: ${CAMERA_MOVES.join(", ")}` };
  const cameraMove = normalizeCameraMove(moveRaw) ?? "Pull Out";
  const cameraNote = cameraMove === "Static Shot" ? null : (asText(shot.camera_note ?? shot.cameraNote) ?? PROFILE.cameraNote);

  const light = asText(shot.light);
  if (light === null || !DIRECTION_WORD.test(light)) {
    return { ok: false, error: "light must name a source and a direction, such as a sodium lamp from the left" };
  }
  const materials = asText(shot.materials);
  if (materials === null || materials.split(/\s+/).length < 2) {
    return { ok: false, error: "materials must name real surfaces, such as wet stone, worn wood and brushed metal" };
  }
  const beats = asStringArray(shot.beats);
  if (beats.length < 3) return { ok: false, error: `beats must be at least three strings in time order, got ${beats.length}` };
  if (beats.length > 5) return { ok: false, error: `a five-second shot takes four or five beats, not ${beats.length}` };
  if (beats.some((beat) => CUT_OR_STAMP.test(beat))) {
    return { ok: false, error: "a five-second clip is one shot: no timestamps and no cuts inside beats" };
  }
  const ambience = asText(shot.ambience);
  if (ambience === null) return { ok: false, error: "ambience must name the concrete sounds of this shot" };
  const ending = asText(settlingOf(shot));
  if (ending === null || !/wide/i.test(ending)) {
    return { ok: false, error: "ending must be the settling wide sentence, and it is the last sentence of the shot" };
  }
  const preserved = asText(shot.preserved);
  const modeRaw = asText(shot.mode);
  const mode = modeRaw === "t2va" ? "t2va" : preserved !== null || continuing || modeRaw === "i2va" ? "i2va" : "t2va";
  if (mode === "i2va" && preserved === null) {
    return { ok: false, error: "a continuing shot needs preserved: identity, clothing, colours, key objects, layout" };
  }
  return {
    ok: true,
    prompt: buildH3Prompt({
      mode,
      shotSize,
      cameraMove,
      cameraNote,
      light,
      materials,
      preserved: mode === "i2va" ? preserved : null,
      beats,
      ambience,
      ending,
      cast: PROFILE.cast,
    }),
  };
}

function actionPrompt(
  action: Record<string, unknown>,
): { ok: true; prompt: string } | { ok: false; error: string } | null {
  const nested = action.shot;
  if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
    const assembled = assembleShot(nested as Record<string, unknown>, true);
    if (assembled.ok) return assembled;
    if (asText(action.clip_prompt ?? action.clipPrompt) === null) return assembled;
  }
  const text = asText(action.clip_prompt ?? action.clipPrompt);
  if (text === null) return null;
  return { ok: true, prompt: isH3Prompt(text) ? text : clipPrompt(text, "i2va") };
}

function choicePayload(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object") return false;
  const stop = raw as Record<string, unknown>;
  return (Array.isArray(stop.options) && stop.options.length > 0) || (Array.isArray(stop.objects) && stop.objects.length > 0);
}

function legacyPrompt(source: Record<string, unknown>): string | null {
  const text = asText(source.clip_prompt ?? source.clipPrompt);
  if (text === null) return null;
  return isH3Prompt(text) ? text : clipPrompt(text);
}

export function validateBeat(
  raw: unknown,
  options: { expectedKind: "choice" | "puzzle" | "ending"; beatsLeft: number; beatIndex: number },
): ValidationResult {
  if (raw === null || typeof raw !== "object") return { ok: false, error: "response was not a JSON object" };
  const source = raw as Record<string, unknown>;
  const structured = shotRecord(source);
  let clip = legacyPrompt(source);
  if (structured !== null) {
    const assembled = assembleShot(structured, false);
    if (!assembled.ok) return assembled;
    clip = assembled.prompt;
  }
  if (clip === null) return { ok: false, error: "clip_prompt must be a non-empty string, or send a shot object" };

  const narration = asText(source.narration) ?? "";
  const beatId = asText(source.beat_id ?? source.beatId) ?? `b${options.beatIndex}`;
  const state = validateState(source.state, options.beatsLeft);
  const ending = validateEnding(source.ending);
  const topSpoken = asText(source.spoken_line ?? source.spokenLine);
  const wantsEnding = options.expectedKind === "ending";
  if (wantsEnding) {
    if (ending === null) return { ok: false, error: "the final beat must include an ending object" };
    return {
      ok: true,
      beat: {
        beat_id: beatId,
        clip_prompt: clip,
        narration,
        spoken_line: shortenSpokenLine(topSpoken ?? narration),
        stop: null,
        state,
        ending,
      },
    };
  }

  if (ending !== null) return { ok: false, error: "ending must be null before the last beat" };
  if (options.expectedKind === "choice" && structured !== null && !choicePayload(source.stop)) {
    const spokenLine = shortenSpokenLine(topSpoken ?? DEFAULT_SPOKEN_LINE);
    return {
      ok: true,
      beat: { beat_id: beatId, clip_prompt: clip, narration, spoken_line: spokenLine, stop: null, state, ending: null },
    };
  }
  const stop = validateStop(source.stop, options.expectedKind, clip);
  if (!stop.ok) return { ok: false, error: stop.error };
  const spokenLine = shortenSpokenLine(
    topSpoken ?? (stop.stop.kind === "puzzle" ? stop.stop.question : DEFAULT_SPOKEN_LINE),
  );
  return {
    ok: true,
    beat: { beat_id: beatId, clip_prompt: clip, narration, spoken_line: spokenLine, stop: stop.stop, state, ending: null },
  };
}

function validateStop(
  raw: unknown,
  expectedKind: "choice" | "puzzle" | "ending",
  clipPrompt: string,
): { ok: true; stop: DirectorStop } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") return { ok: false, error: "stop must be an object on a non-final beat" };
  const stop = raw as Record<string, unknown>;
  if (Array.isArray(stop.objects)) {
    return { ok: true, stop: { kind: "choice", objects: stop.objects as StopObject[] } };
  }
  const kind = asText(stop.kind);
  if (kind !== "choice" && kind !== "puzzle") return { ok: false, error: 'stop.kind must be "choice" or "puzzle"' };
  if (kind !== expectedKind) return { ok: false, error: `stop.kind must be "${expectedKind}" on this beat` };

  if (kind === "choice") {
    if (!Array.isArray(stop.options)) return { ok: false, error: "a choice stop needs an options array" };
    const parsed: DirectorOption[] = [];
    const used = new Set<string>();
    for (const entry of stop.options) {
      if (entry === null || typeof entry !== "object") return { ok: false, error: "every option must be an object" };
      const option = entry as Record<string, unknown>;
      const label = asText(option.label);
      const target = asText(option.target);
      const leadsTo = asText(option.leads_to ?? option.leadsTo);
      if (label === null) return { ok: false, error: "every option needs a label" };
      if (leadsTo === null) return { ok: false, error: "every option needs leads_to" };
      let id = asText(option.id) ?? "";
      id = id.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8);
      if (id === "" || used.has(id)) id = String.fromCharCode(97 + parsed.length);
      used.add(id);
      const resolvedTarget = target ?? label;
      if (!targetIsVisible(resolvedTarget, clipPrompt)) {
        return {
          ok: false,
          error: `the option "${label}" names "${resolvedTarget}", which the shot you wrote for this beat does not show. Name something the shot actually shows, using its words.`,
        };
      }
      parsed.push({
        id,
        label,
        target: resolvedTarget,
        leads_to: leadsTo,
        clip_prompt: asText(option.clip_prompt ?? option.clipPrompt) ?? undefined,
        narration: asText(option.narration) ?? undefined,
        spoken_line: shortenSpokenLine(asText(option.spoken_line ?? option.spokenLine) ?? label),
      });
      if (parsed.length === CHOICE_OPTION_COUNT) break;
    }
    if (parsed.length < CHOICE_OPTION_COUNT) {
      return { ok: false, error: `a choice stop needs ${CHOICE_OPTION_COUNT} distinct options, got ${parsed.length}` };
    }
    return { ok: true, stop: { kind: "choice", objects: parsed.map(optionToObject) } };
  }

  const question = asText(stop.question);
  if (question === null) return { ok: false, error: "a puzzle stop needs a question" };
  const answerType = asText(stop.answer_type ?? stop.answerType);
  if (answerType !== "pick" && answerType !== "number" && answerType !== "text") {
    return { ok: false, error: 'a puzzle stop needs answer_type of "pick", "number" or "text"' };
  }
  const answers = asStringArray(stop.answers ?? stop.accepted_answers);
  if (answers.length === 0) return { ok: false, error: "a puzzle stop needs at least one accepted answer" };
  if (!answersAgree(answers, answerType)) {
    return {
      ok: false,
      error:
        "the accepted answers are not all the same answer. A puzzle has one correct answer; every string in answers must be another way of saying it.",
    };
  }
  let choices = asStringArray(stop.choices);
  if (answerType === "pick") {
    if (choices.length < 2) choices = answers.slice(0, 4);
    if (choices.length < 2) return { ok: false, error: "a pick puzzle needs at least two choices" };
  } else {
    choices = [];
  }
  const success = validateChildIntent(stop.success, "success");
  if (!success.ok) return { ok: false, error: success.error };
  const failure = validateChildIntent(stop.failure, "failure");
  if (!failure.ok) return { ok: false, error: failure.error };
  return {
    ok: true,
    stop: {
      kind: "puzzle",
      question,
      answer_type: answerType,
      choices: choices.length === 0 ? null : choices,
      answers,
      success: success.child,
      failure: failure.child,
    },
  };
}

function validateChildIntent(
  raw: unknown,
  id: "success" | "failure",
): { ok: true; child: DirectorChildIntent } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") return { ok: false, error: `a puzzle stop needs a ${id} intent` };
  const child = raw as Record<string, unknown>;
  const leadsTo = asText(child.leads_to ?? child.leadsTo);
  if (leadsTo === null) return { ok: false, error: `the ${id} intent needs leads_to` };
  const label = asText(child.label) ?? (id === "success" ? "Solved it" : "Got it wrong");
  return {
    ok: true,
    child: {
      id,
      label,
      leads_to: leadsTo,
      clip_prompt: asText(child.clip_prompt ?? child.clipPrompt) ?? undefined,
      narration: asText(child.narration) ?? undefined,
      spoken_line: shortenSpokenLine(asText(child.spoken_line ?? child.spokenLine) ?? label),
    },
  };
}

export function answersAgree(answers: string[], answerType: "pick" | "number" | "text"): boolean {
  if (answers.length <= 1) return true;
  const normalised = answers.map((answer) =>
    answer.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(),
  );
  if (answerType === "number") {
    const digits = answers.map((answer) => answer.replace(/[^0-9]/g, "").replace(/^0+/, ""));
    return digits.every((value) => value !== "" && value === digits[0]);
  }
  const tokenSets = normalised.map((answer) => new Set(answer.split(" ").filter(Boolean)));
  const first = tokenSets[0];
  return tokenSets.every((tokens) => {
    if (tokens.size === 0 || first.size === 0) return false;
    let hits = 0;
    for (const token of tokens) {
      if (first.has(token)) hits += 1;
    }
    return hits / Math.max(first.size, tokens.size) >= (answerType === "pick" ? 0.8 : 0.6);
  });
}

function validateState(raw: unknown, beatsLeft: number): DirectorBeatState {
  const fallback: DirectorBeatState = { items: [], trust: 0, clues: [], beats_left: beatsLeft };
  if (raw === null || typeof raw !== "object") return fallback;
  const state = raw as Record<string, unknown>;
  const trust = Number(state.trust);
  return {
    items: asStringArray(state.items).slice(0, 12),
    trust: Number.isFinite(trust) ? Math.max(-5, Math.min(5, Math.round(trust))) : 0,
    clues: asStringArray(state.clues).slice(0, 12),
    beats_left: beatsLeft,
  };
}

function validateEnding(raw: unknown): { title: string; summary: string } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const ending = raw as Record<string, unknown>;
  const title = asText(ending.title);
  const summary = asText(ending.summary);
  if (title === null || summary === null) return null;
  return { title, summary };
}

function asText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim() !== "") out.push(entry.trim());
    else if (typeof entry === "number" && Number.isFinite(entry)) out.push(String(entry));
  }
  return out;
}

export function fallbackBeat(options: {
  beatIndex: number;
  beatsLeft: number;
  expectedKind: "choice" | "puzzle" | "ending";
  state: DirectorBeatState;
  characterName?: string;
}): DirectorBeat {
  const state = { ...options.state, beats_left: options.beatsLeft };
  const speaker = options.characterName ?? "The man in the grey coat";
  if (options.expectedKind === "ending") {
    return {
      beat_id: `b${options.beatIndex}`,
      clip_prompt: buildH3Prompt({
        mode: "t2va",
        shotSize: "wide shot",
        cameraMove: "Pull Out",
        cameraNote: PROFILE.cameraNote,
        light: "streetlights from behind, going out one by one",
        materials: "wet stone and worn asphalt",
        preserved: null,
        beats: [
          "The protagonist walks out of the street into a wide empty intersection.",
          "The streetlights go out one by one behind them.",
          "Their boots slow on the wet stone and then stop.",
          "The intersection stays empty, with the dark street behind them still in frame.",
        ],
        ambience: "Footsteps fade on wet stone. A streetlight ticks off, then another, and the street hum drops.",
        ending:
          "They come to rest; the camera settles into a static wide framing with the intersection, the dark street and the last streetlight clearly separated.",
        cast: PROFILE.cast,
      }),
      narration: "The city closes behind you.",
      spoken_line: "Go on then. I will keep the corner.",
      stop: null,
      state,
      ending: {
        title: "The Long Walk",
        summary:
          "You followed one wet street to its end, made your calls, and walked out with the night still unfinished.",
      },
    };
  }
  if (options.expectedKind === "puzzle") {
    return {
      beat_id: `b${options.beatIndex}`,
      clip_prompt: buildH3Prompt({
        mode: "t2va",
        shotSize: "medium shot",
        cameraMove: "Push In",
        cameraNote: PROFILE.cameraNote,
        light: "a streetlight from above",
        materials: "brushed metal on the locker, brick, and worn paint",
        preserved: null,
        beats: [
          "The protagonist stops under a streetlight.",
          "A metal locker stands against a brick wall.",
          "Three painted marks sit on the locker door, large enough to count, with a keypad beside the handle.",
          "Their hand hovers near the keypad and does not press it.",
        ],
        ambience: "A streetlight hums. Cloth shifts. The metal locker gives a soft tick as it cools.",
        ending:
          "They come to rest; the camera settles into a static wide framing with the locker, the three painted marks and the keypad clearly separated.",
        cast: PROFILE.cast,
      }),
      narration: "Three marks on the locker door. The keypad wants a number.",
      spoken_line: "Three marks on the door. How many is that? Say the number.",
      stop: {
        kind: "puzzle",
        question: "The locker door shows three painted marks. How many marks are on the door?",
        answer_type: "number",
        choices: null,
        answers: ["3", "three"],
        success: {
          id: "success",
          label: "The locker opens",
          leads_to: "The locker falls open on a staircase going down.",
          narration: "The locker gives way.",
          spoken_line: "There. Down you go.",
        },
        failure: {
          id: "failure",
          label: "The lock holds",
          leads_to: "The keypad buzzes red and the streetlight above cuts out.",
          narration: "The lock holds and the light dies.",
          spoken_line: "Wrong. Now the light is out.",
        },
      },
      state,
      ending: null,
    };
  }
  return {
    beat_id: `b${options.beatIndex}`,
    clip_prompt: buildH3Prompt({
      mode: "t2va",
      shotSize: "wide shot",
      cameraMove: "Static Shot",
      cameraNote: null,
      light: "a lit doorway from the left",
      materials: "wet stone, worn brick, and painted metal on the van",
      preserved: null,
      beats: [
        "The protagonist stands at a junction in the rain.",
        "A lit doorway is on the left.",
        "An alley mouth opens beside the building.",
        "A parked van sits at the kerb, all three still in the wide frame.",
      ],
      ambience: "Rain ticks on wet stone and the van roof. A doorway hums. No voices.",
      ending:
        "They come to rest; the camera settles into a static wide framing with the lit doorway, the alley mouth and the parked van clearly separated.",
      cast: PROFILE.cast,
    }),
    narration: "Three ways on, and the rain is getting worse.",
    spoken_line: "Three ways out of this rain. Which one are you taking?",
    stop: {
      kind: "choice",
      objects: (
        [
          {
            id: "a",
            label: "Take the lit doorway",
            target: "lit doorway",
            leads_to: "Push through the lit doorway into the room beyond.",
            narration: "The door gives on the first shove.",
            spoken_line: "The door gives. Come in.",
          },
          {
            id: "b",
            label: "Take the alley",
            target: "alley mouth",
            leads_to: "Walk into the dark alley beside the building.",
            narration: "The alley swallows the light behind you.",
            spoken_line: "The alley is shorter than it looks.",
          },
          {
            id: "c",
            label: "Take the van",
            target: "parked van",
            leads_to: "Try the handle of the parked van at the kerb.",
            narration: "The van is not locked.",
            spoken_line: "It is not locked. Get in.",
          },
        ] as DirectorOption[]
      ).map(optionToObject),
    },
    state,
    ending: null,
  };
}

export function speechMapperMessages(args: {
  character: string;
  question: string;
  spokenLine: string;
  options: { id: string; label: string; target: string }[];
  transcript: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        `You map what a player said out loud to one of the options a story character has already offered. The character is ${args.character}.`,
        "",
        "Rules:",
        "1. Choose only from the option ids you are given. Never invent an option and never reword one.",
        "2. If what the player said does not clearly mean one of the options, or they said nothing usable, answer with option_id null.",
        "3. reply is a short line in the character's voice asking again, under twelve words. Only write a reply when option_id is null.",
        "4. Reply with a single JSON object and nothing else:",
        '{ "option_id": "a" | "b" | "c" | null, "reply": "..." | null }',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `${args.character} asked out loud: "${args.spokenLine}"`,
        `The offer on the table: ${args.question}`,
        "",
        "The options, which are physical things the player can also tap:",
        ...args.options.map((option) => `- ${option.id}: ${option.label} (${option.target})`),
        "",
        `The player said: "${args.transcript}"`,
      ].join("\n"),
    },
  ];
}

export function graderMessages(args: {
  question: string;
  answers: string[];
  transcript: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You grade a spoken answer to one short question. The player answered out loud, so the transcript comes from speech recognition and may misspell names, numbers or homophones.",
        "Accept a spoken answer that means the same thing as an accepted answer, including a homophone or a different word order.",
        "Reply with a single JSON object and nothing else:",
        '{ "correct": true | false }',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Question: ${args.question}`,
        `Accepted answers: ${args.answers.join(" | ")}`,
        `The player said: "${args.transcript}"`,
      ].join("\n"),
    },
  ];
}
