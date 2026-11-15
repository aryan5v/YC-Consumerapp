import { ChatMessage } from "./deepseek";

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

export type DirectorChoiceStop = {
  kind: "choice";
  options: DirectorOption[];
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

export function buildDirectorMessages(context: DirectorContext, previousError?: string): ChatMessage[] {
  const character = context.character.name;
  const system = [
    "You are the director of Fork, a daily interactive animated video story. Each turn you write exactly one beat.",
    "",
    "A beat is one shot of about five seconds that ends on a decision the player makes by watching the shot. The player may answer by tapping a target or by saying their answer out loud, so the character has to ask for it in words.",
    "",
    "Hard rules:",
    "1. Write action and setting only. Never write style, palette, colour, lighting, lens, camera or rendering words; the studio appends a fixed style bible to every shot and a stray style word breaks consistency.",
    "2. Continuity. The same protagonist, the same night, the same street, the same moment. No time skips, no new characters you did not introduce, no weather changes.",
    "3. Every target must be a physical object that is actually visible in the shot you just wrote for this beat, and the shot ends on a steady wide frame where all the targets are separated.",
    `4. ${character} speaks in every shot. spoken_line is the line ${character} says out loud at the end of the shot, just before it settles into the wide decision frame. It must be fourteen words or fewer so it fits in about four seconds: count them. Write it as speech, not as a caption: contractions, plain words, no stage directions, no quotation marks inside it.`,
    "5. A puzzle must have exactly one correct answer, and every string in answers must be another way of saying that same answer, never a second answer.",
    "6. Every target must use the words of the clip_prompt you wrote for this same beat: the shot has to actually show the thing the option names.",
    "7. Failure is never game over. A failed puzzle sends the story somewhere worse and more interesting.",
    "8. Reply with a single JSON object and nothing else. No prose, no markdown fence.",
  ].join("\n");

  const choiceShape = [
    "{",
    '  "beat_id": "b<index>",',
    '  "clip_prompt": "1-3 sentences of on-screen action and setting for this shot",',
    '  "narration": "one line of narration, present tense, under 14 words",',
    '  "spoken_line": "what the character says out loud at the end of this shot, under 14 words",',
    '  "stop": {',
    '    "kind": "choice",',
    '    "options": [',
    '      { "id": "a", "label": "3-5 word verb phrase shown on a chip", "target": "a physical thing the shot you just wrote actually shows, using its words", "leads_to": "one line: what happens if the player picks this", "narration": "one narration line for the shot that follows" },',
    '      { "id": "b", ... },',
    '      { "id": "c", ... }',
    "    ]",
    "  },",
    '  "state": { "items": [], "trust": 0, "clues": [], "beats_left": <N> },',
    '  "ending": null',
    "}",
  ].join("\n");

  const puzzleShape = [
    "{",
    '  "beat_id": "b<index>",',
    '  "clip_prompt": "1-3 sentences of on-screen action and setting for this shot",',
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
    '  "clip_prompt": "1-3 sentences: the closing shot of this path",',
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
      "Write the very next beat of that choice happening, as one shot. The shot must show the choice actually happening, and it must end on a stop that the player can answer from what that shot shows. If the stop is a puzzle, the answer must be visible or hearable in the shot you write.",
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

type ValidationResult = { ok: true; beat: DirectorBeat } | { ok: false; error: string };

export function validateBeat(
  raw: unknown,
  options: { expectedKind: "choice" | "puzzle" | "ending"; beatsLeft: number; beatIndex: number },
): ValidationResult {
  if (raw === null || typeof raw !== "object") return { ok: false, error: "response was not a JSON object" };
  const source = raw as Record<string, unknown>;

  const clipPrompt = asText(source.clip_prompt ?? source.clipPrompt);
  if (clipPrompt === null) return { ok: false, error: "clip_prompt must be a non-empty string" };
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
        clip_prompt: clipPrompt,
        narration,
        spoken_line: shortenSpokenLine(topSpoken ?? narration),
        stop: null,
        state,
        ending,
      },
    };
  }

  if (ending !== null) return { ok: false, error: "ending must be null before the last beat" };
  const stop = validateStop(source.stop, options.expectedKind, clipPrompt);
  if (!stop.ok) return { ok: false, error: stop.error };
  const spokenLine = shortenSpokenLine(
    topSpoken ?? (stop.stop.kind === "puzzle" ? stop.stop.question : DEFAULT_SPOKEN_LINE),
  );
  return {
    ok: true,
    beat: { beat_id: beatId, clip_prompt: clipPrompt, narration, spoken_line: spokenLine, stop: stop.stop, state, ending: null },
  };
}

function validateStop(
  raw: unknown,
  expectedKind: "choice" | "puzzle" | "ending",
  clipPrompt: string,
): { ok: true; stop: DirectorStop } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") return { ok: false, error: "stop must be an object on a non-final beat" };
  const stop = raw as Record<string, unknown>;
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
    return { ok: true, stop: { kind: "choice", options: parsed } };
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
      clip_prompt:
        "The protagonist walks out of the street into a wide empty intersection as the streetlights go out one by one behind them.",
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
      clip_prompt:
        "The protagonist stops under a streetlight where a metal locker stands against a brick wall with three painted marks on its door and a keypad beside the handle.",
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
    clip_prompt:
      "The protagonist stands at a junction in the rain where a lit doorway, an alley mouth and a parked van are all visible in one wide shot.",
    narration: "Three ways on, and the rain is getting worse.",
    spoken_line: "Three ways out of this rain. Which one are you taking?",
    stop: {
      kind: "choice",
      options: [
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
      ],
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
