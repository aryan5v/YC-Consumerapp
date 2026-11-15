import { H3Shot, PROFILE, buildH3Prompt, isH3Prompt, normalizeCameraMove } from "./h3";

export const STYLE_BIBLE = [
  `${PROFILE.opener} ${PROFILE.look}.`,
  `Colour: ${PROFILE.colour}.`,
  `Camera: one move per shot from the guide's vocabulary, usually ${PROFILE.cameraNote}.`,
  `Cast: ${PROFILE.cast}.`,
  "Sound: ambient and physical action only. No dialogue and no music; the character's voice comes from the app.",
  PROFILE.never,
].join("\n");

export const DECISION_FRAME_SUFFIX =
  "They come to rest; the camera settles into a static wide framing with the main objects clearly separated and none cut off by the frame edge.";

const PADS = [
  "The same hands continue that one action and nothing else.",
  "Cloth and the nearest surface shift only as far as the action requires.",
  "The motion slows and the hands come to rest.",
];

function sentences(action: string): string[] {
  return action
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function shotFromAction(action: string, mode: "t2va" | "i2va"): H3Shot {
  const parts = sentences(action);
  const settling = parts.find((part) => /wide/i.test(part) && /settl|rest|static/i.test(part));
  const body = parts.filter((part) => part !== settling);
  const beats = body.slice(0, 5);
  let pad = 0;
  while (beats.length < 4) {
    beats.push(PADS[pad % PADS.length]);
    pad += 1;
  }
  const named = action.match(
    /\b(Static Shot|Push In|Pull Out|Truck Left|Truck Right|Pan Left|Pan Right|Tilt Up|Tilt Down|Pedestal Up|Pedestal Down|Arc Shot|Tracking Shot)\b/i,
  );
  const cameraMove = named === null ? "Pull Out" : (normalizeCameraMove(named[1]) ?? "Pull Out");
  const lightMatch = parts.find((part) => /\b(lamp|sun|window|skylight|bulb|tube|light)\b/i.test(part));
  return {
    mode,
    shotSize: "medium wide shot",
    cameraMove,
    cameraNote: cameraMove === "Static Shot" ? null : PROFILE.cameraNote,
    light: lightMatch ?? "a single practical lamp from the left",
    materials: "wet stone, worn wood and brushed metal",
    preserved: mode === "i2va" ? "identity, clothing, colours, key objects and spatial layout" : null,
    beats,
    ambience: "Room tone under the physical sounds of the action, with no music and no voices.",
    ending: settling ?? DECISION_FRAME_SUFFIX,
    cast: PROFILE.cast,
  };
}

export function clipPrompt(action: string, mode: "t2va" | "i2va" = "t2va"): string {
  const body = action.trim().replace(/\s+/g, " ");
  if (body === "") return "";
  if (isH3Prompt(body)) return body;
  return buildH3Prompt(shotFromAction(body, mode));
}
