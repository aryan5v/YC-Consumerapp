import { createConvexProvider } from "./convexProvider";
import { mockProvider } from "./mockProvider";
import type { StoryProvider } from "./types";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

export const story: StoryProvider = url ? createConvexProvider(url) : mockProvider;
export * from "./types";
export { audioSource, imageSource, videoSource } from "./assets";
