import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { ReactNode } from "react";
import type { HomeView, RunView, SpeakResult, StoryProvider } from "./types";

// Flip once the backend's beat guard is deployed; the deployed validators reject unknown arguments until then.
const BEAT_GUARD = false;
const guard = (expectedBeatId: string) => (BEAT_GUARD ? { expectedBeatId } : {});

type Guarded = { expectedBeatId?: string };

const api = {
  today: makeFunctionReference<"query", Record<string, never>, HomeView>("home:today"),
  startToday: makeFunctionReference<"mutation", Record<string, never>, string>("runs:startToday"),
  view: makeFunctionReference<"query", { runId: string }, RunView>("runs:view"),
  choose: makeFunctionReference<"mutation", { runId: string; optionId: string } & Guarded, null>("runs:choose"),
  answer: makeFunctionReference<"mutation", { runId: string; answer: string } & Guarded, { correct: boolean }>("runs:answer"),
  speakUploadUrl: makeFunctionReference<"mutation", Record<string, never>, string>("runs:speakUploadUrl"),
  speak: makeFunctionReference<"action", { runId: string; audioStorageId: string } & Guarded, SpeakResult>("runs:speak"),
  setPhone: makeFunctionReference<"mutation", { phone: string }, null>("users:setPhone"),
};

export function createConvexProvider(url: string): StoryProvider {
  const client = new ConvexReactClient(url);
  return {
    name: "convex",
    canReplay: false,
    Root: ({ children }: { children: ReactNode }) => <ConvexProvider client={client}>{children}</ConvexProvider>,
    useHome: () => useQuery(api.today, {}),
    useRun: (runId) => useQuery(api.view, runId ? { runId } : "skip"),
    startToday: () => client.mutation(api.startToday, {}),
    choose: async (runId, optionId, expectedBeatId) => {
      await client.mutation(api.choose, { runId, optionId, ...guard(expectedBeatId) });
    },
    answer: (runId, answer, expectedBeatId) => client.mutation(api.answer, { runId, answer, ...guard(expectedBeatId) }),
    speak: async (runId, recordingUri, expectedBeatId) => {
      const uploadUrl = await client.mutation(api.speakUploadUrl, {});
      const recording = await (await fetch(recordingUri)).blob();
      if (recording.size === 0) throw new Error("Empty recording");
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "audio/mp4" }, body: recording });
      if (!upload.ok) throw new Error(`Upload failed (${upload.status})`);
      const { storageId } = (await upload.json()) as { storageId: string };
      return client.action(api.speak, { runId, audioStorageId: storageId, ...guard(expectedBeatId) });
    },
    voiceReady: () => client.mutation(api.speakUploadUrl, {}).then(
      () => true,
      () => false,
    ),
    setPhone: async (phone) => {
      await client.mutation(api.setPhone, { phone });
    },
  };
}
