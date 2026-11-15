import { DirectorBeat, DirectorBeatState, DirectorStop, validateBeat } from "./director";

type FixtureEntry = {
  clip_prompt: string;
  narration: string;
  stop: DirectorStop;
  items?: string[];
  clues?: string[];
  trust?: number;
};

const STORE_SCENE =
  "You step off the last bus onto a wet street at night, a small paper parcel taped inside your jacket. On the left a shuttered shop with a red door; ahead the street runs long under sodium lamps; on the corner a man in a grey coat leans against the wall and watches you.";

const FIXTURE: FixtureEntry[] = [
  {
    clip_prompt: `${STORE_SCENE} The parcel hums faintly against your chest and the man on the corner turns his head toward the sound.`,
    narration: "The parcel hums. Three ways out of this street.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a",
          label: "Go into the store",
          target: "red store door",
          leads_to: "Push through the red door of the shuttered shop and duck inside before the man looks up.",
          narration: "You shoulder the red door open.",
        },
        {
          id: "b",
          label: "Walk down the street",
          target: "street ahead",
          leads_to: "Walk straight on down the wet street, past the man, toward the lights at the far end.",
          narration: "You walk straight. The street gets longer than it should.",
        },
        {
          id: "c",
          label: "Talk to the man",
          target: "man in grey coat",
          leads_to: "Cross to the corner and ask the man in the grey coat for a light while you watch his hands.",
          narration: "He looks at your jacket before he looks at your face.",
        },
      ],
    },
  },
  {
    clip_prompt:
      "Inside the shop a single buzzing fluorescent tube lights shelves of dusty cans and a narrow counter with an old cash register. The clerk behind the counter wears a green visor and has not blinked since the bell rang. The parcel is still hidden under the jacket.",
    narration: "The clerk has not blinked since you came in.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a",
          label: "Show the parcel",
          target: "paper parcel",
          leads_to: "Slide the parcel across the counter and ask the clerk what it is.",
          narration: "The clerk looks at the parcel, then at the till.",
        },
        {
          id: "b",
          label: "Slip behind the counter",
          target: "narrow counter",
          leads_to: "Duck behind the counter and look for the door to the back room.",
          narration: "The counter is lower than it looked.",
        },
        {
          id: "c",
          label: "Buy a soda",
          target: "fridge door",
          leads_to: "Open the fridge, pay for a soda and study the clerk's hands while he counts the change.",
          narration: "He counts the change twice.",
        },
      ],
    },
    items: ["a paper parcel"],
  },
  {
    clip_prompt:
      "The clerk's hand hovers over the cash register keypad. A receipt curls out of the register with four digits printed on it, cold and out of order, and the clock on the wall behind him reads a little past one.",
    narration: "Four digits on the receipt. The register wants them in order.",
    clues: ["a receipt with four digits printed out of order"],
    stop: {
      kind: "puzzle",
      question: "The receipt shows four digits out of order. What is the code?",
      answer_type: "number",
      choices: null,
      answers: ["4187"],
      success: {
        id: "success",
        label: "The drawer opens",
        leads_to: "The register drawer slides open on a key to the back room.",
        narration: "The drawer gives.",
      },
      failure: {
        id: "failure",
        label: "The register locks",
        leads_to: "The register buzzes red and locks, and the clerk finally turns his head toward you.",
        narration: "The register buzzes and locks.",
      },
    },
    trust: 1,
  },
  {
    clip_prompt:
      "The back room of the shop is stacked with cardboard and lit by one hanging bulb. A metal door with a bar across it faces a small high window that shows the street, and a stack of boxes sits in the dark between them.",
    narration: "Two ways out of the back room, and one of them is watched.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a",
          label: "Take the metal door",
          target: "metal back door",
          leads_to: "Lift the bar and shoulder open the metal door at the back of the room.",
          narration: "The bar comes up with a sound like a cough.",
        },
        {
          id: "b",
          label: "Climb out the window",
          target: "high window",
          leads_to: "Drag the boxes under the high window and climb out onto the fire escape.",
          narration: "The window frame is colder than the air.",
        },
        {
          id: "c",
          label: "Wait in the dark",
          target: "stack of boxes",
          leads_to: "Pull the boxes over yourself and wait in the dark for the clerk to give up.",
          narration: "You make yourself small behind the boxes.",
        },
      ],
    },
    items: ["a paper parcel", "a back room key"],
  },
  {
    clip_prompt:
      "Back on the street, the man in the grey coat has moved off the corner and stands between you and the end of the road, one hand open, the other inside his coat. A phone box on the pavement and a narrow service stair beside it are both within reach.",
    narration: "He counted your lies before you told them.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a",
          label: "Head for the corner",
          target: "open corner",
          leads_to: "Walk straight at the man and the open corner behind him.",
          narration: "You walk at him without slowing down.",
        },
        {
          id: "b",
          label: "Use the phone box",
          target: "phone box",
          leads_to: "Step into the phone box and lift the receiver as if you had somewhere to call.",
          narration: "The receiver is already warm.",
        },
        {
          id: "c",
          label: "Take the service stair",
          target: "service stair",
          leads_to: "Take the narrow service stair beside the phone box up to the rooftops.",
          narration: "The stair turns back on itself twice.",
        },
      ],
    },
    trust: 1,
  },
  {
    clip_prompt:
      "The man in the grey coat stands close enough to see the parcel through the jacket. He holds up two fingers and points at a coin on the wet pavement, then at the red door behind you and the long street ahead.",
    narration: "He wants a coin, or he wants the truth.",
    stop: {
      kind: "puzzle",
      question: "The man asks: which door did you come out of?",
      answer_type: "pick",
      choices: ["The red door", "The long street"],
      answers: ["The red door"],
      success: {
        id: "success",
        label: "He steps aside",
        leads_to: "You tell him the red door. He nods once and steps aside.",
        narration: "He steps aside.",
      },
      failure: {
        id: "failure",
        label: "He does not move",
        leads_to: "You tell him the long street. He smiles and does not move at all.",
        narration: "He smiles and does not move.",
      },
    },
    clues: ["the man counts lies"],
    trust: 2,
  },
  {
    clip_prompt:
      "You leave the corner behind and walk out into a wide empty intersection as the streetlights go out one by one behind you, the parcel still sealed against your chest.",
    narration: "The city closes behind you. The parcel is still humming.",
    stop: {
      kind: "choice",
      options: [
        {
          id: "a",
          label: "Unwrap the parcel",
          target: "paper parcel",
          leads_to: "Sit on the kerb and finally tear the tape off the parcel.",
          narration: "The tape comes away in one piece.",
        },
        {
          id: "b",
          label: "Walk on",
          target: "empty intersection",
          leads_to: "Keep walking with the parcel sealed and never look back.",
          narration: "You keep walking.",
        },
        {
          id: "c",
          label: "Go back",
          target: "dark street behind",
          leads_to: "Turn around and walk back toward the shop and the man.",
          narration: "You turn around.",
        },
      ],
    },
    items: ["a paper parcel"],
  },
];

const ENDING: DirectorBeat["ending"] = {
  title: "The Humming Parcel",
  summary:
    "You carried one parcel across one wet street, past a clerk who never blinked and a man in a grey coat who counted your lies, and walked out of it with the parcel still sealed.",
};

export function fixtureBeat(options: {
  depth: number;
  beatsTotal: number;
  state: DirectorBeatState;
  pathLabels: string[];
}): DirectorBeat {
  const beatsLeft = Math.max(1, options.beatsTotal - options.depth);
  const state: DirectorBeatState = {
    items: options.state.items,
    trust: options.state.trust,
    clues: options.state.clues,
    beats_left: beatsLeft,
  };
  const entry = FIXTURE[options.depth];
  const isLast = options.depth >= options.beatsTotal - 1;
  if (entry === undefined || isLast) {
    const last = FIXTURE[FIXTURE.length - 1];
    const summary = `${ENDING!.summary}${pathSummarySuffix(options.pathLabels)}`;
    return {
      beat_id: `b${options.depth}`,
      clip_prompt: last.clip_prompt,
      narration: last.narration,
      stop: null,
      state: { items: state.items, trust: state.trust, clues: state.clues, beats_left: beatsLeft },
      ending: { title: ENDING!.title, summary },
    };
  }
  return {
    beat_id: `b${options.depth}`,
    clip_prompt: entry.clip_prompt,
    narration: entry.narration,
    stop: entry.stop,
    state: {
      items: entry.items ?? state.items,
      trust: entry.trust ?? state.trust,
      clues: entry.clues ?? state.clues,
      beats_left: beatsLeft,
    },
    ending: null,
  };
}

function pathSummarySuffix(pathLabels: string[]): string {
  if (pathLabels.length === 0) return "";
  return ` Your path: ${pathLabels.join(" then ")}.`;
}

export function fixtureValidatedBeat(options: {
  depth: number;
  beatsTotal: number;
  state: DirectorBeatState;
  pathLabels: string[];
}) {
  const raw = fixtureBeat(options);
  const isLast = options.depth >= options.beatsTotal - 1;
  return validateBeat(raw, {
    expectedKind: isLast ? "ending" : raw.stop === null ? "ending" : raw.stop.kind,
    beatsLeft: Math.max(1, options.beatsTotal - options.depth),
    beatIndex: options.depth,
  });
}
