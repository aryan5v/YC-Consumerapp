import { Easing } from "react-native";

// Direction A, Night cinema (handoffs/fork-design/tokens.md). Every visual token lives here so a
// direction can be swapped in one pass.

const accent = "#F5A442";

export const colors = {
  bg: "#0C0A08",
  black: "#000000",
  white: "#FFFFFF",
  text: "#F2EBDF",
  dim: "#A3988A",
  faint: "rgba(242,235,223,0.38)",
  inactive: "rgba(255,255,255,0.32)",
  passed: "#FFFFFF",
  hairline: "rgba(242,235,223,0.14)",
  wash: "rgba(242,235,223,0.045)",
  washActive: "rgba(242,235,223,0.16)",
  glass: "rgba(22,17,12,0.66)",
  scrim: "rgba(0,0,0,0.4)",
  holdDim: "rgba(0,0,0,0.16)",
  puzzleDim: "rgba(0,0,0,0.38)",
  letterboxVeil: "rgba(12,10,8,0.5)",
  textShadow: "rgba(0,0,0,0.85)",
  tag: "rgba(8,8,10,0.62)",
  glow: accent,
  accent,
  accentInk: "#1A1007",
  bubble: "#E9E9EB",
  bubbleInk: "#000000",
};

export const gradients = {
  home: { colors: ["rgba(12,10,8,0.62)", "rgba(12,10,8,0)", "rgba(12,10,8,0.55)", "rgba(12,10,8,0.96)"], locations: [0, 0.24, 0.56, 0.92] },
  ending: { colors: ["rgba(12,10,8,0.15)", "rgba(12,10,8,0.8)", "rgba(12,10,8,0.97)"], locations: [0, 0.34, 0.72] },
  playerTop: { colors: ["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"], locations: [0, 1] },
  playerBottom: { colors: ["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"], locations: [0, 1] },
} as const;

// Three strokes on one shape, bottom to top: a dark contrast ring, the accent halo, a white core.
export const glow = {
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
  tint: "rgba(245,164,66,0.28)",
  fallbackBlur: 30,
  fallbackFill: "rgba(22,17,12,0.55)",
  solidFill: "rgba(22,17,12,0.94)",
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
  key: 12,
  control: 5,
  bubble: 18,
};

export const fonts = {
  display: "CormorantGaramond_500Medium",
  displayItalic: "CormorantGaramond_500Medium_Italic",
  ui: "Inter_400Regular",
  uiMedium: "Inter_500Medium",
  uiSemibold: "Inter_600SemiBold",
};

export const type = {
  micro: 11,
  tag: 11,
  small: 14,
  label: 15,
  control: 16,
  body: 16,
  lead: 17,
  caption: 21,
  teaser: 22,
  key: 23,
  question: 27,
  wordmark: 28,
  stat: 32,
  digits: 44,
  endTitle: 46,
  endStat: 48,
  hero: 44,
  labelTracking: 1.5,
};

export const motion = {
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
