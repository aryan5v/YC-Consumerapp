import { envFlag, envNumber } from "./env";

export type UniserveRequest = {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  task: string | null;
  prompt: string;
  seed: number;
  aspect: string;
  seconds: number;
  continuityFrameUrl: string | null;
  continuityVideoUrl: string | null;
  characterSheetUrl: string | null;
  styleImageUrl: string | null;
};

export type UniserveCondition = {
  type: "image" | "video" | "video_audio" | "audio";
  uri: string;
  role: "keyframe" | "reference";
  frame_index?: number;
};

export type UniserveJob = {
  status: "queued" | "generating" | "ready" | "failed";
  mp4Url: string | null;
  lastFrameUrl: string | null;
  progress: string | null;
  error?: string;
};

export const CONDITION_TYPES = ["image", "video", "video_audio", "audio"] as const;
export const CONDITION_ROLES = ["keyframe", "reference"] as const;

const MAX_REFERENCE_BYTES = 6_000_000;

export function uniserveModel(): string {
  return envFlag("FASTH3_MODEL") ?? "FastH3-Omni";
}

export function uniserveTask(): string | null {
  const task = envFlag("FASTH3_TASK");
  if (task === null) return "ref2va";
  return task === "none" || task === "" ? null : task;
}

export function v1BaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function contentUrl(baseUrl: string, jobId: string): string {
  return `${v1BaseUrl(baseUrl)}/v1/videos/${encodeURIComponent(jobId)}/content`;
}

type Continuity = Pick<UniserveRequest, "continuityFrameUrl" | "continuityVideoUrl">;

export function continuationMode(request: Continuity): "keyframe" | "video" | "none" {
  if (request.continuityFrameUrl !== null && request.continuityFrameUrl.trim() !== "") return "keyframe";
  if (request.continuityVideoUrl !== null && request.continuityVideoUrl.trim() !== "") {
    const configured = envFlag("FASTH3_CONTINUITY_VIDEO");
    const off = configured !== null && (configured === "0" || configured.toLowerCase() === "off");
    return off ? "none" : "video";
  }
  return "none";
}

export function referenceLegend(
  request: Continuity & Pick<UniserveRequest, "characterSheetUrl" | "styleImageUrl">,
): string {
  const parts: string[] = [];
  const mode = continuationMode(request);
  if (mode === "keyframe") parts.push("the keyframe image is the exact first frame this shot starts from");
  if (mode === "video") parts.push("the video reference is the shot immediately before this one, and this shot continues from its last frame");
  if (request.characterSheetUrl !== null) parts.push("the first reference image is the protagonist");
  if (request.styleImageUrl !== null) parts.push("the next reference image is the visual style");
  if (parts.length === 0) return "";
  return `References: ${parts.join("; ")}.`;
}

export async function inlineConditions(
  request: UniserveRequest,
  load: (url: string) => Promise<Response> = fetch,
): Promise<UniserveCondition[]> {
  const mode = continuationMode(request);
  const wanted: UniserveCondition[] = [];
  if (mode === "keyframe") {
    wanted.push({ type: "image", role: "keyframe", uri: request.continuityFrameUrl ?? "", frame_index: 0 });
  }
  if (mode === "video") {
    wanted.push({ type: "video", role: "reference", uri: request.continuityVideoUrl ?? "" });
  }
  wanted.push({ type: "image", role: "reference", uri: request.characterSheetUrl ?? "" });
  wanted.push({ type: "image", role: "reference", uri: request.styleImageUrl ?? "" });

  const conditions: UniserveCondition[] = [];
  for (const entry of wanted) {
    if (entry.uri.trim() === "") continue;
    const inlined = await dataUriFor(entry.uri.trim(), load);
    if (inlined === null) continue;
    conditions.push({ ...entry, uri: inlined });
  }
  return conditions;
}

async function dataUriFor(url: string, load: (url: string) => Promise<Response>): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  const res = await load(url);
  if (!res.ok) throw new Error(`reference ${url} could not be fetched: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_REFERENCE_BYTES) return null;
  const mime = mediaTypeOf(res.headers.get("content-type"), url);
  return `data:${mime};base64,${base64(bytes)}`;
}

function mediaTypeOf(header: string | null, url: string): string {
  const declared = (header ?? "").split(";")[0].trim().toLowerCase();
  if (declared.startsWith("image/") || declared.startsWith("video/") || declared.startsWith("audio/")) {
    return declared;
  }
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "image/jpeg";
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function buildVideoRequest(
  request: UniserveRequest,
  conditions: UniserveCondition[],
): Record<string, unknown> {
  const legend = referenceLegend(request);
  const body: Record<string, unknown> = {
    model: request.model,
    task: request.task ?? uniserveTask(),
    prompt: legend === "" ? request.prompt : `${request.prompt}\n\n${legend}`,
    conditions,
    target: {
      short_edge: Math.round(envNumber("FASTH3_SHORT_EDGE", 768)),
      aspect_ratio: request.aspect,
      duration_seconds: request.seconds,
    },
    seed: request.seed,
  };
  if (body.task === null) delete body.task;
  return body;
}

export function jobIdOf(raw: Record<string, unknown>): string | null {
  const value = raw.id ?? raw.video_id;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

export function jobStateOf(raw: Record<string, unknown>, baseUrl: string): UniserveJob {
  const rawStatus = String(raw.status ?? "queued").toLowerCase();
  const status: UniserveJob["status"] =
    rawStatus === "completed" || rawStatus === "ready" || rawStatus === "succeeded"
      ? "ready"
      : rawStatus === "failed" || rawStatus === "error" || rawStatus === "cancelled" || rawStatus === "canceled"
        ? "failed"
        : rawStatus === "queued" || rawStatus === "pending"
          ? "queued"
          : "generating";
  const id = jobIdOf(raw);
  const explicit = raw.mp4_url ?? raw.video_url ?? raw.url ?? raw.file_url;
  const mp4Url =
    typeof explicit === "string" && explicit.trim() !== ""
      ? explicit.trim()
      : id === null
        ? null
        : contentUrl(baseUrl, id);
  const lastFrame = raw.last_frame_url ?? raw.lastFrameUrl ?? raw.end_frame_url;
  const steps =
    typeof raw.completed_steps === "number" && typeof raw.total_steps === "number"
      ? `${raw.completed_steps}/${raw.total_steps} steps`
      : null;
  const phase = typeof raw.phase === "string" && raw.phase.trim() !== "" ? raw.phase.trim() : null;
  const errorValue = raw.error;
  const error =
    typeof errorValue === "string"
      ? errorValue
      : errorValue !== null && typeof errorValue === "object" && errorValue !== undefined
        ? String((errorValue as { message?: unknown }).message ?? "generation failed")
        : rawStatus === "failed"
          ? "generation failed"
          : undefined;
  return {
    status,
    mp4Url: status === "ready" ? mp4Url : null,
    lastFrameUrl: typeof lastFrame === "string" && lastFrame.trim() !== "" ? lastFrame.trim() : null,
    progress: phase === null ? steps : steps === null ? phase : `${phase} ${steps}`,
    error,
  };
}

function headers(apiKey: string | null): Record<string, string> {
  const out: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) out.authorization = `Bearer ${apiKey}`;
  return out;
}

async function parseJson(res: Response, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${text.slice(0, 300)}`);
  if (text.trim() === "") return {};
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object") throw new Error(`${what} returned ${typeof parsed}`);
  return parsed as Record<string, unknown>;
}

export async function submitVideo(
  request: UniserveRequest,
  load: (url: string) => Promise<Response> = fetch,
): Promise<{ jobId: string; conditions: number }> {
  const conditions = await inlineConditions(request, load);
  if (conditions.length === 0) throw new Error("the tray needs at least one reference image to start a shot");
  const res = await fetch(`${v1BaseUrl(request.baseUrl)}/v1/videos`, {
    method: "POST",
    headers: headers(request.apiKey),
    body: JSON.stringify(buildVideoRequest(request, conditions)),
    signal: AbortSignal.timeout(envNumber("FASTH3_SUBMIT_TIMEOUT_MS", 120000)),
  });
  const raw = await parseJson(res, "uniserve POST /v1/videos");
  const jobId = jobIdOf(raw);
  if (jobId === null) {
    throw new Error(`uniserve POST /v1/videos returned no job id: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return { jobId, conditions: conditions.length };
}

export async function fetchVideoJob(request: {
  baseUrl: string;
  apiKey: string | null;
  jobId: string;
}): Promise<UniserveJob> {
  const res = await fetch(`${v1BaseUrl(request.baseUrl)}/v1/videos/${encodeURIComponent(request.jobId)}`, {
    method: "GET",
    headers: headers(request.apiKey),
    signal: AbortSignal.timeout(30000),
  });
  return jobStateOf(await parseJson(res, "uniserve GET /v1/videos/:id"), request.baseUrl);
}

export async function deleteVideoJob(request: {
  baseUrl: string;
  apiKey: string | null;
  jobId: string;
}): Promise<void> {
  const res = await fetch(`${v1BaseUrl(request.baseUrl)}/v1/videos/${encodeURIComponent(request.jobId)}`, {
    method: "DELETE",
    headers: headers(request.apiKey),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`uniserve DELETE /v1/videos/:id failed: ${res.status}`);
  }
}
