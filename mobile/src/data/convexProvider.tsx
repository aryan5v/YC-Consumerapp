import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { ReactNode } from "react";
import type { HomeView, RunView, StoryProvider } from "./types";

const api = {
  today: makeFunctionReference<"query", Record<string, never>, HomeView>("home:today"),
  startToday: makeFunctionReference<"mutation", Record<string, never>, string>("runs:startToday"),
  view: makeFunctionReference<"query", { runId: string }, RunView>("runs:view"),
  choose: makeFunctionReference<"mutation", { runId: string; optionId: string }, null>("runs:choose"),
  answer: makeFunctionReference<"mutation", { runId: string; answer: string }, { correct: boolean }>("runs:answer"),
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
    choose: async (runId, optionId) => {
      await client.mutation(api.choose, { runId, optionId });
    },
    answer: (runId, answer) => client.mutation(api.answer, { runId, answer }),
  };
}
