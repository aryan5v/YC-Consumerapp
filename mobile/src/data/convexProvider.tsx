import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { ReactNode } from "react";
import { getDeviceToken, useDeviceToken } from "./device";
import type { ChoiceOption, ChoiceStop, ClipStatus, DreamView, HomeView, RunView, SpeakResult, StoryProvider } from "./types";

type DeviceArgs = { deviceToken: string };
type RunArgs = DeviceArgs & { runId: string; expectedBeatId: string };

type WireOption = Omit<ChoiceOption, "region" | "actions"> &
  Partial<Pick<ChoiceOption, "region" | "actions">> & {
    childStatus?: ClipStatus;
    childClipUrl?: string | null;
  };
type WireRunView = Omit<RunView, "stop"> & {
  stop: Exclude<RunView["stop"], ChoiceStop> | (Omit<ChoiceStop, "options"> & { options: WireOption[] });
};

const api = {
  today: makeFunctionReference<"query", DeviceArgs, HomeView>("home:today"),
  startToday: makeFunctionReference<"mutation", DeviceArgs, string>("runs:startToday"),
  view: makeFunctionReference<"query", DeviceArgs & { runId: string }, WireRunView>("runs:view"),
  choose: makeFunctionReference<"mutation", RunArgs & { optionId: string; actionId?: string }, null>("runs:choose"),
  solve: makeFunctionReference<"mutation", RunArgs & { answerId?: string; answerText?: string }, { solved: boolean }>("runs:solve"),
  dreamStart: makeFunctionReference<"mutation", DeviceArgs & { prompt: string }, { dreamId: string }>("dream:start"),
  dreamWatch: makeFunctionReference<"query", DeviceArgs & { dreamId: string }, DreamView>("dream:watch"),
  answer: makeFunctionReference<"mutation", RunArgs & { answer: string }, { correct: boolean }>("runs:answer"),
  speakUploadUrl: makeFunctionReference<"mutation", RunArgs, string>("runs:speakUploadUrl"),
  speak: makeFunctionReference<"action", RunArgs & { audioStorageId: string }, SpeakResult>("runs:speak"),
  interactUploadUrl: makeFunctionReference<"mutation", DeviceArgs & { thingId: string }, string>("world:interactUploadUrl"),
  interact: makeFunctionReference<
    "mutation",
    DeviceArgs & { thingId: string; name: string; description: string; screenshotStorageId: string; timeOfDay: number; day: number; state?: Record<string, unknown> },
    { interactionId: string; configure: Record<string, unknown>; transitionMs: number }
  >("world:interact"),
  watch: makeFunctionReference<
    "query",
    DeviceArgs & { interactionId: string },
    { clipUrl: string | null; outcome: { thingId: string; change: Record<string, unknown> }; configure: Record<string, unknown>; transitionMs: number }
  >("world:watch"),
  setPhone: makeFunctionReference<"mutation", DeviceArgs & { phone: string }, string | null>("users:setPhone"),
};

export function createConvexProvider(url: string): StoryProvider {
  const client = new ConvexReactClient(url);
  const legacyRuns = new Map<string, boolean>();
  return {
    name: "convex",
    canReplay: false,
    Root: ({ children }: { children: ReactNode }) => <ConvexProvider client={client}>{children}</ConvexProvider>,
    useHome: () => {
      const deviceToken = useDeviceToken();
      return useQuery(api.today, deviceToken ? { deviceToken } : "skip");
    },
    useRun: (runId) => {
      const deviceToken = useDeviceToken();
      const view = useQuery(api.view, runId && deviceToken ? { runId, deviceToken } : "skip");
      if (!view) return view;
      if (view.stop?.kind !== "choice") return { ...view, stop: view.stop };
      if (runId) legacyRuns.set(runId, view.stop.options.some((option) => option.actions === undefined));
      return {
        ...view,
        stop: {
          ...view.stop,
          options: view.stop.options.map((option) => ({
            id: option.id,
            label: option.label,
            region: option.region ?? null,
            actions: option.actions ?? [{
              id: "go",
              label: option.label,
              childStatus: option.childStatus ?? "generating",
              childClipUrl: option.childClipUrl ?? null,
            }],
          })),
        },
      };
    },
    startToday: async () => client.mutation(api.startToday, { deviceToken: await getDeviceToken() }),
    choose: async (runId, optionId, actionId, expectedBeatId) => {
      await client.mutation(api.choose, {
        runId,
        optionId,
        ...(legacyRuns.get(runId) ? {} : { actionId }),
        expectedBeatId,
        deviceToken: await getDeviceToken(),
      });
    },
    solve: async (runId, answerId, expectedBeatId) => {
      await client.mutation(api.solve, { runId, answerId, expectedBeatId, deviceToken: await getDeviceToken() });
    },
    solveText: async (runId, answerText, expectedBeatId) => {
      await client.mutation(api.solve, { runId, answerText, expectedBeatId, deviceToken: await getDeviceToken() });
    },
    dreamStart: async (prompt) => (await client.mutation(api.dreamStart, { prompt, deviceToken: await getDeviceToken() })).dreamId,
    useDream: (dreamId) => {
      const deviceToken = useDeviceToken();
      return useQuery(api.dreamWatch, dreamId && deviceToken ? { dreamId, deviceToken } : "skip");
    },
    answer: async (runId, answer, expectedBeatId) => client.mutation(api.answer, { runId, answer, expectedBeatId, deviceToken: await getDeviceToken() }),
    speak: async (runId, recordingUri, expectedBeatId) => {
      const deviceToken = await getDeviceToken();
      const uploadUrl = await client.mutation(api.speakUploadUrl, { runId, expectedBeatId, deviceToken });
      const recording = await (await fetch(recordingUri)).blob();
      if (recording.size === 0) throw new Error("Empty recording");
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "audio/mp4" }, body: recording });
      if (!upload.ok) throw new Error(`Upload failed (${upload.status})`);
      const { storageId } = (await upload.json()) as { storageId: string };
      return client.action(api.speak, { runId, audioStorageId: storageId, expectedBeatId, deviceToken });
    },
    voiceReady: async (runId, expectedBeatId) => client.mutation(api.speakUploadUrl, { runId, expectedBeatId, deviceToken: await getDeviceToken() }).then(
      () => true,
      () => false,
    ),
    interact: async (input) => {
      const deviceToken = await getDeviceToken();
      const uploadUrl = await client.mutation(api.interactUploadUrl, { deviceToken, thingId: input.thingId });
      const shot = await (await fetch(input.screenshot)).blob();
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: shot });
      if (!upload.ok) throw new Error("Upload failed (" + upload.status + ")");
      const { storageId } = (await upload.json()) as { storageId: string };
      const { interactionId } = await client.mutation(api.interact, {
        deviceToken,
        thingId: input.thingId,
        name: input.name,
        description: input.description,
        screenshotStorageId: storageId,
        timeOfDay: input.timeOfDay,
        day: input.day,
        ...(input.state ? { state: input.state } : {}),
      });
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const row = await client.query(api.watch, { deviceToken, interactionId });
        if (row.clipUrl) return { clipUrl: row.clipUrl, change: row.outcome.change, configure: row.configure, transitionMs: row.transitionMs };
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error("The scene took too long");
    },
    setPhone: async (phone) => {
      await client.mutation(api.setPhone, { phone, deviceToken: await getDeviceToken() });
    },
  };
}
