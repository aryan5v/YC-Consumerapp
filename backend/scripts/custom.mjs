#!/usr/bin/env node
// Dream a world: start a run from a typed description and print every clip URL as it becomes ready.
//
//   node scripts/custom.mjs "a floating market above the clouds at dawn"
//   node scripts/custom.mjs "a workshop under a harbour at midnight" --rounds 3 --token aryan
//   npm run custom -- "a sunlit train platform in Lisbon, one suitcase left behind"
//
// It drives the live deployment through the Convex CLI, so it needs CONVEX_DEPLOY_KEY in the
// environment (or a linked project). It waits for each FastH3 clip to finish generating and
// plays the story by always taking the first option, printing the clip URLs as they arrive.

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const prompt = argv.find((entry) => !entry.startsWith("--") && !argv[argv.indexOf(entry) - 1]?.startsWith("--"));
const token = argv[argv.indexOf("--token") + 1]?.startsWith("--")
  ? undefined
  : argv[argv.indexOf("--token") + 1];
const rounds = Number(argv[argv.indexOf("--rounds") + 1] ?? 4);
const useProd = argv.includes("--prod");
const extra = useProd ? ["--prod"] : [];
const deviceToken = token ?? `custom-${Date.now()}`;

if (prompt === undefined || prompt.trim() === "") {
  console.error('Tell me what to build: node scripts/custom.mjs "a floating market above the clouds at dawn"');
  process.exit(2);
}

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

async function waitForBeat(runId, beatId, tries = 120) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.status === "ended" || view.current.beatId !== beatId) return view;
    if (view.stop !== null && view.current.status === "ready") return view;
    if (attempt % 5 === 4) {
      console.log(`   ... clip ${view.current.status}, options ${view.stop === null ? "being chosen" : "ready"}`);
    }
    await sleep(2000);
  }
  throw new Error("the clip never finished generating");
}

async function waitForAction(runId, beatId, optionId, tries = 120) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const view = call("runs:view", { runId, deviceToken });
    if (view.current.beatId !== beatId) return view;
    const option = view.stop?.options?.find((entry) => entry.id === optionId);
    if (option !== undefined && option.actions?.[0]?.childStatus === "ready") return view;
    await sleep(2000);
  }
  throw new Error("the next shot never finished generating");
}

console.log(`prompt: ${prompt}`);
const runId = call("runs:startCustom", { deviceToken, prompt });
console.log(`run: ${runId}   (device token ${deviceToken})\n`);

for (let step = 0; step < rounds; step += 1) {
  const first = call("runs:view", { runId, deviceToken });
  const view = await waitForBeat(runId, first.current.beatId);
  if (view.status === "ended") {
    console.log(`ENDING  ${view.ending?.title ?? ""} — ${view.ending?.summary ?? ""}`);
    break;
  }
  const episode = call("home:today", { deviceToken });
  console.log(`beat ${view.beatIndex + 1}/${view.beatsTotal}   episode: ${episode.episode.title} — ${episode.episode.tagline}`);
  console.log(`  narration: ${view.current.narration}`);
  console.log(`  clip:      ${view.current.clipUrl}`);
  console.log(`  ${view.stop.kind}: ${view.stop.spokenLine}`);
  if (view.stop.kind === "choice") {
    for (const option of view.stop.options) {
      console.log(`    ${option.id}) ${option.label}${option.region ? " [region]" : " [chip]"}`);
      for (const action of option.actions) {
        console.log(`        ${action.id}) ${action.label} [${action.childStatus}] ${action.childClipUrl ?? ""}`);
      }
    }
    const chosen = view.stop.options[0];
    const ready = await waitForAction(runId, view.current.beatId, chosen.id);
    const option = ready.stop.options.find((entry) => entry.id === chosen.id);
    const action = option?.actions?.[0];
    if (action?.childClipUrl) console.log(`  chose ${option.label}: ${action.childClipUrl}`);
    call("runs:choose", {
      runId,
      optionId: chosen.id,
      actionId: action?.id,
      expectedBeatId: ready.current.beatId,
      deviceToken,
    });
  } else {
    for (const [side, outcome] of Object.entries(view.stop.outcomes)) {
      console.log(`    ${side}) [${outcome.status}] ${outcome.clipUrl ?? ""}`);
    }
    const answer = view.stop.choices?.[0] ?? "";
    console.log(`  answering "${answer}"`);
    const result = call("runs:answer", {
      runId,
      answer,
      expectedBeatId: view.current.beatId,
      deviceToken,
    });
    console.log(`  correct: ${result.correct}`);
  }
  console.log("");
  await sleep(500);
}

const home = call("home:today", { deviceToken });
console.log(`run status: ${home.run?.status}`);
