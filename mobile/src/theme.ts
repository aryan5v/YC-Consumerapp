import { Easing, Platform } from "react-native";

// Every visual token lives here so a design direction can be applied in one pass.

export const colors = {
  bg: "#07070A",
  black: "#000000",
  text: "#F4F1EA",
  dim: "rgba(244,241,234,0.66)",
  faint: "rgba(244,241,234,0.38)",
  inactive: "rgba(244,241,234,0.25)",
  passed: "rgba(244,241,234,0.7)",
  hairline: "rgba(244,241,234,0.16)",
  wash: "rgba(244,241,234,0.07)",
  washActive: "rgba(244,241,234,0.2)",
  glass: "rgba(10,10,14,0.46)",
  scrim: "rgba(0,0,0,0.4)",
  holdDim: "rgba(0,0,0,0.16)",
  letterboxVeil: "rgba(7,7,10,0.5)",
  textShadow: "rgba(0,0,0,0.85)",
  glow: "#FFC46B",
};

export const gradients = {
  home: { colors: ["rgba(7,7,10,0.62)", "rgba(7,7,10,0)", "rgba(7,7,10,0.55)", "rgba(7,7,10,0.96)"], locations: [0, 0.24, 0.56, 0.92] },
  ending: { colors: ["rgba(7,7,10,0.15)", "rgba(7,7,10,0.8)", "rgba(7,7,10,0.97)"], locations: [0, 0.34, 0.72] },
  playerTop: { colors: ["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"], locations: [0, 1] },
  playerBottom: { colors: ["rgba(0,0,0,0)", "rgba(0,0,0,0.66)"], locations: [0, 1] },
} as const;

export const glow = {
  color: colors.glow,
  edgeWidth: 1.5,
  haloWidth: 2.5,
  blur: 16,
  haloOpacity: [0.3, 0.95],
  haloScale: 1.03,
  bloomWidth: 7,
  bloomOpacity: [0.06, 0.24],
  flashOpacity: 0.42,
  maxRadius: 22,
};

export const letterbox = {
  blur: 40,
  thumbWidth: 240,
};

export const radius = {
  pill: 999,
  sheet: 30,
  field: 18,
  key: 16,
  control: 5,
};

export const fonts = {
  display: Platform.select({ ios: "Didot", default: "serif" }),
  ui: Platform.select({ ios: "Avenir Next", default: "sans-serif" }),
};

export const type = {
  micro: 12,
  tag: 13,
  small: 14,
  label: 15,
  control: 16,
  body: 17,
  lead: 18,
  teaser: 21,
  key: 23,
  question: 25,
  wordmark: 26,
  stat: 30,
  digits: 42,
  endTitle: 44,
  endStat: 48,
  hero: 52,
};

export const motion = {
  instant: 70,
  quick: 240,
  settle: 420,
  base: 520,
  gentle: 640,
  slow: 760,
  slower: 900,
  spin: 1100,
  pulse: 1500,
  hold: 11000,
  holdScale: 1.055,
  drift: 16000,
};

export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};
