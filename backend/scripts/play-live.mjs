#!/usr/bin/env node
// Plays one full episode against a deployed backend and prints the transcript.
//
//   node scripts/play-live.mjs                    # the thread's deployment
//   node scripts/play-live.mjs --prod             # the linked production deployment
//   node scripts/play-live.mjs --answer "4187"    # force every puzzle answer
//   node scripts/play-live.mjs --device "judge-1" # pin the device token
//
// It drives the deployment through the Convex CLI, so it needs whatever the CLI
// needs (CONVEX_DEPLOY_KEY, or a linked project). It picks the first option at
// every choice stop and waits for real clips to finish generating, which is what
// a live FastH3 deployment needs: the first option's shot is polled until it is
// ready, then the beat is taken.

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const useProd = argv.includes("--prod");
const forcedAnswer = argv[argv.indexOf("--answer") + 1];
const deviceToken = argv[argv.indexOf("--device") + 1] ?? `smoke-${Date.now()}`;
const extra = useProd ? ["--prod"] : [];

function call(fn, args) {
  const output = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args ?? {}), ...extra], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });
  const trimmed = output.trim();
  if (trimmed === "") return null;
  const start = trimmed.indexOf("{");
  const payload = start === -1 ? trimmed : trimmed.slice(start);
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error(`${fn} returned nothing parseable:\n${output}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStop(runId, tries = 90) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.status === "ended") return view;
    if (view.stop !== null && view.current.status === "ready") return view;
    if (attempt > 0 && attempt % 5 === 0) {
      console.log(
        `  waiting: beat ${view.beatIndex} clip ${view.current.status}, stop ${view.stop === null ? "writing" : view.stop.kind}`,
      );
    }
    await sleep(2000);
  }
  throw new Error("the beat never produced a stop: is the director key valid and the tray reachable?");
}

async function waitForChild(runId, beatId, optionId, tries = 90) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.current.beatId !== beatId || view.stop === null || view.stop.kind !== "choice") return view;
    const option = view.stop.options.find((entry) => entry.id === optionId);
    if (option === undefined) throw new Error(`option ${optionId} vanished from the stop`);
    if (option.childStatus === "ready") return view;
    await sleep(2000);
  }
  throw new Error(`option ${optionId} never produced a shot`);
}

async function waitForOutcome(runId, beatId, tries = 90) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.current.beatId !== beatId || view.stop === null || view.stop.kind !== "puzzle") return view;
    if (view.stop.outcomes.success.status === "ready" || view.stop.outcomes.failure.status === "ready") return view;
    await sleep(2000);
  }
  throw new Error("the puzzle never produced an outcome shot");
}

const home = call("home:today", { deviceToken });
console.log(`episode: ${home.episode.title} (${home.episode.date})`);
console.log(`tagline: ${home.episode.tagline}`);
console.log(`streak before: ${home.streak}\n`);

const runId = call("runs:startToday", { deviceToken });
console.log(`device token: ${deviceToken}`);
console.log(`run: ${runId}\n`);

let decisions = 0;
for (;;) {
  let view = await waitForStop(runId);
  if (view.status === "ended") {
    console.log("ENDING");
    console.log(`  title: ${view.ending.title}`);
    console.log(`  summary: ${view.ending.summary}`);
    console.log(`  path: ${view.ending.path.join(" -> ")}`);
    if (view.ending.text) {
      console.log(`  text: ${view.ending.text.character} — ${view.ending.text.prompt}`);
    }
    console.log(`  last clip: ${view.current.clipUrl}`);
    console.log(`  decisions: ${decisions}`);
    break;
  }
  if (decisions > 12) throw new Error("the episode never reached an ending");
  decisions += 1;

  const stop = view.stop;
  console.log(`beat ${view.beatIndex}/${view.beatsTotal}  narration: ${view.current.narration}`);
  console.log(`  clip: ${view.current.clipUrl}`);
  console.log(`  ${stop.kind}: ${stop.spokenLine}`);
  console.log(`  voice: ${stop.spokenAudioUrl === null ? "no audio" : "audio ready"}`);

  if (stop.kind === "choice") {
    const chosen = stop.options[0];
    console.log(
      `  options: ${stop.options
        .map((option) => {
          const actions = option.actions ?? [];
          return `${option.id}) ${option.label} [${option.region ? "region" : "chip"}${
            actions.length > 0 ? `, ${actions[0].childStatus}` : ""
          }]`;
        })
        .join("  ")}`,
    );
    view = await waitForChild(runId, view.current.beatId, chosen.id);
    const taken = view.stop.options.find((entry) => entry.id === chosen.id);
    const action = taken?.actions?.[0];
    if (action?.childClipUrl) console.log(`  shot to play: ${action.childClipUrl}`);
    call("runs:choose", {
      runId,
      optionId: chosen.id,
      actionId: action?.id,
      expectedBeatId: view.current.beatId,
      deviceToken,
    });
  } else {
    const answer = forcedAnswer ?? stop.choices?.[0] ?? "";
    console.log(`  question: ${stop.question} (answer_type ${stop.answerType}) -> answering "${answer}"`);
    await waitForOutcome(runId, view.current.beatId);
    const result = call("runs:answer", {
      runId,
      answer,
      expectedBeatId: view.current.beatId,
      deviceToken,
    });
    console.log(`  correct: ${result.correct}`);
  }
  await sleep(400);
}

const after = call("home:today", { deviceToken });
console.log(`\nstreak after: ${after.streak}  run: ${after.run?.status}`);
