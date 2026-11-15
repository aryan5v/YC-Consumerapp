import type { ComponentType, ReactNode } from "react";

export type Box = { x: number; y: number; w: number; h: number };
export type ClipStatus = "generating" | "ready";

export type ChoiceOption = {
  id: string;
  label: string;
  box: Box | null;
  childStatus: ClipStatus;
  childClipUrl: string | null;
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
export type Ending = { title: string; summary: string; path: string[]; text?: EndingText | null };

export type RunView = {
  status: "active" | "ended";
  beatIndex: number;
  beatsTotal: number;
  current: { beatId: string; clipUrl: string | null; narration: string; status: ClipStatus };
  stop: Stop | null;
  ending: Ending | null;
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

export interface StoryProvider {
  name: "mock" | "convex";
  canReplay: boolean;
  Root: ComponentType<{ children: ReactNode }>;
  useHome(): HomeView | undefined;
  useRun(runId: string | null): RunView | undefined;
  startToday(): Promise<string>;
  choose(runId: string, optionId: string, expectedBeatId: string): Promise<void>;
  answer(runId: string, answer: string, expectedBeatId: string): Promise<{ correct: boolean }>;
  setPhone(phone: string): Promise<void>;
  speak?(runId: string, recordingUri: string, expectedBeatId: string): Promise<SpeakResult>;
  voiceReady?(): Promise<boolean>;
}
