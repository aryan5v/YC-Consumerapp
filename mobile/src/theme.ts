import { Easing } from "react-native";

// Synqui: Paper Mono, minimal and glassy, a daydream. Moonstone is the light, Lagoon the base,
// Blossom the one stand-out (selection, the primary action, a scene's single warm light).
// Every visual token lives here so a direction can be swapped in one pass.

const accent = "#FF8E9E";
const moonstone = "#E8EEF1";
const lagoon = "#0E2C36";
const lagoonDeep = "#071A21";

export const colors = {
  bg: lagoonDeep,
  deep: lagoon,
  black: "#000000",
  white: "#FFFFFF",
  text: moonstone,
  dim: "#A9BCC3",
  faint: "rgba(232,238,241,0.42)",
  inactive: "rgba(232,238,241,0.32)",
  passed: moonstone,
  hairline: "rgba(232,238,241,0.14)",
  wash: "rgba(232,238,241,0.06)",
  washActive: "rgba(232,238,241,0.18)",
  glass: "rgba(14,44,54,0.5)",
  scrim: "rgba(7,26,33,0.4)",
  holdDim: "rgba(7,26,33,0.14)",
  puzzleDim: "rgba(7,26,33,0.34)",
  letterboxVeil: "rgba(7,26,33,0.45)",
  textShadow: "rgba(4,16,21,0.8)",
  tag: "rgba(14,44,54,0.55)",
  glow: accent,
  accent,
  accentInk: "#2A0E14",
  bubble: "#E9E9EB",
  bubbleInk: "#000000",
};

export const gradients = {
  home: { colors: ["rgba(7,26,33,0.62)", "rgba(7,26,33,0)", "rgba(7,26,33,0.55)", "rgba(7,26,33,0.96)"], locations: [0, 0.24, 0.56, 0.92] },
  ending: { colors: ["rgba(7,26,33,0.15)", "rgba(7,26,33,0.8)", "rgba(7,26,33,0.97)"], locations: [0, 0.34, 0.72] },
  playerTop: { colors: ["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"], locations: [0, 1] },
  playerBottom: { colors: ["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"], locations: [0, 1] },
} as const;

// Three strokes on one shape, bottom to top: a dark contrast ring, the accent halo, a white core.
export const glow = {
  silhouette: moonstone,
  gradientEnd: lagoon,
  silhouetteWidth: 2,
  silhouetteBlur: 4,
  silhouetteFill: 0.45,
  color: accent,
  contrast: "rgba(0,0,0,0.5)",
  contrastWidth: 6,
  haloWidth: 7,
  blur: 6,
  haloOpacity: [0.5, 1],
  core: "#FFFFFF",
  coreWidth: 2,
  coreOpacity: [0.8, 1],
  wash: 0.07,
  washChosen: 0.22,
  chosenScale: [1, 1.06, 1.02],
  radius: 16,
  labelHeight: 22,
  labelGap: 16,
};

// Liquid Glass for controls floating over video. Fallback is a material blur where the system
// effect is unavailable, and a solid fill when Reduce Transparency is on.
export const glass = {
  tint: "rgba(255,142,158,0.3)",
  fallbackBlur: 30,
  fallbackFill: "rgba(14,44,54,0.42)",
  solidFill: "rgba(14,44,54,0.95)",
  sheetBlur: 22,
};

export const letterbox = {
  blur: 40,
  thumbWidth: 240,
};

export const radius = {
  round: 999,
  button: 14,
  card: 16,
  sheet: 26,
  field: 14,
  key: 20,
  control: 15,
  bubble: 18,
};

export const fonts = {
  title: "PaperMono-Thin",
  display: "PaperMono-Light",
  displayItalic: "PaperMono-Light",
  ui: "PaperMono-Regular",
  uiMedium: "PaperMono-Medium",
  uiSemibold: "PaperMono-Medium",
  mono: "PaperMono-Regular",
  monoMedium: "PaperMono-Medium",
};

export const fontFiles = {
  "PaperMono-Thin": require("../assets/fonts/paper-mono/PaperMono-Thin.ttf"),
  "PaperMono-ExtraLight": require("../assets/fonts/paper-mono/PaperMono-ExtraLight.ttf"),
  "PaperMono-Light": require("../assets/fonts/paper-mono/PaperMono-Light.ttf"),
  "PaperMono-Regular": require("../assets/fonts/paper-mono/PaperMono-Regular.ttf"),
  "PaperMono-Medium": require("../assets/fonts/paper-mono/PaperMono-Medium.ttf"),
};

// Home ASCII scene (src/components/AsciiScene.tsx). Glyph advance is 0.606em in Paper Mono, so the
// grid fits the screen width exactly at fontSize = width / (cols * advance).
export const ascii = {
  advance: 0.606,
  lineHeight: 1,
  silver: moonstone,
  silverOpacity: 0.5,
  amber: accent,
  amberOpacity: 0.62,
  highlight: "#FFFFFF",
  glow: [
    { period: 5200, delay: 0, min: 0.05, max: 1 },
    { period: 7300, delay: 1800, min: 0.1, max: 0.85 },
    { period: 9100, delay: 3900, min: 0.05, max: 0.95 },
  ],
  flicker: { min: 0.55, max: 0.9, period: 3100 },
  rain: [
    { color: "#AEB8C6", opacity: 0.2, duration: 5200, density: 0.035, seed: 11 },
    { color: "#AEB8C6", opacity: 0.12, duration: 8400, density: 0.03, seed: 29 },
  ],
  rainGlyphs: "|'.`:",
  sceneOpacity: 0.95,
  dissolve: {
    inMs: 900,
    outMs: 520,
    veil: 0.55,
    caption: "·  the next scene is forming  ·",
    layers: [
      { color: moonstone, opacity: 0.38, density: 0.42, seed: 7, period: 2600 },
      { color: "#BFD3D9", opacity: 0.5, density: 0.12, seed: 41, period: 3400 },
      { color: accent, opacity: 0.7, density: 0.03, seed: 97, period: 1900 },
    ],
  },
  top: 70,
  ornament: "·  ─ ─ ─  ✦  ─ ─ ─  ·",
  ornamentColor: "rgba(232,238,241,0.32)",
  ornamentSize: 12,
  ornamentTracking: 2,
  monoTracking: 1.2,
};

export const type = {
  micro: 11,
  tag: 11,
  small: 14,
  label: 14,
  control: 15,
  body: 14,
  lead: 15,
  caption: 16,
  teaser: 18,
  key: 20,
  question: 21,
  wordmark: 22,
  stat: 28,
  digits: 38,
  endTitle: 34,
  endStat: 40,
  hero: 34,
  labelTracking: 1.5,
};

export const motion = {
  silhouette: 240,
  instant: 70,
  fade: 180,
  quick: 240,
  chosen: 260,
  sheet: 380,
  settle: 420,
  base: 520,
  gentle: 640,
  slow: 760,
  slower: 900,
  spin: 1100,
  pulse: 1600,
  waitPulse: 2400,
  hold: 7000,
  holdScale: 1.045,
  drift: 16000,
};

export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
};
