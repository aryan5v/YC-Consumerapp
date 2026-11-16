import { CINEMATIC_PROFILE, DEFAULT_CAST, type Landmark, type Slot } from "./world";

export const WORLD_CACHE_VERSION = "landmarks-clear-v1";
export const WORLD_CACHE_SEED = 8741;
export const WORLD_CACHE_CLOCK = { timeOfDay: 18.5, day: 1, weather: "clear" as const, palette: null, mood: "" };
export const WORLD_CACHE_LANDMARKS: Landmark[] = [
  { slot: "lighthouse", name: "The Last Light", description: "An old sea tower keeps a patient amber watch over the valley." },
  { slot: "arch", name: "The Moon Gate", description: "Silver-blue stones frame a road that has outlived its makers." },
  { slot: "boat", name: "The Ferryman’s Boat", description: "A narrow wooden rowboat waits with its oars crossed and a lantern burning." },
  { slot: "cabin", name: "The Keeper’s Cabin", description: "Honey-colored light spills through the window of a weathered cedar cabin." },
  { slot: "lantern", name: "The Wayside Lantern", description: "A small flame hangs from a curled iron arm, sheltering a circle of warmth." },
  { slot: "well", name: "The Wishing Well", description: "A rope descends into dark water beneath a little roof of midnight slate." },
  { slot: "stranger", name: "The Cloaked Stranger", description: "A hooded traveler holds a tiny lantern. Their face is lost in the blue dark." },
];

const BEATS: Record<Slot, { place: string; action: string; ending: string; sound: string; narration: string }> = {
  lighthouse: {
    place: "a salt-weathered limestone lighthouse on a grassy headland, its iron balcony above a worn oak door, blue-green sea beyond",
    action: "Mira rests her right palm against the cool limestone beside the closed door; her fingertips settle into a shallow groove as grass bends once in the breeze",
    ending: "the lighthouse doorway, Mira and the curving gravel path",
    sound: "A light sea breeze brushes the grass; distant surf breaks below the headland and wool softly rubs against stone.",
    narration: "The stone still holds the day's warmth.",
  },
  arch: {
    place: "a freestanding arch of silver-blue granite blocks with weathered mortar and sparse moss beside a pale gravel path",
    action: "Mira takes one unhurried step beneath the arch and stops, her coat hem settling against her grey boots",
    ending: "the intact stone arch, Mira and the empty path through its opening",
    sound: "One boot crunches on gravel, a wool coat rustles and a light breeze passes through grass.",
    narration: "The road continues beneath the old stones.",
  },
  boat: {
    place: "a narrow clinker-built wooden rowboat at the edge of a sheltered blue-green inlet, crossed ash oars on its seats and a small brass lantern secured at its bow",
    action: "Mira steadies the oak gunwale with her right hand as one small wave lifts the hull and lets it settle against wet pebbles",
    ending: "the complete rowboat, Mira on the bank and the pebbled shoreline",
    sound: "A small wave laps against the hull, old oak creaks once and pebbles shift beneath the keel.",
    narration: "The boat rocks once, then waits.",
  },
  cabin: {
    place: "a weathered cedar cabin with a dark slate roof, a closed plank door and one honey-lit glass window facing a stone doorstep",
    action: "Mira pushes the cedar door inward with her right palm until it rests open; a narrow pool of warm interior light reaches the stone doorstep",
    ending: "the open cabin doorway, the lit window and Mira beside the doorstep",
    sound: "An iron hinge creaks gently, cedar brushes against the threshold and the coastal wind stirs nearby grass.",
    narration: "The keeper's door opens quietly.",
  },
  lantern: {
    place: "a small brass-and-glass lantern hanging from a curled wrought-iron arm beside a gravel path, its sheltered flame visible against deep blue-green trees",
    action: "Mira steadies the lantern's brass base with her right hand; its small pendulum swing diminishes until the glass panes become still",
    ending: "the whole lantern and iron post, Mira and the gravel path",
    sound: "The hanging ring gives one faint metallic tick; a small flame flickers behind glass while wind moves the leaves.",
    narration: "The small light steadies in your hand.",
  },
  well: {
    place: "a round limestone well beneath a little midnight-slate roof, a thick hemp rope around an oak spindle and a wooden bucket resting on the broad stone rim",
    action: "Mira rests her right hand on the dry oak bucket handle; the handle settles against its iron fittings while the rope hangs motionless into dark water",
    ending: "the complete roofed well, the bucket on its rim and Mira beside it",
    sound: "The bucket's iron fitting clicks softly against wood; a drop echoes inside the well beneath a light wind.",
    narration: "A single drop answers from below.",
  },
  stranger: {
    place: "a quiet junction between a pale gravel path and coastal grass, where a hooded traveler holds a tiny brass lantern",
    action: "Mira remains still at the left of the path as the traveler inclines their hood once in a small greeting; the lantern remains in their right hand at waist height",
    ending: "Mira at the left, the cloaked traveler at the right and the open gravel path between them",
    sound: "Heavy wool shifts softly, the lantern ring gives a faint tick and a sea breeze brushes the grass.",
    narration: "The stranger offers a silent greeting.",
  },
};

export function worldCacheScenes() {
  return WORLD_CACHE_LANDMARKS.flatMap((landmark, index) => {
    const beat = BEATS[landmark.slot];
    const cast = `Mira, ${DEFAULT_CAST.look}`;
    const traveler = "a traveler of indeterminate gender in their forties, average build, hair concealed by a deep blue wool hood, a charcoal cloak, brown leather boots and a small silver clasp; their face stays inside the hood's shadow";
    const prompt = [
      `integrated_multimodal_description: [Shot 1] Live-action, cinematic, a wide vertical portrait shot frames ${cast} at ${beat.place}. This is a deliberate cut to a new angle. The image condition supplies Mira's identity, hair, clothing and eyebrow scar only, not a target frame, background, pose or lighting. It is 18:30 on day one, a clear coastal evening with remaining daylight, no rain, snow or mist. Low sun from camera-left gives soft pearl highlights to stone, skin and wool; open blue sky provides cool fill from camera-right, leaving natural blue-green shadows. ${landmark.slot === "stranger" ? `The only other person is ${traveler}.` : "No other person is present."} The camera holds a Static Shot at eye level with a 35 mm lens and medium depth of field. ${beat.action}. ${CINEMATIC_PROFILE} There is no speech. In the final second all action settles; the camera holds a steady wide composition with ${beat.ending} clearly separated and none cut off by the frame edge.`,
      "",
      `overall_soundscape: ${beat.sound}`,
      "",
      "non_diegetic_music: N/A",
    ].join("\n");
    return [1, 2].map((take) => ({
      key: `${landmark.slot}-take-${take}`,
      slot: landmark.slot,
      take,
      name: landmark.name,
      prompt,
      seed: WORLD_CACHE_SEED + index * 97 + (take - 1) * 1009,
      narration: beat.narration,
      change: landmark.slot === "cabin" ? { doorOpen: true } : {},
    }));
  });
}

export function canonicalWorldSlot(thingId: string): Slot | null {
  const match = /^-?\d+:-?\d+:(lighthouse|arch|boat|cabin|lantern|well|stranger)$/.exec(thingId);
  return match === null ? null : match[1] as Slot;
}
