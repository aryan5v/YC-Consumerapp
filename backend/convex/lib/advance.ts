import { Id, Doc } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { DirectorPuzzleStop } from "./director";
import { cancelSiblings, childrenOfBeat, promoteTo } from "./orchestration";
import { checkAnswer, outcomeLabel } from "./story";

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
  label: string,
): Promise<void> {
  const children = await childrenOfBeat(ctx, beat._id);
  const chosen = children.find((child) => child.optionId === optionId);
  if (chosen === undefined) throw new Error(`option "${optionId}" has no shot yet`);
  await cancelSiblings(
    ctx,
    children.filter((child) => child._id !== chosen._id),
  );
  await promoteTo(ctx, run, chosen, label, optionId);
}

export async function chooseOption(ctx: MutationCtx, runId: Id<"runs">, optionId: string): Promise<void> {
  const { run, beat } = await loadCurrent(ctx, runId);
  const stop = beat.stop as { kind: string; options?: { id: string; label: string }[] } | undefined;
  if (stop === undefined || stop.kind !== "choice" || stop.options === undefined) {
    throw new Error("the current beat is not a choice stop");
  }
  const option = stop.options.find((entry) => entry.id === optionId);
  if (option === undefined) throw new Error(`no option "${optionId}" on the current beat`);
  await advanceToOption(ctx, run, beat, optionId, option.label);
}

export async function answerPuzzle(
  ctx: MutationCtx,
  runId: Id<"runs">,
  given: string,
  correctOverride?: boolean,
): Promise<boolean> {
  const { run, beat } = await loadCurrent(ctx, runId);
  const stop = beat.stop as DirectorPuzzleStop | undefined;
  if (stop === undefined || stop.kind !== "puzzle") throw new Error("the current beat is not a puzzle stop");
  const correct = correctOverride ?? checkAnswer(stop, given);
  await advanceToOption(ctx, run, beat, correct ? "success" : "failure", outcomeLabel(stop, correct));
  return correct;
}
