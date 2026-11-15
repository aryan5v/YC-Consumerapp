export const STYLE_BIBLE = [
  "Medium: painterly 2.5D animation, soft gouache brushwork over simple staged geometry, slightly imperfect frame-to-frame painting, nothing photoreal.",
  "Palette: warm sodium-orange streetlight against deep teal night shadow, wet reflective ground, one saturated accent colour per scene (red door, yellow rain jacket, pink neon).",
  "Lighting: one low key light with long soft shadows, cool rim light on the protagonist, haze in the air, no daylight.",
  "Camera: 35mm equivalent, shallow depth of field, locked-off shot or a very slow push-in, 24fps cadence, no zooms and no whip pans.",
  "Never in frame: readable signage or UI text, logos, watermarks, extra or malformed limbs, mirrored faces, crowds of more than three background people.",
].join("\n");

export const DECISION_FRAME_SUFFIX =
  "The last second is a steady wide shot held without camera movement, with the option targets clearly visible and well separated across the frame.";

export function styledPrompt(action: string): string {
  const body = action.trim().replace(/\s+/g, " ");
  return `${body}\n\nStyle bible: ${STYLE_BIBLE}\n\n${DECISION_FRAME_SUFFIX}`;
}
