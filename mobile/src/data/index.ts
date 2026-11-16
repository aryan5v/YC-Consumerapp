import { createContext, useContext } from "react";
import { clerkEnabled, createConvexProvider } from "./convexProvider";
import { mockProvider } from "./mockProvider";
import type { StoryProvider } from "./types";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

export const convexStory: StoryProvider | null = url ? createConvexProvider(url) : null;
export const mockStory = mockProvider;
export { clerkEnabled };

export const StoryContext = createContext<StoryProvider>(convexStory ?? mockStory);
export const useStory = () => useContext(StoryContext);

export * from "./types";
export { audioSource, imageSource, videoSource } from "./assets";
