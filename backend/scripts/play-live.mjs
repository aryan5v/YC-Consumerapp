#!/usr/bin/env node
// Plays one full episode against a deployed backend and prints the transcript.
//
//   node scripts/play-live.mjs                    # the thread's deployment
//   node scripts/play-live.mjs --prod             # the linked production deployment
//   node scripts/play-live.mjs --answer "4187"    # force every puzzle answer
//
// It drives the deployment through the Convex CLI, so it needs whatever the CLI
// needs (CONVEX_DEPLOY_KEY, or a linked project). It picks the first option at
// every choice stop, which is enough to prove the loop: prefetch, promotion,
// cancellation, the ending card and the streak.

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

async function waitForStop(runId, tries = 25) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.status === "ended" || view.stop !== null) return view;
    await sleep(1500);
  }
  throw new Error("the beat never produced a stop: is the director key valid and the tray reachable?");
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
  const view = await waitForStop(runId);
  if (view.status === "ended") {
    console.log("ENDING");
    console.log(`  title: ${view.ending.title}`);
    console.log(`  summary: ${view.ending.summary}`);
    console.log(`  path: ${view.ending.path.join(" -> ")}`);
    if (view.ending.text) {
      console.log(`  text: ${view.ending.text.character} — ${view.ending.text.prompt}`);
    }
    console.log(`  decisions: ${decisions}`);
    break;
  }
  if (decisions > 12) throw new Error("the episode never reached an ending");
  decisions += 1;

  const stop = view.stop;
  const clip = view.current.clipUrl === null ? "(no clip)" : "clip ready";
  console.log(
    `beat ${view.beatIndex}/${view.beatsTotal} ${clip}  narration: ${view.current.narration}`,
  );
  console.log(`  ${stop.kind}: ${stop.spokenLine}`);
  console.log(`  voice: ${stop.spokenAudioUrl === null ? "no audio" : "audio ready"}`);

  if (stop.kind === "choice") {
    console.log(
      `  options: ${stop.options
        .map((option) => `${option.id}) ${option.label} [${option.childStatus}${option.region ? ", region" : ", chip"}]`)
        .join("  ")}`,
    );
    call("runs:choose", {
      runId,
      optionId: stop.options[0].id,
      expectedBeatId: view.current.beatId,
      deviceToken,
    });
  } else {
    const answer = forcedAnswer ?? stop.choices?.[0] ?? "";
    console.log(`  question: ${stop.question} (answer_type ${stop.answerType}) -> answering "${answer}"`);
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
