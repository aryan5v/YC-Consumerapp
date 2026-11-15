import { Easing, Platform } from "react-native";

export const colors = {
  bg: "#07070A",
  text: "#F4F1EA",
  dim: "rgba(244,241,234,0.66)",
  faint: "rgba(244,241,234,0.38)",
  hairline: "rgba(244,241,234,0.16)",
  wash: "rgba(244,241,234,0.07)",
  glass: "rgba(10,10,14,0.46)",
  glow: "#FFC46B",
};

export const fonts = {
  display: Platform.select({ ios: "Didot", default: "serif" }),
  ui: Platform.select({ ios: "Avenir Next", default: "sans-serif" }),
};

export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};
