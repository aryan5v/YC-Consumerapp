import type { Region } from "./types";

type MockOption = { id: string; label: string; region: Region | null; to: string; delay: number };
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
        { id: "a", label: "Head for the last lit lobby", region: null, to: "car", delay: 1400 },
        { id: "b", label: "Take the old street", region: null, to: "oldstreet", delay: 2600 },
        { id: "c", label: "Cut under the overpass", region: null, to: "overpass", delay: 10500 },
      ],
    },
  },
  car: {
    clip: "mock://car",
    narration: "One lobby still glows. Someone left the gate open.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a", label: "The offices",
          region: { centroid: { x: 0.65, y: 0.28 }, polygon: [[0.32, 0.043], [0.663, 0.057], [1, 0.045], [1, 0.489], [0.32, 0.505]], maskUrl: null },
          to: "plant", delay: 1500,
        },
        {
          id: "b", label: "The lobby",
          region: { centroid: { x: 0.364, y: 0.551 }, polygon: [[0.213, 0.539], [0.325, 0.509], [0.828, 0.509], [0.828, 0.534], [0.47, 0.56], [0.47, 0.695], [0.428, 0.692], [0.409, 0.635], [0.4, 0.604], [0.38, 0.594], [0.352, 0.596], [0.338, 0.623], [0.334, 0.679], [0.213, 0.682]], maskUrl: null },
          to: "stranger", delay: 2400,
        },
        {
          id: "c", label: "The gate",
          region: { centroid: { x: 0.648, y: 0.623 }, polygon: [[[0.47, 0.56], [0.798, 0.532], [0.8, 0.696], [0.701, 0.705], [0.47, 0.701]], [[0.839, 0.504], [1, 0.49], [1, 0.765], [0.838, 0.744]]], maskUrl: null },
          to: "plant", delay: 3000,
        },
      ],
    },
  },
  oldstreet: {
    clip: "mock://oldstreet",
    narration: "Headlights. The driver slows, watching you.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a", label: "The driver",
          region: { centroid: { x: 0.863, y: 0.699 }, polygon: [[0.813, 0.657], [0.84, 0.65], [0.874, 0.653], [0.9, 0.666], [0.914, 0.687], [0.909, 0.704], [0.934, 0.721], [0.963, 0.733], [0.972, 0.746], [0.727, 0.748], [0.742, 0.731], [0.781, 0.714], [0.807, 0.704], [0.799, 0.683]], maskUrl: null },
          to: "stranger", delay: 1500,
        },
        {
          id: "b", label: "The orange sign",
          region: { centroid: { x: 0.249, y: 0.526 }, polygon: [[0.167, 0.502], [0.243, 0.487], [0.261, 0.47], [0.271, 0.429], [0.286, 0.468], [0.337, 0.464], [0.337, 0.512], [0.305, 0.523], [0.294, 0.553], [0.245, 0.568], [0.181, 0.6], [0.161, 0.597], [0.159, 0.548]], maskUrl: null },
          to: "plant", delay: 2400,
        },
        { id: "c", label: "Keep walking", region: null, to: "plant", delay: 3000 },
      ],
    },
  },
  overpass: {
    clip: "mock://overpass",
    narration: "Under the overpass, the city sounds far away.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a", label: "The spire",
          region: { centroid: { x: 0.489, y: 0.286 }, polygon: [[0.38, 0.201], [0.487, 0.102], [0.591, 0.202], [0.54, 0.512], [0.45, 0.513]], maskUrl: null },
          to: "plant", delay: 1500,
        },
        {
          id: "b", label: "The red glow",
          region: { centroid: { x: 0.683, y: 0.705 }, polygon: [[0.642, 0.647], [0.718, 0.629], [0.8, 0.621], [0.794, 0.667], [0.765, 0.701], [0.716, 0.732], [0.671, 0.757], [0.612, 0.782], [0.616, 0.745], [0.63, 0.705]], maskUrl: null },
          to: "stranger", delay: 2400,
        },
        { id: "c", label: "Wait and listen", region: null, to: "stranger", delay: 3000 },
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
        {
          id: "a", label: "The window",
          region: { centroid: { x: 0.5, y: 0.126 }, polygon: [[[0.368, 0.239], [0.363, 0.079], [0.372, 0.054], [0.391, 0.034], [0.42, 0.031], [0.452, 0.036], [0.479, 0.053], [0.48, 0.157], [0.435, 0.158], [0.408, 0.17], [0.413, 0.186], [0.474, 0.194], [0.474, 0.219], [0.369, 0.24]], [[0.522, 0.218], [0.523, 0.194], [0.572, 0.189], [0.594, 0.178], [0.594, 0.165], [0.565, 0.157], [0.523, 0.157], [0.523, 0.051], [0.545, 0.037], [0.575, 0.031], [0.605, 0.037], [0.628, 0.057], [0.64, 0.078], [0.638, 0.24]]], maskUrl: null },
          to: "towers", delay: 1500,
        },
        {
          id: "b", label: "The two figures",
          region: { centroid: { x: 0.499, y: 0.694 }, polygon: [[[0.46, 0.622], [0.474, 0.621], [0.487, 0.627], [0.49, 0.637], [0.485, 0.643], [0.497, 0.649], [0.5, 0.671], [0.497, 0.701], [0.487, 0.71], [0.485, 0.735], [0.497, 0.752], [0.482, 0.755], [0.469, 0.744], [0.464, 0.717], [0.457, 0.735], [0.457, 0.753], [0.442, 0.754], [0.444, 0.727], [0.451, 0.706], [0.441, 0.687], [0.436, 0.658], [0.441, 0.648], [0.459, 0.641], [0.458, 0.634]], [[0.516, 0.631], [0.534, 0.632], [0.542, 0.64], [0.539, 0.648], [0.552, 0.658], [0.559, 0.685], [0.562, 0.697], [0.555, 0.703], [0.547, 0.685], [0.548, 0.706], [0.538, 0.732], [0.534, 0.746], [0.543, 0.751], [0.533, 0.755], [0.519, 0.752], [0.519, 0.724], [0.513, 0.719], [0.512, 0.751], [0.498, 0.753], [0.497, 0.716], [0.498, 0.681], [0.5, 0.654], [0.512, 0.647], [0.51, 0.64]]], maskUrl: null },
          to: "lights", delay: 2400,
        },
        { id: "c", label: "Slip into the pews", region: null, to: "towers", delay: 3000 },
      ],
    },
  },
  redroom: {
    clip: "mock://redroom",
    narration: "Wrong. The floor answers with blue fire.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a", label: "The red door",
          region: { centroid: { x: 0.754, y: 0.349 }, polygon: [[0.5, 0], [1, 0], [1, 0.747], [0.5, 0.701]], maskUrl: null },
          to: "towers", delay: 1500,
        },
        {
          id: "b", label: "The fire",
          region: { centroid: { x: 0.384, y: 0.743 }, polygon: [[0.27, 0.768], [0.296, 0.76], [0.316, 0.75], [0.315, 0.728], [0.333, 0.712], [0.342, 0.691], [0.345, 0.674], [0.362, 0.692], [0.367, 0.709], [0.353, 0.728], [0.377, 0.719], [0.391, 0.693], [0.393, 0.668], [0.398, 0.648], [0.412, 0.64], [0.416, 0.653], [0.442, 0.664], [0.433, 0.686], [0.432, 0.706], [0.445, 0.716], [0.479, 0.716], [0.503, 0.725], [0.474, 0.734], [0.455, 0.738], [0.467, 0.751], [0.453, 0.758], [0.468, 0.768], [0.466, 0.78], [0.438, 0.783], [0.404, 0.778], [0.363, 0.778], [0.327, 0.776], [0.296, 0.776]], maskUrl: null },
          to: "lights", delay: 2400,
        },
        { id: "c", label: "Back away slowly", region: null, to: "lights", delay: 3000 },
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
