import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { caseClue, caseEnding, caseScenesForVersion, caseStop, readCase } from "./case";
import { RunView } from "./view";
import { bumpStreak } from "./streak";

export async function caseBundle(ctx: QueryCtx, run: Doc<"runs">) {
  if (run.caseId === undefined) throw new Error("this is not a case run");
  const bundle = await ctx.db.get(run.caseId);
  if (bundle === null || bundle.publishedAt === undefined) throw new Error("the case is not ready");
  const data = readCase(bundle.data);
  if (data === null) throw new Error("the case could not be read");
  return { bundle, data };
}

export async function playCaseClip(
  ctx: MutationCtx,
  run: Doc<"runs">,
  key: string,
  depth: number,
): Promise<Id<"beats">> {
  const { bundle, data } = await caseBundle(ctx, run);
  const asset = bundle.clips.find((clip) => clip.key === key);
  const scene = caseScenesForVersion(data, bundle.version).find((clip) => clip.key === key);
  if (asset === undefined || scene === undefined) throw new Error("this case clip is not ready");
  const stop = caseEnding(data, key) === null ? caseStop(data, run.caseClues ?? []) : undefined;
  const beatId = await ctx.db.insert("beats", {
    runId: run._id,
    depth,
    status: "ready",
    clipPrompt: scene.prompt,
    narration: scene.narration,
    spokenLine: scene.line,
    spokenAudioUrl: asset.audioUrl,
    spokenAudioStorageId: asset.audioStorageId,
    stopKind: stop === undefined ? undefined : "choice",
    stop,
    directorAttempts: 0,
    createdAt: Date.now(),
  });
  await ctx.db.insert("clips", {
    runId: run._id, beatId, status: "ready", prompt: scene.prompt,
    url: asset.url, storageId: asset.storageId, lastFrameUrl: asset.frameUrl,
    regions: asset.regions, seed: 0, aspect: "9:16", seconds: 5, attempts: 0,
    createdAt: Date.now(), readyAt: Date.now(),
  });
  await ctx.db.patch(run._id, { currentBeatId: beatId, lastActivityAt: Date.now() });
  return beatId;
}

export async function chooseCaseClue(
  ctx: MutationCtx, run: Doc<"runs">, optionId: string, actionId: string | undefined,
  expectedBeatId: Id<"beats">,
): Promise<boolean> {
  if (run.status !== "active" || run.caseResult !== undefined) throw new Error("this case has already ended");
  if (run.currentBeatId !== expectedBeatId) return false;
  const { data } = await caseBundle(ctx, run);
  const used = run.caseClues ?? [];
  if (used.length >= data.moves) throw new Error("no moves left: solve the case");
  const clue = caseClue(data, optionId);
  if (clue === null || (actionId !== undefined && actionId !== `${optionId}1`)) throw new Error("unknown clue");
  if (used.includes(optionId)) throw new Error("you have already inspected that clue");
  const clues = [...used, optionId];
  await ctx.db.patch(run._id, {
    caseClues: clues, beatsSeen: clues.length,
    optionPath: clues, path: [...run.path, clue.label],
    state: { ...run.state, clues: [...run.state.clues, clue.fact], beats_left: data.moves - clues.length },
  });
  await playCaseClip(ctx, { ...run, caseClues: clues }, optionId, clues.length);
  return true;
}

export async function solveCase(
  ctx: MutationCtx, run: Doc<"runs">, answerId: string, expectedBeatId: Id<"beats">,
): Promise<{ solved: boolean }> {
  if (run.caseResult !== undefined || run.status !== "active") throw new Error("this case has already ended; one solve attempt per day");
  if (run.currentBeatId !== expectedBeatId) throw new Error("the scene changed; read the current scene before solving");
  const { bundle, data } = await caseBundle(ctx, run);
  const used = run.caseClues ?? [];
  if (used.length === 0) throw new Error("inspect at least one clue before solving");
  if (!data.answers.some((_, index) => String(index) === answerId)) throw new Error("unknown answer");
  const solved = answerId === String(data.solution);
  const episode = await ctx.db.get(bundle.episodeId);
  if (episode === null) throw new Error("episode not found");
  if (solved) await bumpStreak(ctx, run.userId, episode.date);
  const streak = await ctx.db.query("streaks").withIndex("by_user", (q) => q.eq("userId", run.userId)).unique();
  const result = { solved, movesUsed: used.length, movesTotal: data.moves, streak: streak?.current ?? 0 };
  const ending = solved ? data.endings.solved : data.endings.failed;
  await playCaseClip(ctx, run, ending.id, used.length + 1);
  await ctx.db.patch(run._id, {
    caseResult: result, status: "ended", endedAt: Date.now(),
    ending: { title: ending.title, summary: ending.summary },
  });
  return { solved };
}

export async function buildCaseView(ctx: QueryCtx, run: Doc<"runs">, beat: Doc<"beats">): Promise<RunView> {
  const { bundle, data } = await caseBundle(ctx, run);
  const used = run.caseClues ?? [];
  const key = run.caseResult === undefined ? used.at(-1) ?? "opening" : run.caseResult.solved ? "solved" : "failed";
  const asset = bundle.clips.find((clip) => clip.key === key);
  if (asset === undefined) throw new Error("this case clip is not ready");
  const scene = caseScenesForVersion(data, bundle.version).find((clip) => clip.key === key)!;
  const result = run.caseResult;
  return {
    status: run.status, beatIndex: beat.depth, beatsTotal: data.moves,
    current: { beatId: beat._id, clipUrl: asset.url, narration: scene.narration, status: "ready" },
    case: {
      question: data.question, movesLeft: Math.max(0, data.moves - used.length), movesTotal: data.moves,
      solveChoices: data.answers.map((label, index) => ({ id: String(index), label })),
    },
    stop: run.status !== "active" ? null : {
      kind: "choice", spokenLine: scene.line, spokenAudioUrl: asset.audioUrl ?? null,
      options: used.length >= data.moves ? [] : caseStop(data, used).objects.map((object) => ({
        id: object.id, label: object.label, region: asset.regions?.[object.id] ?? null,
        actions: object.actions.map((action) => ({
          id: action.id, label: action.label, childStatus: "ready" as const,
          childClipUrl: bundle.clips.find((clip) => clip.key === object.id)!.url,
        })),
      })),
    },
    ending: result === undefined ? null : {
      title: run.ending!.title, summary: run.ending!.summary, path: run.path,
      result: { solved: result.solved, movesUsed: result.movesUsed, movesTotal: result.movesTotal },
      streak: result.streak,
      shareText: `Synqui · Case 1 · ${result.solved ? "solved" : "unsolved"} in ${result.movesUsed} of ${result.movesTotal} · streak ${result.streak}`,
    },
  };
}
