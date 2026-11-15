import type { Box } from "./types";

type MockOption = { id: string; label: string; box: Box | null; to: string; delay: number };
type MockBranch = { to: string; delay: number; label: string };

export type MockNode = {
  clip: string;
  narration: string;
  stop:
    | null
    | { kind: "choice"; options: MockOption[] }
    | {
        kind: "puzzle";
        question: string;
        answerType: "pick" | "number" | "text";
        choices: string[] | null;
        accept: string[];
        success: MockBranch;
        failure: MockBranch;
      };
  ending?: { title: string; summary: string; text: { character: string; number: string | null; prompt: string } };
};

export const episode = {
  id: "mock-last-light",
  title: "The Last Light",
  tagline: "The city is going dark. You have until dawn.",
  posterUrl: "mock://poster",
  beatsTotal: 6,
  start: "street",
};

const riddle = {
  kind: "puzzle" as const,
  question: "The more of me there is, the less you see. Say my name.",
  answerType: "text" as const,
  choices: null,
  accept: ["darkness", "dark", "the dark", "the darkness"],
  success: { to: "dawn", delay: 1600, label: "Named the dark" },
  failure: { to: "tower", delay: 7000, label: "Lost for words" },
};

export const spoken: Record<string, { line: string; audioUrl: string }> = {
  street: { line: "Three ways through the dark. Which one?", audioUrl: "mock://voice/street" },
  car: { line: "Somebody left the lights on for you. Where to?", audioUrl: "mock://voice/car" },
  oldstreet: { line: "Hey. You lost? Where are you headed?", audioUrl: "mock://voice/oldstreet" },
  overpass: { line: "Do you hear that? Which way?", audioUrl: "mock://voice/overpass" },
  plant: { line: "Count the red words. That is the code.", audioUrl: "mock://voice/plant" },
  stranger: { line: "I vanish the moment you say my name. What am I?", audioUrl: "mock://voice/stranger" },
  church: { line: "You made it. Now choose.", audioUrl: "mock://voice/church" },
  redroom: { line: "Wrong answer. Pick a way out.", audioUrl: "mock://voice/redroom" },
  towers: { line: "The more of me there is, the less you see. Say my name.", audioUrl: "mock://voice/riddle" },
  lights: { line: "The more of me there is, the less you see. Say my name.", audioUrl: "mock://voice/riddle" },
};

export const unheard = { reply: "Say that again? I did not catch it.", replyAudioUrl: "mock://voice/reply" };

export const nodes: Record<string, MockNode> = {
  street: {
    clip: "mock://street",
    narration: "Midnight. One by one, the windows are going dark.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "Head for the last lit lobby", box: null, to: "car", delay: 1400 },
        { id: "b", label: "Take the old street", box: null, to: "oldstreet", delay: 2600 },
        { id: "c", label: "Cut under the overpass", box: null, to: "overpass", delay: 10500 },
      ],
    },
  },
  car: {
    clip: "mock://car",
    narration: "One lobby still glows. Someone left the gate open.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "The offices", box: { x: 0.22, y: 0.08, w: 0.56, h: 0.26 }, to: "plant", delay: 1500 },
        { id: "b", label: "The lobby", box: { x: 0.13, y: 0.5, w: 0.31, h: 0.2 }, to: "stranger", delay: 2400 },
        { id: "c", label: "The gate", box: { x: 0.5, y: 0.49, w: 0.34, h: 0.25 }, to: "plant", delay: 3000 },
      ],
    },
  },
  oldstreet: {
    clip: "mock://oldstreet",
    narration: "Headlights. The driver slows, watching you.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "The driver", box: { x: 0.2, y: 0.58, w: 0.62, h: 0.2 }, to: "stranger", delay: 1500 },
        { id: "b", label: "The orange sign", box: { x: 0.13, y: 0.4, w: 0.24, h: 0.2 }, to: "plant", delay: 2400 },
        { id: "c", label: "Keep walking", box: null, to: "plant", delay: 3000 },
      ],
    },
  },
  overpass: {
    clip: "mock://overpass",
    narration: "Under the overpass, the city sounds far away.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "The spire", box: { x: 0.33, y: 0.08, w: 0.34, h: 0.3 }, to: "plant", delay: 1500 },
        { id: "b", label: "The red glow", box: { x: 0.52, y: 0.6, w: 0.4, h: 0.27 }, to: "stranger", delay: 2400 },
        { id: "c", label: "Wait and listen", box: null, to: "stranger", delay: 3000 },
      ],
    },
  },
  plant: {
    clip: "mock://plant",
    narration: "The power plant. Its gate wants a code.",
    stop: {
      kind: "puzzle",
      question: "How many words still glow red on the sign?",
      answerType: "number",
      choices: null,
      accept: ["5"],
      success: { to: "church", delay: 1500, label: "Cracked the gate code" },
      failure: { to: "redroom", delay: 2200, label: "Tripped the alarm" },
    },
  },
  stranger: {
    clip: "mock://stranger",
    narration: "\u201CLooking for the light too?\u201D she says. \u201CAnswer me first.\u201D",
    stop: {
      kind: "puzzle",
      question: "I vanish the moment you say my name. What am I?",
      answerType: "pick",
      choices: ["A shadow", "Silence", "The dark"],
      accept: ["silence"],
      success: { to: "church", delay: 1500, label: "Answered the stranger" },
      failure: { to: "redroom", delay: 2200, label: "Got the riddle wrong" },
    },
  },
  church: {
    clip: "mock://church",
    narration: "It opens. At the end of the nave, two figures are waiting.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "The window", box: { x: 0.33, y: 0.02, w: 0.34, h: 0.24 }, to: "towers", delay: 1500 },
        { id: "b", label: "The two figures", box: { x: 0.3, y: 0.42, w: 0.4, h: 0.36 }, to: "lights", delay: 2400 },
        { id: "c", label: "Slip into the pews", box: null, to: "towers", delay: 3000 },
      ],
    },
  },
  redroom: {
    clip: "mock://redroom",
    narration: "Wrong. The floor answers with blue fire.",
    stop: {
      kind: "choice",
      options: [
        { id: "a", label: "The red door", box: { x: 0.5, y: 0.04, w: 0.46, h: 0.52 }, to: "towers", delay: 1500 },
        { id: "b", label: "The fire", box: { x: 0.22, y: 0.62, w: 0.32, h: 0.3 }, to: "lights", delay: 2400 },
        { id: "c", label: "Back away slowly", box: null, to: "lights", delay: 3000 },
      ],
    },
  },
  towers: {
    clip: "mock://towers",
    narration: "From up here the whole city tilts. A voice asks for the password.",
    stop: riddle,
  },
  lights: {
    clip: "mock://lights",
    narration: "The lights smear into colour. A voice asks for the password.",
    stop: riddle,
  },
  dawn: {
    clip: "mock://dawn",
    narration: "The sun comes up over a city that is still humming.",
    stop: null,
    ending: {
      title: "First Light",
      summary: "You kept the power on until morning.",
      text: { character: "The woman in the neon window", number: "+14155550137", prompt: "The lights stayed on. Who are you?" },
    },
  },
  tower: {
    clip: "mock://tower",
    narration: "The tower stays dark. But now you know its name.",
    stop: null,
    ending: {
      title: "The Long Night",
      summary: "The city slept in the dark. It will remember you.",
      text: { character: "The woman in the neon window", number: null, prompt: "What was the password?" },
    },
  },
};
