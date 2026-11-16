import { DirectorChoiceStop, DirectorStop, StopObject } from "./director";
import { I2VA_INSTRUCTION, PROFILE, buildH3Prompt } from "./h3";

// The case is authored, fixed data: one question, three answers, one solution, and six objects
// that each reveal one fact. The director never invents the puzzle, it only writes the shots.
export type CaseClue = {
  id: string;
  label: string;
  object: string;
  line: string;
  fact: string;
  rules_out: string | null;
  visual: string;
  sound: string;
};

export type CaseEnding = {
  id: "solved" | "failed";
  title: string;
  line: string;
  summary: string;
  visual: string;
  sound: string;
};

export type CaseData = {
  id: string;
  title: string;
  question: string;
  setup: string;
  answers: string[];
  solution: number;
  moves: number;
  hub: { visual: string; sound: string };
  clues: CaseClue[];
  endings: { solved: CaseEnding; failed: CaseEnding };
};

export const CASE_ONE: CaseData = {
  id: "pier-nine",
  title: "The Parcel at Pier Nine",
  question: "Who took the parcel from the pier office?",
  setup:
    "A sealed parcel left the counter of a small harbour delivery office while the courier stood on the quay. Three people worked that pier this afternoon: the lockkeeper, the porter, and the driver of the green van.",
  answers: ["Ada the lockkeeper", "Bram the porter", "Corvin the van driver"],
  solution: 2,
  moves: 5,
  hub: {
    visual:
      "the delivery office at the end of a working harbour pier at golden hour, the protagonist in a pale grey canvas jacket standing at the open counter where the canvas satchel used to sit, a green panel van parked at the loading bay behind them, wet stone underfoot, coils of rope and a brass key hook on the back wall, a torn strip of green wool caught on the pier gate, a dispatch radio in its cradle on the counter, bright low sun raking across the quay from the left",
    sound:
      "harbour water slapping the pilings, gulls, a rope creaking, the hollow clink of a winch, no music",
  },
  clues: [
    {
      id: "log",
      label: "the counter log",
      object: "the delivery log open on the counter",
      line: "The last signature in the log is a scrawl. It could be anyone's hand.",
      fact: "The signature proves nothing: all three of them wrote in that book today.",
      rules_out: null,
      visual:
        "the protagonist leans over the open delivery log on the counter, one finger on the last scrawled signature, the page bright and unreadable-looking under the low sun, a pen still clipped to the book",
      sound: "paper turning, the radio hissing quietly, water against the pilings",
    },
    {
      id: "bootprints",
      label: "the bootprints",
      object: "wet bootprints across the office floor",
      line: "Wet prints, straight from the counter to the green van. Somebody carried it out that way.",
      fact: "The prints run from the counter to the passenger door of the green van.",
      rules_out: null,
      visual:
        "the protagonist crouches to follow a line of dark wet bootprints across the office floorboards, the prints leading out through the loading bay door towards the green van's passenger side",
      sound: "boots on wet boards, the winch turning, gulls overhead",
    },
    {
      id: "keys",
      label: "the key hook",
      object: "the brass key hook on the back wall",
      line: "Ada was opening the lock across the harbour when the parcel alarm sounded. The harbourmaster confirms it.",
      fact: "The harbourmaster confirms Ada was across the harbour when the parcel disappeared.",
      rules_out: "Ada the lockkeeper",
      visual:
        "the protagonist looks up at the brass key hook on the office wall, a full ring of long harbour keys hanging untouched, dust visible on the hook plate around them",
      sound: "keys tapping the wall plate, the radio hiss, water outside",
    },
    {
      id: "gloves",
      label: "the porter's gloves",
      object: "work gloves folded on the bench",
      line: "Bram left these gloves at dawn. The tug captain confirms he was offshore when the parcel disappeared.",
      fact: "The tug captain confirms Bram was offshore when the parcel disappeared.",
      rules_out: "Bram the porter",
      visual:
        "the protagonist opens the porter's bench beside the loading door, where a pair of thick work gloves lies folded and dry on the slats, the wet yard visible behind through the open door",
      sound: "a bench lid lifting, canvas creaking, water slapping the pilings",
    },
    {
      id: "sleeve",
      label: "the torn sleeve",
      object: "a torn strip of green wool on the pier gate",
      line: "Green wool, caught on the gate latch. That is drivers' jacket green.",
      fact: "The torn green wool is the same green as the van drivers' jackets.",
      rules_out: null,
      visual:
        "the protagonist lifts a torn strip of green wool off the iron latch of the pier gate, holding it against the daylight, the green van standing beyond the gate with its passenger door open",
      sound: "wool tearing free, metal latch ringing, gulls, water",
    },
    {
      id: "radio",
      label: "the dispatch radio",
      object: "the dispatch radio in its cradle",
      line: "Dispatch logged the van out on the coast road. The van never left this pier.",
      fact: "Corvin's route log says the coast road, and the van never left the pier.",
      rules_out: null,
      visual:
        "the protagonist picks the dispatch radio out of its cradle on the counter, the speaker crackling, the green van's reflection standing in the dark office window glass behind them",
      sound: "radio static and a clipped dispatcher's voice under the hiss, water outside",
    },
  ],
  endings: {
    solved: {
      id: "solved",
      title: "The satchel comes back",
      line: "Corvin hands the satchel over at the gate. Three facts, and the van was never on the coast road.",
      summary: "You closed the case at Pier Nine with the parcel back on the counter.",
      visual:
        "the green van stopped at the pier gate in the last of the golden light, its driver in a green jacket handing the canvas satchel back to the protagonist, the pier office behind them with its counter light on",
      sound: "an engine idling, a canvas strap creaking, gulls settling, water against the pilings",
    },
    failed: {
      id: "failed",
      title: "The quay goes dark",
      line: "The van pulls out with the last of the light. The parcel goes with it.",
      summary: "The case at Pier Nine closed the wrong way, and the parcel left with the van.",
      visual:
        "the green van rolling out through the pier gate onto the coast road at dusk, the protagonist standing alone at the empty office counter with the light going out behind them",
      sound: "a van pulling away, the office light clicking off, water slapping the dark pilings",
    },
  },
};

export function readCase(raw: unknown): CaseData | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = raw as Partial<CaseData>;
  if (typeof candidate.question !== "string") return null;
  if (!Array.isArray(candidate.answers) || candidate.answers.length !== 3) return null;
  if (!Array.isArray(candidate.clues) || candidate.clues.length === 0) return null;
  if (typeof candidate.solution !== "number") return null;
  if (candidate.endings === undefined || candidate.hub === undefined) return null;
  return candidate as CaseData;
}

export function caseClue(data: CaseData, id: string): CaseClue | null {
  return data.clues.find((clue) => clue.id === id) ?? null;
}

export function caseMoves(data: CaseData): number {
  return typeof data.moves === "number" && data.moves > 0 ? data.moves : 5;
}

function hubPrompt(data: CaseData): string {
  return buildH3Prompt({
    mode: "t2va",
    shotSize: "wide shot",
    cameraMove: "Push In",
    cameraNote: "with small amplitude at slow speed",
    light: "a low golden-hour sun from camera left, raking long shadows across the wet quay",
    materials: "wet grey stone, weathered rope, painted iron, salt-dulled timber and brushed metal",
    preserved: null,
    beats: [
      data.hub.visual,
      "the protagonist sets both hands on the empty counter and looks along the quay",
      "the green van sits shut at the loading bay, its passenger door hanging slightly open",
    ],
    ambience: data.hub.sound,
    ending:
      "They come to rest at the counter; the camera settles into a static wide framing with the counter, the van and the gate clearly separated and none cut off by the frame edge",
    cast: PROFILE.cast,
  });
}

function cluePrompt(data: CaseData, clue: CaseClue): string {
  return buildH3Prompt({
    mode: "t2va",
    shotSize: "medium shot",
    cameraMove: "Tracking Shot",
    cameraNote: "with small amplitude at slow speed",
    light: "the same low golden-hour sun from camera left, the light steady through the shot",
    materials: "wet grey stone, salt-dulled timber, painted iron and worn canvas",
    preserved: "the pier, the office, the protagonist's clothing and the object's place on the quay",
    beats: [clue.visual, "the protagonist takes in what they are looking at and holds still for a beat"],
    ambience: clue.sound,
    ending:
      "They straighten up, the object stays clearly in frame and visible; the camera settles into a static wide framing with nothing cut off by the frame edge",
    cast: PROFILE.cast,
  });
}

function endingPrompt(data: CaseData, ending: CaseEnding): string {
  return buildH3Prompt({
    mode: "t2va",
    shotSize: "wide shot",
    cameraMove: "Pull Out",
    cameraNote: "with small amplitude at slow speed",
    light:
      ending.id === "solved"
        ? "the last low golden-hour sun from camera left, warm on the van's flank"
        : "dusk light going blue off the water, one small warm light still on in the office",
    materials: "wet grey stone, painted iron, brushed metal, salt-dulled timber",
    preserved: "the pier, the office, the protagonist's clothing and the cast of the scene",
    beats: [
      ending.visual,
      ending.id === "solved"
        ? "the protagonist takes the satchel and holds it against their chest"
        : "the protagonist stands at the counter and does not follow",
    ],
    ambience: ending.sound,
    ending:
      "The action comes to rest; the camera settles into a static wide framing with the protagonist, the van and the pier clearly separated and none cut off by the frame edge",
    cast: PROFILE.cast,
  });
}

// The stop the hub and every clue beat present: six objects, each one tap away from its fact.
export function caseStop(data: CaseData, used: string[]): DirectorChoiceStop {
  const objects: StopObject[] = data.clues
    .filter((clue) => !used.includes(clue.id))
    .map((clue) => ({
      id: clue.id,
      label: clue.label,
      target: clue.object,
      region: null,
      actions: [
        {
          id: `${clue.id}1`,
          label: clue.label,
          clip_prompt: cluePrompt(data, clue),
          narration: clue.fact,
          spoken_line: clue.line,
        },
      ],
    }));
  return { kind: "choice", objects };
}

export function caseStopObjects(data: CaseData, stop: unknown, used: string[]): StopObject[] {
  const stored = stop as DirectorStop | undefined;
  const objects = stored !== undefined && stored.kind === "choice" ? stored.objects : caseStop(data, used).objects;
  return objects.filter((object) => !used.includes(object.id));
}

export function caseBeatPayload(data: CaseData): {
  clipPrompt: string;
  spokenLine: string;
  narration: string;
  stop: DirectorChoiceStop;
} {
  return {
    clipPrompt: hubPrompt(data),
    spokenLine: data.question,
    narration: data.setup,
    stop: caseStop(data, []),
  };
}

export function caseEndingChildren(data: CaseData): {
  optionId: string;
  label: string;
  clipPrompt: string;
  spokenLine: string;
  narration: string;
}[] {
  return [data.endings.solved, data.endings.failed].map((ending) => ({
    optionId: ending.id,
    label: ending.title,
    clipPrompt: endingPrompt(data, ending),
    spokenLine: ending.line,
    narration: ending.summary,
  }));
}

export function caseEnding(data: CaseData, id: string | undefined): CaseEnding | null {
  if (id === "solved") return data.endings.solved;
  if (id === "failed") return data.endings.failed;
  return null;
}

export function isCaseChoice(objectId: string): boolean {
  return objectId !== "solved" && objectId !== "failed";
}

export function caseScenes(data: CaseData) {
  return [
    { key: "opening", prompt: hubPrompt(data), line: data.question, narration: data.setup },
    ...data.clues.map((clue) => ({ key: clue.id, prompt: cluePrompt(data, clue), line: clue.line, narration: clue.fact })),
    ...[data.endings.solved, data.endings.failed].map((ending) => ({
      key: ending.id, prompt: endingPrompt(data, ending), line: ending.line, narration: ending.summary,
    })),
  ];
}

export function checkCaseLogic(data: CaseData): boolean {
  const eliminated = new Set(data.clues.flatMap((clue) => clue.rules_out === null ? [] : [clue.rules_out]));
  const remaining = data.answers.filter((answer) => !eliminated.has(answer));
  return data.answers.length === 3 && new Set(data.answers).size === 3 &&
    data.moves === 5 && data.clues.length === 6 && new Set(data.clues.map((clue) => clue.id)).size === 6 &&
    remaining.length === 1 && remaining[0] === data.answers[data.solution];
}

export const CASE_CONTINUITY = `[Shot 1] Live-action, cinematic, a wide shot inside the small delivery office at Pier Nine, a working harbour with a wet stone quay immediately outside. ${PROFILE.cast}. They retain exactly this face and clothing throughout. A worn wooden counter crosses the lower foreground: an open cream-paper ledger sits at its left end, folded brown work gloves sit in the middle, and a clearly visible handheld black radio, about twenty-five centimetres tall, stands upright in its charging cradle at the right end. A ring of brass keys hangs from a hook on the back wall. Distinct dark boot-sole impressions cross the wet floor toward the open doorway. A palm-sized torn green wool scrap is caught on the nearby iron gate latch, never a banner or a sheet. Through the doorway an unbranded green panel van has completely blank sides. These objects retain their positions unless the one action explicitly moves them. It is late afternoon at golden hour, clear weather, dry air with no rain or fog. One low sun shines from camera left toward camera right. Wet grey stone, salt-dulled timber, worn canvas, weathered rope and painted iron retain their natural colours and textures. A 35 mm lens stays at a camera height of 1.55 metres with a medium depth of field, showing the protagonist and nearby objects rather than a distant landscape. The camera holds a Static Shot with zero amplitude and zero speed. There are no cuts, zooms, lighting changes, new locations, wardrobe changes, logos, signs or readable text within the shot.`;

const CASE_ACTIONS: Record<string, [string, string]> = {
  opening: ["The protagonist lays two empty hands on the counter and surveys the empty parcel space between the ledger and gloves", "The protagonist pauses beside the counter, rests an open hand beside the empty parcel space and looks toward the doorway"],
  log: ["The protagonist turns one cream ledger page with a relaxed open hand, revealing one small ink smudge rather than readable writing", "The protagonist gently lifts the corner of a cream ledger page and lets it settle flat beside an indistinct ink smudge"],
  bootprints: ["The protagonist steps aside and points with an open hand toward the dark, separated boot-sole impressions on the wet floor leading to the van", "The protagonist slowly crouches beside one clear dark boot-sole impression without covering it, then looks along the trail toward the doorway"],
  keys: ["The protagonist lightly touches the ring of brass keys on its wall hook, making the keys swing once while keeping the open hand plainly visible", "The protagonist raises one open hand toward the brass keys hanging from their hook, pauses short of touching them and lowers the hand"],
  gloves: ["The protagonist lifts the dry folded brown work gloves from the counter with two relaxed hands, displaying their dry worn leather", "The protagonist unfolds one dry brown work glove on the counter with one open hand, leaving both gloves fully visible"],
  sleeve: ["The protagonist gently frees the palm-sized torn green wool scrap from the iron gate latch and holds it flat in one open palm", "The protagonist points beside the small green wool scrap caught on the iron latch, then carefully lifts just one loose corner of the scrap"],
  radio: ["The protagonist lifts the clearly visible handheld black radio from its desk cradle, brings it near the shoulder and listens without hiding the radio with the hand", "The protagonist steadies the handheld black radio upright on the desk with one relaxed hand and tilts the head slightly to listen to its speaker"],
  solved: ["At the open doorway the driver in a plain green jacket offers a small canvas satchel, and the protagonist receives it with two relaxed hands", "The driver in a plain green jacket places the canvas satchel on the counter, and the protagonist draws it toward the empty parcel space"],
  failed: ["The protagonist remains at the empty counter as the green van slowly rolls beyond the open doorway and out of sight", "The protagonist lowers an empty hand beside the ledger while the green van slowly passes out of the doorway view, leaving the parcel space empty"],
};

export function caseScenesForVersion(data: CaseData, version: string) {
  const scenes = caseScenes(data);
  if (version !== "pier-nine-v2") return scenes;
  return scenes.map((scene) => {
    const instruction = scene.key === "opening" ? "" : `${I2VA_INSTRUCTION}\n\n`;
    const prompt = (action: string) => `${instruction}integrated_multimodal_description: ${CASE_CONTINUITY} In the first second the protagonist remains in the starting pose and the props stay still. During the middle three seconds, ${action.charAt(0).toLowerCase()}${action.slice(1)}. The protagonist completes that one physical action and relaxes their hands without changing position again. The final second is a steady wide shot held without camera movement, with the main objects well lit, clearly separated and none cut off by the frame edge.\n\noverall_soundscape: Harbour water slaps the pilings, gulls call in the distance, a rope creaks and the physical sounds of the one action remain quiet under the scene; no dialogue.\n\nnon_diegetic_music: N/A`;
    return {
      ...scene,
      prompt: prompt(CASE_ACTIONS[scene.key][0]),
      alternatePrompt: prompt(CASE_ACTIONS[scene.key][1]),
    };
  });
}
