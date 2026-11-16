import type { ComponentType, ReactNode } from "react";

export type Point = [number, number];
export type Region = { centroid: { x: number; y: number }; polygon: Point[] | Point[][] | null; maskUrl: string | null };
export type ClipStatus = "generating" | "ready";

export type ChoiceOption = {
  id: string;
  label: string;
  region: Region | null;
  actions: { id: string; label: string; childStatus: ClipStatus; childClipUrl: string | null }[];
};

export type Outcome = { status: ClipStatus; clipUrl: string | null };

export type ChoiceStop = { kind: "choice"; spokenLine: string; spokenAudioUrl: string | null; options: ChoiceOption[] };
export type PuzzleStop = {
  kind: "puzzle";
  spokenLine: string;
  spokenAudioUrl: string | null;
  question: string;
  answerType: "pick" | "number" | "text";
  choices: string[] | null;
  outcomes: { success: Outcome; failure: Outcome };
};
export type Stop = ChoiceStop | PuzzleStop;

export type EndingText = { character: string; number: string | null; prompt: string };
export type CaseInfo = {
  question: string;
  movesLeft: number;
  movesTotal: number;
  solveChoices: { id: string; label: string }[] | null;
  solveInput?: { kind: "code"; length: number; prompt: string } | null;
};
export type DreamView = {
  status: "writing" | "generating" | "ready" | "failed";
  prompt: string;
  clipUrl?: string | null;
  elapsedMs: number;
  error?: string | null;
  step?: number;
  caption?: string | null;
  stopStatus?: "analysing" | "ready" | "none";
  stop?: { options: { id: string; label: string; region: Region | null }[] } | null;
};
export type CaseResult = { solved: boolean; movesUsed: number; movesTotal: number; answerLabel?: string | null };
export type Ending = { title: string; summary: string; path: string[]; text?: EndingText | null; result?: CaseResult | null; streak?: number; shareText?: string };

export type RunView = {
  status: "active" | "ended";
  beatIndex: number;
  beatsTotal: number;
  current: { beatId: string; clipUrl: string | null; narration: string; status: ClipStatus };
  stop: Stop | null;
  ending: Ending | null;
  case?: CaseInfo | null;
};

export type SpeakResult = {
  transcript: string;
  matchedOptionId: string | null;
  correct: boolean | null;
  reply: string | null;
  replyAudioUrl: string | null;
};

export type HomeView = {
  episode: { id: string; date: string; title: string; tagline: string; posterUrl: string };
  streak: number;
  run: { id: string; status: "active" | "ended" } | null;
};

export type WorldInteraction = {
  thingId: string;
  name: string;
  description: string;
  screenshot: string;
  timeOfDay: number;
  day: number;
  seed: number | string;
  state?: Record<string, unknown>;
};
export type WorldInteractionResult = { clipUrl: string; change?: Record<string, unknown>; configure?: Record<string, unknown>; transitionMs?: number };

export interface StoryProvider {
  name: "mock" | "convex";
  canReplay: boolean;
  Root: ComponentType<{ children: ReactNode }>;
  useHome(): HomeView | undefined;
  useRun(runId: string | null): RunView | undefined;
  startToday(): Promise<string>;
  choose(runId: string, optionId: string, actionId: string, expectedBeatId: string): Promise<void>;
  answer(runId: string, answer: string, expectedBeatId: string): Promise<{ correct: boolean }>;
  solve?(runId: string, answerId: string, expectedBeatId: string): Promise<void>;
  solveText?(runId: string, answerText: string, expectedBeatId: string): Promise<void>;
  dreamStart?(prompt: string): Promise<string>;
  useDream?(dreamId: string | null): DreamView | undefined;
  dreamContinue?(dreamId: string, optionId: string): Promise<string>;
  setPhone(phone: string): Promise<void>;
  speak?(runId: string, recordingUri: string, expectedBeatId: string): Promise<SpeakResult>;
  voiceReady?(runId: string, expectedBeatId: string): Promise<boolean>;
  interact?(input: WorldInteraction): Promise<WorldInteractionResult>;
}
