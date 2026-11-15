import { Id, Doc } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { DirectorPuzzleStop } from "./director";
import { cancelSiblings, childrenOfBeat, promoteTo } from "./orchestration";
import { checkAnswer, outcomeLabel, stopObjectViews } from "./story";

export async function loadCurrent(
  ctx: MutationCtx,
  runId: Id<"runs">,
): Promise<{ run: Doc<"runs">; beat: Doc<"beats"> }> {
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error("run not found");
  if (run.status !== "active") throw new Error("this run has already ended");
  const beatId = run.currentBeatId;
  if (beatId === undefined) throw new Error("run has no current beat");
  const beat = await ctx.db.get(beatId);
  if (beat === null) throw new Error("current beat not found");
  return { run, beat };
}

export async function advanceToOption(
  ctx: MutationCtx,
  run: Doc<"runs">,
  beat: Doc<"beats">,
  optionId: string,
  actionId: string | undefined,
  label: string,
): Promise<void> {
  const children = await childrenOfBeat(ctx, beat._id);
  const forOption = children.filter((child) => child.optionId === optionId);
  const chosen =
    actionId === undefined
      ? forOption[0]
      : forOption.find((child) => (child.actionId ?? actionId) === actionId) ?? forOption[0];
  if (chosen === undefined) throw new Error(`option "${optionId}" has no shot yet`);
  await cancelSiblings(
    ctx,
    children.filter((child) => child._id !== chosen._id),
  );
  await promoteTo(ctx, run, chosen, label, optionId);
}

export async function chooseOption(
  ctx: MutationCtx,
  runId: Id<"runs">,
  optionId: string,
  actionId: string | undefined,
  expectedBeatId: Id<"beats">,
): Promise<boolean> {
  const { run, beat } = await loadCurrent(ctx, runId);
  if (beat._id !== expectedBeatId) return false;
  const objects = stopObjectViews(beat.stop);
  if (objects.length === 0) throw new Error("the current beat is not a choice stop");
  const object = objects.find((entry) => entry.id === optionId);
  if (object === undefined) throw new Error(`no option "${optionId}" on the current beat`);
  const action =
    actionId === undefined ? object.actions[0] : object.actions.find((entry) => entry.id === actionId) ?? object.actions[0];
  if (action === undefined) throw new Error(`option "${optionId}" has no action to take`);
  const label = object.actions.length > 1 ? `${object.label} — ${action.label}` : object.label;
  await advanceToOption(ctx, run, beat, optionId, action.id, label);
  return true;
}

export async function answerPuzzle(
  ctx: MutationCtx,
  runId: Id<"runs">,
  given: string,
  expectedBeatId: Id<"beats">,
  correctOverride?: boolean,
): Promise<{ applied: boolean; correct: boolean }> {
  const { run, beat } = await loadCurrent(ctx, runId);
  if (beat._id !== expectedBeatId) {
    const answered = await ctx.db.get(expectedBeatId);
    const previousStop = answered?.stop as DirectorPuzzleStop | undefined;
    const grade =
      previousStop !== undefined && previousStop.kind === "puzzle"
        ? (correctOverride ?? checkAnswer(previousStop, given))
        : false;
    const taken = answered === null ? undefined : run.optionPath[answered.depth];
    return { applied: false, correct: grade && taken === "success" };
  }
  const stop = beat.stop as DirectorPuzzleStop | undefined;
  if (stop === undefined || stop.kind !== "puzzle") throw new Error("the current beat is not a puzzle stop");
  const correct = correctOverride ?? checkAnswer(stop, given);
  await advanceToOption(ctx, run, beat, correct ? "success" : "failure", undefined, outcomeLabel(stop, correct));
  return { applied: true, correct };
}
