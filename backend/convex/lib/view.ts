import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import { DEFAULT_SPOKEN_LINE, DirectorPuzzleStop, DirectorStop } from "./director";
import { stopObjectViews } from "./story";
import { Region } from "./segment";

export type ViewClipState = { status: "generating" | "ready"; clipUrl: string | null };

export type ViewRegion = Region;

export type ViewStop =
  | null
  | {
      kind: "choice";
      spokenLine: string;
      spokenAudioUrl: string | null;
      options: {
        id: string;
        label: string;
        region: ViewRegion | null;
        actions: {
          id: string;
          label: string;
          childStatus: "generating" | "ready";
          childClipUrl: string | null;
        }[];
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
  case?: {
    question: string;
    movesLeft: number;
    movesTotal: number;
    solveChoices: { id: string; label: string }[];
  };
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
    result?: { solved: boolean; movesUsed: number; movesTotal: number };
    streak?: number;
    shareText?: string;
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

// A run the app can still read. Old stored shapes are fine; a stored shape we cannot read at all,
// a missing beat, or a missing episode means the phone should get a fresh run instead of a crash.
export async function runIsReadable(ctx: { db: QueryCtx["db"] }, run: Doc<"runs">): Promise<boolean> {
  if (run.currentBeatId === undefined) return false;
  const beat = await ctx.db.get(run.currentBeatId);
  if (beat === null || beat.status === "cancelled") return false;
  if (run.ending === undefined) {
    const stop = beat.stop as { kind?: unknown } | undefined;
    if (stop !== undefined) {
      if (typeof stop !== "object") return false;
      if (stop.kind === "choice" && stopObjectViews(stop).length === 0) return false;
      if (stop.kind !== "choice" && stop.kind !== "puzzle") return false;
    }
  }
  const episode = await ctx.db.get(run.episodeId);
  return episode !== null;
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
  const regions = (clip?.regions ?? {}) as Record<string, Region | null | undefined>;

  let stop: ViewStop = null;
  if (run.status === "active" && beat.stop !== undefined) {
    const directorStop = beat.stop as DirectorStop;
    if (directorStop.kind === "choice") {
      stop = {
        kind: "choice",
        spokenLine: spokenLineFor(beat, directorStop),
        spokenAudioUrl: beat.spokenAudioUrl ?? null,
        options: stopObjectViews(directorStop).map((object) => ({
          id: object.id,
          label: object.label,
          region: regions[object.id] ?? object.region ?? null,
          actions: object.actions.map((action) => {
            const child =
              children.find(
                (entry) => entry.beat.optionId === object.id && entry.beat.actionId === action.id,
              ) ??
              children.find(
                (entry) => entry.beat.optionId === object.id && entry.beat.actionId === undefined,
              ) ??
              children.find((entry) => entry.beat.optionId === object.id);
            const childState = advanceableClipState(child?.clip ?? null);
            return {
              id: action.id,
              label: action.label,
              childStatus: childState.status,
              childClipUrl: childState.clipUrl,
            };
          }),
        })),
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
