// Same action, same seed, two prompts: the old painterly wrapper and buildH3Prompt.
// Run: node --experimental-strip-types scripts/pair-generation.mjs
// Never prints FASTH3_API_KEY or OPENAI_API_KEY.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(child.status ?? 1);
}

const execFileAsync = promisify(execFile);
const { buildH3Prompt, PROFILE } = await import("../convex/lib/h3.ts");

const OUT = `${process.env.HOME}/.capy/work/h3-pairs.json`;
const WORK = `${process.env.HOME}/.capy/work/h3-pair-run`;
const INSTANCES = [1, 2, 3, 4].map((n) => `https://fasth3-${n}.aryank.xyz`);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const KEY = process.env.FASTH3_API_KEY;
const OPENAI = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error("FASTH3_API_KEY is not set");
if (!OPENAI) throw new Error("OPENAI_API_KEY is not set");

const OLD_STYLE_BIBLE = [
  "Medium: painterly 2.5D animation, soft gouache brushwork over simple staged geometry, slightly imperfect frame-to-frame painting, nothing photoreal.",
  "Palette: warm sodium-orange streetlight against deep teal night shadow, wet reflective ground, one saturated accent colour per scene (red door, yellow rain jacket, pink neon).",
  "Lighting: one low key light with long soft shadows, cool rim light on the protagonist, haze in the air, no daylight.",
  "Camera: 35mm equivalent, shallow depth of field, locked-off shot or a very slow push-in, 24fps cadence, no zooms and no whip pans.",
  "Sound: ambient only. Traffic, rain, humming lights, footsteps. No dialogue and no music; the spoken line is recorded separately.",
  "Never in frame: readable signage or UI text, logos, watermarks, extra or malformed limbs, mirrored faces, crowds of more than three background people.",
].join("\n");
const OLD_SUFFIX =
  "The last second is a steady wide shot held without camera movement, with the option targets clearly visible and well separated across the frame.";

function oldPrompt(action) {
  const body = action.trim().replace(/\s+/g, " ");
  return `${body}\n\nStyle bible: ${OLD_STYLE_BIBLE}\n\n${OLD_SUFFIX}`;
}

function newPrompt(shot) {
  return buildH3Prompt({
    ...shot,
    cast: PROFILE.cast,
    cameraNote: shot.cameraMove === "Static Shot" ? null : PROFILE.cameraNote,
  });
}

const SCENES = [
  {
    id: "street",
    seed: 5101,
    action:
      "You step off the last bus onto a wet street at night, a small paper parcel taped inside your jacket. On the left a shuttered shop with a red door; ahead the street runs long under sodium lamps; on the corner a man in a grey coat leans against the wall and watches you. The parcel hums faintly against your chest and the man on the corner turns his head toward the sound.",
    shot: {
      mode: "t2va",
      shotSize: "medium wide shot",
      cameraMove: "Pull Out",
      light: "a single sodium lamp from the left, low and warm against the cool night",
      materials: "wet stone underfoot, a worn wooden shutter, and brushed metal on the lamp housing",
      preserved: null,
      beats: [
        "The protagonist steps off the kerb onto the wet stone and stops, a paper parcel taped inside the pale grey jacket.",
        "Their left hand rests once on the parcel and then drops to their side.",
        "A red wooden door stands on the left, the long street runs ahead under the lamps, and a man in a grey coat leans at the corner.",
        "Rain ticks on the lamp housing while their boots scuff once and then hold still.",
      ],
      ambience: "Rain ticks on wet stone and the lamp housing. One boot scuffs the pavement, and paper rustles once under the jacket. A low street hum continues underneath.",
      ending: "They come to rest; the camera settles into a static wide framing with the red door, the long street and the man in the grey coat clearly separated.",
    },
  },
  {
    id: "shop",
    seed: 5102,
    action:
      "Inside the shop a single buzzing fluorescent tube lights shelves of dusty cans, a fridge door with a taped handle, and a narrow counter with an old cash register. The clerk behind the counter wears a green visor and has not blinked since the bell rang. The parcel is still hidden under the jacket.",
    shot: {
      mode: "t2va",
      shotSize: "medium wide shot",
      cameraMove: "Push In",
      light: "a single buzzing fluorescent tube from above",
      materials: "scratched metal on the fridge, worn wood on the counter, and dusty glass on the cans",
      preserved: null,
      beats: [
        "The protagonist steps in under the fluorescent tube and stops at the narrow counter.",
        "Shelves of dusty cans fill the left, a fridge door with a taped handle stands on the right, and an old cash register sits between them.",
        "The clerk behind the counter wears a green visor and does not blink.",
        "The paper parcel stays hidden under the pale grey jacket.",
      ],
      ambience: "The fluorescent tube buzzes. A fridge compressor hums. The door bell has already gone quiet.",
      ending: "They come to rest; the camera settles into a static wide framing with the fridge door, the cash register and the shelves of cans clearly separated.",
    },
  },
  {
    id: "register",
    seed: 5103,
    action:
      "The clerk's hand hovers over the cash register. A receipt curls out of the register and the clock on the wall behind him reads a little past one. Three large painted marks sit on the register door, easy to count, with no writing.",
    shot: {
      mode: "t2va",
      shotSize: "medium shot",
      cameraMove: "Push In",
      light: "the fluorescent tube from above, slightly in front of the register",
      materials: "brushed metal on the register, curling paper, and worn paint",
      preserved: null,
      beats: [
        "The clerk's hand hovers over the cash register and does not press a key.",
        "A blank receipt curls out of the register.",
        "Three large painted marks sit on the register door, easy to count.",
        "A round clock on the wall behind him shows the hands a little past the top, with no numerals.",
      ],
      ambience: "The register motor whirs once. Paper curls and ticks against metal. The tube buzz continues.",
      ending: "They come to rest; the camera settles into a static wide framing with the register, the three painted marks and the clock clearly separated.",
    },
  },
  {
    id: "back-room",
    seed: 5104,
    action:
      "The back room of the shop is stacked with cardboard and lit by one hanging bulb. A metal door with a bar across it faces a small high window that shows the street, and a stack of boxes sits in the dark between them.",
    shot: {
      mode: "t2va",
      shotSize: "wide shot",
      cameraMove: "Pull Out",
      light: "one hanging bulb from above, slightly left",
      materials: "worn cardboard, brushed metal on the door bar, and dusty glass in the high window",
      preserved: null,
      beats: [
        "The protagonist steps into the back room and stops under the hanging bulb.",
        "Cardboard stacks rise on both sides.",
        "A metal door with a bar across it faces a small high window that shows the street.",
        "A stack of boxes sits in the dark between the door and the window.",
      ],
      ambience: "The bulb hums. Cardboard shifts once. A distant street hush comes through the high window.",
      ending: "They come to rest; the camera settles into a static wide framing with the metal door, the high window and the stack of boxes clearly separated.",
    },
  },
  {
    id: "corner",
    seed: 5105,
    action:
      "Back on the street, the man in the grey coat stands between you and the end of the road, one hand open, the other inside his coat. A phone box on the pavement and a narrow service stair beside it are both within reach.",
    shot: {
      mode: "t2va",
      shotSize: "medium wide shot",
      cameraMove: "Truck Left",
      light: "a sodium lamp from the right, low across the wet pavement",
      materials: "wet stone, painted metal on the phone box, and worn concrete on the stair",
      preserved: null,
      beats: [
        "The protagonist stops on the wet pavement.",
        "The man in the grey coat stands between them and the end of the road, one hand open, the other inside his coat.",
        "A phone box stands on the pavement within reach.",
        "A narrow service stair rises beside the phone box.",
      ],
      ambience: "Rain ticks on the phone box glass. A coat shifts. Distant traffic hums under the street.",
      ending: "They come to rest; the camera settles into a static wide framing with the man in the grey coat, the phone box and the service stair clearly separated.",
    },
  },
  {
    id: "intersection",
    seed: 5106,
    action:
      "You leave the corner behind and walk out into a wide empty intersection as the streetlights go out one by one behind you, the parcel still sealed against your chest.",
    shot: {
      mode: "t2va",
      shotSize: "wide shot",
      cameraMove: "Pull Out",
      light: "streetlights from behind, going out one by one",
      materials: "wet asphalt and worn stone at the kerb",
      preserved: null,
      beats: [
        "The protagonist leaves the corner and walks into a wide empty intersection.",
        "The streetlights behind them go out one by one.",
        "The paper parcel stays sealed against their chest.",
        "Their boots slow on the wet asphalt and then stop.",
      ],
      ambience: "Footsteps fade on wet asphalt. A streetlight ticks off, then another, and the street hum drops.",
      ending: "They come to rest; the camera settles into a static wide framing with the empty intersection, the dark street and the last streetlight clearly separated.",
    },
  },
];

function redact(text) {
  return String(text)
    .replaceAll(KEY, "[redacted]")
    .replaceAll(OPENAI, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function log(line) {
  console.log(redact(line));
}

async function request(url, options, timeoutMs) {
  const res = await fetch(url, {
    ...options,
    headers: { "user-agent": UA, ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function referenceJpeg() {
  mkdirSync(WORK, { recursive: true });
  const path = `${WORK}/reference.jpg`;
  if (existsSync(path)) {
    const cached = readFileSync(path);
    if (cached[0] === 0xff && cached[1] === 0xd8 && cached.length > 1000) return cached;
  }
  const fetched = await fetch("https://picsum.photos/seed/synqui-cast/768/1024", {
    headers: { "user-agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!fetched.ok) throw new Error(`reference image download failed: ${fetched.status}`);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("reference image is not a JPEG");
  writeFileSync(path, bytes);
  return bytes;
}

async function submit(base, prompt, seed, jpeg) {
  const body = {
    model: "FastH3-Omni",
    task: "ref2va",
    prompt,
    seed,
    conditions: [{ type: "image", uri: `data:image/jpeg;base64,${jpeg.toString("base64")}`, role: "reference" }],
    target: { short_edge: 768, aspect_ratio: "9:16", duration_seconds: 5 },
  };
  const res = await request(
    `${base}/v1/videos`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    120000,
  );
  if (res.status < 200 || res.status >= 300) throw new Error(`submit ${res.status} ${res.text.slice(0, 240)}`);
  const parsed = JSON.parse(res.text);
  const jobId = parsed.id ?? parsed.video_id;
  if (jobId === undefined || jobId === null || String(jobId) === "") throw new Error("submit returned no job id");
  return String(jobId);
}

async function poll(base, jobId) {
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await request(
      `${base}/v1/videos/${encodeURIComponent(jobId)}`,
      { headers: { authorization: `Bearer ${KEY}` } },
      30000,
    );
    if (res.status < 200 || res.status >= 300) throw new Error(`poll ${res.status} ${res.text.slice(0, 200)}`);
    const parsed = JSON.parse(res.text);
    const status = String(parsed.status ?? "").toLowerCase();
    if (status === "completed" || status === "ready" || status === "succeeded") {
      const explicit = parsed.mp4_url ?? parsed.video_url ?? parsed.url ?? parsed.file_url;
      const content = `${base}/v1/videos/${encodeURIComponent(jobId)}/content`;
      return { content, explicit: typeof explicit === "string" ? explicit : null };
    }
    if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
      const message = parsed.error?.message ?? parsed.error ?? status;
      throw new Error(`job failed: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("job timed out");
}

async function download(url) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${KEY}`, "user-agent": UA },
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`download too small: ${bytes.length}`);
  return bytes;
}

async function publicUrl(contentUrl, filePath) {
  if (!existsSync(filePath)) {
    const bytes = await download(contentUrl);
    writeFileSync(filePath, bytes);
  }
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-m", "120", "-A", UA, "-F", `file=@${filePath}`, "https://tmpfiles.org/api/v1/upload"],
    { timeout: 130000, maxBuffer: 1_000_000 },
  );
  const parsed = JSON.parse(stdout);
  const page = parsed?.data?.url;
  if (!page) throw new Error(`tmpfiles upload failed: ${stdout.slice(0, 120)}`);
  const htmlRes = await fetch(page, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
  const html = await htmlRes.text();
  const match = html.match(/href="(https:\/\/tmpfiles\.org\/dl\/[^"]+)"/);
  if (!match) throw new Error("tmpfiles page had no direct mp4 link");
  return match[1];
}

function loadState() {
  if (!existsSync(OUT)) return { pairs: [] };
  return JSON.parse(readFileSync(OUT, "utf8"));
}

function saveState(state) {
  mkdirSync(`${process.env.HOME}/.capy/work`, { recursive: true });
  writeFileSync(OUT, JSON.stringify(state, null, 2));
}

function pairOf(state, id) {
  let pair = state.pairs.find((entry) => entry.id === id);
  if (!pair) {
    pair = { id, seed: 0, action: "", old: {}, new: {} };
    state.pairs.push(pair);
  }
  return pair;
}

async function generateOne(scene, variant, prompt, jpeg, state) {
  const pair = pairOf(state, scene.id);
  pair.seed = scene.seed;
  pair.action = scene.action;
  pair[variant].prompt = prompt;
  if (pair[variant].url) {
    log(`${scene.id} ${variant} already ${pair[variant].url}`);
    return;
  }
  const filePath = `${WORK}/${scene.id}-${variant}.mp4`;
  if (existsSync(filePath)) {
    try {
      const url = await publicUrl("", filePath);
      pair[variant] = { prompt, url, instance: pair[variant].instance ?? null, jobId: pair[variant].jobId ?? null };
      saveState(state);
      log(`published existing ${scene.id} ${variant} ${url}`);
      return;
    } catch (error) {
      log(`publish existing ${scene.id} ${variant} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  const instance = INSTANCES[SCENES.indexOf(scene) % INSTANCES.length];
  let lastError = "untried";
  for (const base of [instance, ...INSTANCES.filter((entry) => entry !== instance)]) {
    try {
      log(`submitting ${scene.id} ${variant} seed ${scene.seed} to ${base}`);
      const jobId = await submit(base, prompt, scene.seed, jpeg);
      log(`accepted ${scene.id} ${variant} job ${jobId} on ${base}`);
      const ready = await poll(base, jobId);
      const url = await publicUrl(ready.explicit ?? ready.content, filePath);
      pair[variant] = { prompt, url, instance: base, jobId, content: ready.content };
      saveState(state);
      log(`ready ${scene.id} ${variant} ${url}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log(`retry ${scene.id} ${variant}: ${lastError}`);
    }
  }
  pair[variant].error = redact(lastError);
  saveState(state);
  throw new Error(`${scene.id} ${variant} failed: ${lastError}`);
}

async function framesOf(filePath, id) {
  const times = ["0.4", "2.5", "4.6"];
  const paths = [];
  for (const [index, time] of times.entries()) {
    const path = `${WORK}/${id}-${index}.jpg`;
    await execFileAsync("ffmpeg", ["-y", "-ss", time, "-i", filePath, "-frames:v", "1", "-q:v", "3", path], { timeout: 30000 });
    paths.push(path);
  }
  return paths;
}

async function scoreClip(prompt, filePath, id) {
  const frames = await framesOf(filePath, id);
  const images = frames.map((path) => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${readFileSync(path).toString("base64")}` },
  }));
  const rubric = [
    "Score this 5-second vertical clip from three frames: opening, middle, and last. Reply with strict JSON only:",
    '{"realism":1-10,"prompt_adherence":1-10,"artifacts":1-10,"last_frame_usability":1-10,"reason":"one line"}',
    "10 is best on every axis. artifacts 10 means hands, faces and any text look clean; 1 means severe defects. last_frame_usability 10 means the last frame is a steady wide shot with distinct objects separated and none cut off, usable as a tap target. Be strict. Do not invent objects that are not visible.",
    "",
    "Prompt the clip was given:",
    prompt.slice(0, 4000),
  ].join("\n");
  const models = ["gpt-4.1", "gpt-4o", "gpt-4.1-mini"];
  let last = "no model";
  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: rubric }, ...images] }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    if (!res.ok) {
      last = `${model} ${res.status} ${text.slice(0, 160)}`;
      continue;
    }
    const parsed = JSON.parse(text);
    const content = parsed.choices?.[0]?.message?.content ?? "";
    const scores = JSON.parse(content);
    return { model, ...scores };
  }
  throw new Error(`vision score failed: ${redact(last)}`);
}

mkdirSync(WORK, { recursive: true });
const jpeg = await referenceJpeg();
log(`reference jpeg ${jpeg.length} bytes`);
const state = loadState();
state.referenceBytes = jpeg.length;

const jobs = [];
for (const scene of SCENES) {
  jobs.push({ scene, variant: "old", prompt: oldPrompt(scene.action) });
  jobs.push({ scene, variant: "new", prompt: newPrompt(scene.shot) });
}

let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor;
    cursor += 1;
    const job = jobs[index];
    try {
      await generateOne(job.scene, job.variant, job.prompt, jpeg, state);
    } catch (error) {
      log(`failed ${job.scene.id} ${job.variant}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

for (const scene of SCENES) {
  const pair = pairOf(state, scene.id);
  for (const variant of ["old", "new"]) {
    if (pair[variant].scores || !pair[variant].url) continue;
    const filePath = `${WORK}/${scene.id}-${variant}.mp4`;
    if (!existsSync(filePath)) {
      const bytes = await download(pair[variant].content);
      writeFileSync(filePath, bytes);
    }
    log(`scoring ${scene.id} ${variant}`);
    pair[variant].scores = await scoreClip(pair[variant].prompt, filePath, `${scene.id}-${variant}`);
    saveState(state);
    const scores = pair[variant].scores;
    log(`${scene.id} ${variant} realism ${scores.realism} adherence ${scores.prompt_adherence} artifacts ${scores.artifacts} last ${scores.last_frame_usability} — ${scores.reason}`);
  }
}

log(`saved ${OUT}`);
for (const pair of state.pairs) {
  log(`${pair.id} old ${pair.old.url}`);
  log(`${pair.id} new ${pair.new.url}`);
}
