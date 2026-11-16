import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const exec = promisify(execFile);
const version = process.env.CASE_VERSION ?? "pier-nine-v1";
const out = `${process.env.HOME}/.capy/work/case-render-${version}`;
await mkdir(out, { recursive: true });
const key = process.env.FASTH3_API_KEY;
const openai = process.env.OPENAI_API_KEY;
if (!key || !openai) throw new Error("FASTH3_API_KEY and OPENAI_API_KEY are required");
const ua = "Mozilla/5.0 Synqui/1.0";
const auth = { authorization: `Bearer ${key}`, "user-agent": ua };

async function convex(name, args = {}) {
  const { stdout } = await exec("npx", ["convex", "run", name, JSON.stringify(args)], {
    maxBuffer: 10 * 1024 * 1024, timeout: 180000,
  });
  return stdout.trim() === "" ? null : JSON.parse(stdout);
}

async function request(url, options = {}, timeout = 120000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`request failed (${response.status})`);
  return response;
}

async function upload(bytes, type) {
  const url = await convex("cases:uploadUrl");
  const response = await request(url, { method: "POST", headers: { "content-type": type }, body: bytes });
  return (await response.json()).storageId;
}

async function dataImage(url) {
  const response = await request(url, { headers: { "user-agent": ua } });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 200000) return await compactReference(bytes);
  return `data:${response.headers.get("content-type") ?? "image/jpeg"};base64,${bytes.toString("base64")}`;
}

async function compactReference(bytes) {
  await writeFile(`${out}/reference-source`, bytes);
  await exec("ffmpeg", ["-y", "-i", `${out}/reference-source`, ...(strict ? [] : ["-vf", "scale=512:-2"]), "-frames:v", "1", "-q:v", "3", `${out}/reference.jpg`]);
  const jpeg = await readFile(`${out}/reference.jpg`);
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

const caseId = await convex("cases:prepare", { version });
const plan = await convex("cases:plan", { caseId });
const strict = plan.version === "pier-nine-v2";
if (plan.published) {
  console.log(JSON.stringify({ caseId, status: "already published", clips: plan.clips.length }));
  process.exit(0);
}
const configured = process.env.FASTH3_URLS ?? (await exec("npx", ["convex", "env", "get", "FASTH3_URLS"])).stdout.trim();
const instances = configured.split(",").map((url) => url.trim().replace(/\/v1\/?$/, "").replace(/\/+$/, "")).filter(Boolean);
if (instances.length === 0) throw new Error("FASTH3_URLS is empty");
let reference = await dataImage(plan.characterSheetUrl);
let hubFrameUrl = plan.clips.find((clip) => clip.key === "opening")?.frameUrl;
const results = [...plan.clips];
const timing = [];
let lastFrameEnabled = true;

async function lastFrame(url) {
  if (strict || !lastFrameEnabled || !process.env.LASTFRAME_URL || !process.env.LASTFRAME_API_KEY) return null;
  let endpoint = process.env.LASTFRAME_URL.replace(/\/+$/, "");
  if (!endpoint.endsWith("/gateway/last-frame")) endpoint += "/gateway/last-frame";
  const start = performance.now();
  try {
    const response = await request(endpoint, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LASTFRAME_API_KEY}` },
      body: JSON.stringify({ url }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("not a PNG");
    console.log(JSON.stringify({ phase: "last-frame", seconds: +((performance.now() - start) / 1000).toFixed(3), bytes: bytes.length }));
    return bytes;
  } catch (error) {
    lastFrameEnabled = false;
    console.log(JSON.stringify({ phase: "last-frame", seconds: +((performance.now() - start) / 1000).toFixed(3), fallback: true, reason: error.name }));
    return null;
  }
}

async function regionsFor(bytes) {
  if (!bytes || !process.env.SEGMENT_URL) return {};
  try {
    const response = await request(`${process.env.SEGMENT_URL.replace(/\/+$/, "")}/segment`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SEGMENT_KEY ?? process.env.SEGMENT_API_KEY ?? ""}` },
      body: JSON.stringify({ frame_b64: bytes.toString("base64"), targets: plan.targets.map((entry) => entry.target) }),
    }, 30000);
    const body = await response.json();
    return Object.fromEntries(plan.targets.map(({ id, target }) => {
      const match = (body.results ?? []).find((entry) => entry.target === target);
      return [id, match?.found ? match.region ?? null : null];
    }));
  } catch {
    return {};
  }
}

async function cacheFrame(scene, asset) {
  let frame = await lastFrame(asset.url);
  if (!frame) {
    try {
      await exec("ffmpeg", ["-y", "-i", `${out}/${scene.key}.mp4`, "-vf", "reverse", "-frames:v", "1", `${out}/${scene.key}-frame.png`]);
      frame = await readFile(`${out}/${scene.key}-frame.png`);
    } catch {
      console.log(JSON.stringify({ phase: "frame-fallback", key: scene.key, region: null }));
    }
  }
  if (!frame) return;
  if (scene.key === "opening") reference = await compactReference(frame);
  await writeFile(`${out}/${scene.key}-frame.png`, frame);
  const frameStorageId = await upload(frame, "image/png");
  const regions = scene.key === "solved" || scene.key === "failed" ? {} : await regionsFor(frame);
  await convex("cases:saveClip", {
    caseId, key: scene.key, storageId: asset.storageId, audioStorageId: asset.audioStorageId, frameStorageId, regions,
    prompt: asset.prompt, seed: asset.seed, inputFrameUrl: asset.inputFrameUrl,
  });
  if (scene.key === "opening") {
    const current = await convex("cases:plan", { caseId });
    hubFrameUrl = current.clips.find((clip) => clip.key === "opening").frameUrl;
  }
}

async function render(scene, index) {
  const cached = results.find((asset) => asset.key === scene.key);
  if (cached) {
    if (!cached.frameUrl) {
      if (!existsSync(`${out}/${scene.key}.mp4`)) {
        const response = await request(cached.url);
        await writeFile(`${out}/${scene.key}.mp4`, Buffer.from(await response.arrayBuffer()));
      }
      await cacheFrame(scene, cached);
    }
    return;
  }
  const start = performance.now();
  const seed = strict ? plan.seed : plan.seed + index * 97;
  if (strict && scene.key !== "opening" && !hubFrameUrl) throw new Error("the opening frame is not ready");
  const conditions = strict && scene.key !== "opening" ? [
    { type: "image", role: "keyframe", frame_index: 0, uri: reference },
    { type: "image", role: "reference", uri: reference },
  ] : [{ type: "image", role: "reference", uri: reference }];
  let base = instances[index % instances.length];
  let job;
  let previous;
  if (existsSync(`${out}/${scene.key}-job.json`)) {
    previous = JSON.parse(await readFile(`${out}/${scene.key}-job.json`, "utf8"));
  }
  if (previous?.caseId === caseId) {
    base = previous.base;
    job = { id: previous.id };
  } else {
    const response = await request(`${base}/v1/videos`, {
      method: "POST", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ model: "FastH3-Omni", task: "ref2va", prompt: scene.prompt,
        conditions,
        target: { short_edge: 768, aspect_ratio: plan.aspect, duration_seconds: plan.seconds }, seed }),
    }, 180000);
    job = await response.json();
  }
  if (!job.id) throw new Error("generation returned no job id");
  await writeFile(`${out}/${scene.key}-request.json`, JSON.stringify({
    caseId, seed, prompt: scene.prompt, inputFrameUrl: scene.key === "opening" ? null : hubFrameUrl,
    conditions: conditions.map((condition) => ({ role: condition.role, frame_index: condition.frame_index ?? null })),
    sameImage: conditions.length === 2 ? conditions[0].uri === conditions[1].uri : null,
  }, null, 2));
  await writeFile(`${out}/${scene.key}-job.json`, JSON.stringify({ caseId, base, id: job.id }));
  let done = false;
  for (let poll = 0; poll < 240; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = await (await request(`${base}/v1/videos/${job.id}`, { headers: auth }, 30000)).json();
    if (["failed", "cancelled"].includes(state.status)) throw new Error(`generation failed for ${scene.key}`);
    if (state.status === "completed") { done = true; break; }
  }
  if (!done) throw new Error(`generation timed out for ${scene.key}`);
  const completedAt = performance.now();
  const [video, audio] = await Promise.all([
    request(`${base}/v1/videos/${job.id}/content`, { headers: auth }, 180000).then(async (r) => Buffer.from(await r.arrayBuffer())),
    request("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${openai}` },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "marin", input: scene.line, response_format: "mp3",
        instructions: "Speak this exact clue clearly, as a calm harbour investigator. Do not add words." }),
    }, 60000).then(async (r) => Buffer.from(await r.arrayBuffer())),
  ]);
  await Promise.all([writeFile(`${out}/${scene.key}.mp4`, video), writeFile(`${out}/${scene.key}.mp3`, audio)]);
  const [storageId, audioStorageId] = await Promise.all([upload(video, "video/mp4"), upload(audio, "audio/mpeg")]);
  await convex("cases:saveClip", { caseId, key: scene.key, storageId, audioStorageId,
    prompt: scene.prompt, seed, inputFrameUrl: scene.key === "opening" ? undefined : hubFrameUrl });
  const refreshed = await convex("cases:plan", { caseId });
  const asset = refreshed.clips.find((entry) => entry.key === scene.key);
  await cacheFrame(scene, asset);
  results.push(asset);
  const row = { key: scene.key, seconds: +((performance.now() - start) / 1000).toFixed(3), generatedSeconds: +((completedAt - start) / 1000).toFixed(3), bytes: video.length, url: asset.url };
  timing.push(row);
  await writeFile(`${out}/timings.json`, JSON.stringify(timing, null, 2));
  console.log(JSON.stringify(row));
}

const opening = plan.clips.find((clip) => clip.key === "opening");
if (opening?.frameUrl) reference = await dataImage(opening.frameUrl);
await render(plan.scenes[0], 0);
for (let i = 1; i < plan.scenes.length; i += instances.length) {
  const scenes = plan.scenes.slice(i, i + instances.length);
  const completed = await Promise.allSettled(scenes.map((scene, offset) => render(scene, i + offset)));
  for (const [offset, result] of completed.entries()) {
    if (result.status === "rejected") {
      console.log(JSON.stringify({ phase: "retry", key: scenes[offset].key, reason: result.reason.message }));
      await render(scenes[offset], i + offset + 1);
    }
  }
}
await convex("cases:publish", { caseId, activate: !strict });
console.log(JSON.stringify({ caseId, status: strict ? "sealed, not active" : "published", clips: results.length }));
