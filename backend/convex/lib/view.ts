import { Doc, Id } from "../_generated/dataModel";
import { Box } from "./tray";
import { DEFAULT_SPOKEN_LINE, DirectorPuzzleStop, DirectorStop } from "./director";

export type ViewClipState = { status: "generating" | "ready"; clipUrl: string | null };

export type ViewStop =
  | null
  | {
      kind: "choice";
      spokenLine: string;
      spokenAudioUrl: string | null;
      options: {
        id: string;
        label: string;
        box: Box | null;
        childStatus: "generating" | "ready";
        childClipUrl: string | null;
      }[];
    }
  | {
      kind: "puzzle";
      spokenLine: string;
      spokenAudioUrl: string | null;
      question: string;
      answerType: "pick" | "number" | "text";
      choices: string[] | null;
      outcomes: { success: ViewClipState; failure: ViewClipState };
    };

export type RunView = {
  status: "active" | "ended";
  beatIndex: number;
  beatsTotal: number;
  current: {
    beatId: Id<"beats">;
    clipUrl: string | null;
    narration: string;
    status: "generating" | "ready";
  };
  stop: ViewStop;
  ending: null | {
    title: string;
    summary: string;
    path: string[];
    text?: { character: string; number: string | null; prompt: string };
  };
};

export function spokenLineFor(beat: Doc<"beats">, stop: DirectorStop): string {
  if (beat.spokenLine !== undefined && beat.spokenLine.trim() !== "") return beat.spokenLine;
  return stop.kind === "puzzle" ? stop.question : DEFAULT_SPOKEN_LINE;
}

export function advanceableClipState(clip: Doc<"clips"> | null): ViewClipState {
  if (clip === null) return { status: "generating", clipUrl: null };
  if (clip.status === "ready") return { status: "ready", clipUrl: clip.url ?? null };
  if (clip.status === "failed") return { status: "ready", clipUrl: null };
  return { status: "generating", clipUrl: null };
}

export function buildRunView(args: {
  run: Doc<"runs">;
  episode: Doc<"episodes">;
  beat: Doc<"beats">;
  clip: Doc<"clips"> | null;
  children: { beat: Doc<"beats">; clip: Doc<"clips"> | null }[];
}): RunView {
  const { run, episode, beat, clip, children } = args;
  const currentState = advanceableClipState(clip);
  const boxes = (clip?.boxes ?? {}) as Record<string, Box | null | undefined>;

  let stop: ViewStop = null;
  if (run.status === "active" && beat.stop !== undefined) {
    const directorStop = beat.stop as DirectorStop;
    if (directorStop.kind === "choice") {
      stop = {
        kind: "choice",
        spokenLine: spokenLineFor(beat, directorStop),
        spokenAudioUrl: beat.spokenAudioUrl ?? null,
        options: directorStop.options.map((option) => {
          const child = children.find((entry) => entry.beat.optionId === option.id);
          const childState = advanceableClipState(child?.clip ?? null);
          return {
            id: option.id,
            label: option.label,
            box: boxes[option.id] ?? null,
            childStatus: childState.status,
            childClipUrl: childState.clipUrl,
          };
        }),
      };
    } else {
      const puzzle = directorStop as DirectorPuzzleStop;
      const success = children.find((entry) => entry.beat.optionId === "success");
      const failure = children.find((entry) => entry.beat.optionId === "failure");
      stop = {
        kind: "puzzle",
        spokenLine: spokenLineFor(beat, directorStop),
        spokenAudioUrl: beat.spokenAudioUrl ?? null,
        question: puzzle.question,
        answerType: puzzle.answer_type,
        choices: puzzle.choices,
        outcomes: {
          success: advanceableClipState(success?.clip ?? null),
          failure: advanceableClipState(failure?.clip ?? null),
        },
      };
    }
  }

  return {
    status: run.status,
    beatIndex: beat.depth,
    beatsTotal: episode.beatsTotal,
    current: {
      beatId: beat._id,
      clipUrl: currentState.clipUrl,
      narration: beat.narration ?? "",
      status: currentState.status,
    },
    stop,
    ending:
      run.ending === undefined
        ? null
        : {
            title: run.ending.title,
            summary: run.ending.summary,
            path: run.path,
            text: run.ending.text,
          },
  };
}
