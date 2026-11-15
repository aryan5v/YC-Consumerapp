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
  voiceRefUrl: string | null;
};

export type UniserveJob = {
  status: "queued" | "generating" | "ready" | "failed";
  mp4Url: string | null;
  lastFrameUrl: string | null;
  error?: string;
};

export function uniserveModel(): string {
  return envFlag("FASTH3_MODEL") ?? "fasth3";
}

export function uniserveTask(): string | null {
  const task = envFlag("FASTH3_TASK");
  if (task === null) return "ref2va";
  return task === "none" || task === "" ? null : task;
}

export function contentUrl(baseUrl: string, jobId: string): string {
  return `${baseUrl}/v1/videos/${encodeURIComponent(jobId)}/content`;
}

function referenceUrls(...urls: (string | null)[]): { image_url: string }[] {
  const out: { image_url: string }[] = [];
  for (const url of urls) {
    if (url !== null && url.trim() !== "") out.push({ image_url: url });
  }
  return out;
}

export function buildVideoRequest(request: UniserveRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    seconds: String(request.seconds),
    seed: request.seed,
  };
  if (request.task !== null) body.task = request.task;

  const size = envFlag("FASTH3_SIZE");
  if (size !== null) {
    body.size = size;
  } else {
    body.aspect_ratio = request.aspect;
    body.short_edge = envNumber("FASTH3_SHORT_EDGE", 768);
  }
  const numFrames = envFlag("FASTH3_NUM_FRAMES");
  if (numFrames !== null) body.num_frames = Number(numFrames);

  const images = referenceUrls(
    request.characterSheetUrl,
    request.styleImageUrl,
    request.continuityFrameUrl,
  );
  if (images.length > 0) body.image_reference = images;
  if (request.continuityVideoUrl !== null && request.continuityVideoUrl.trim() !== "") {
    body.video_reference = [{ video_url: request.continuityVideoUrl }];
  }
  if (request.voiceRefUrl !== null && request.voiceRefUrl.trim() !== "") {
    body.audio_reference = [{ audio_url: request.voiceRefUrl }];
  }
  return body;
}

export function referenceLegend(
  request: Pick<
    UniserveRequest,
    "characterSheetUrl" | "styleImageUrl" | "continuityFrameUrl" | "continuityVideoUrl" | "voiceRefUrl"
  >,
): string {
  const parts: string[] = [];
  if (request.characterSheetUrl !== null) parts.push("the first image reference is the protagonist");
  if (request.styleImageUrl !== null) parts.push("the next image reference is the visual style");
  if (request.continuityFrameUrl !== null) parts.push("the last image reference is the frame this shot starts from");
  if (request.continuityVideoUrl !== null) parts.push("the video reference is the shot immediately before this one");
  if (request.voiceRefUrl !== null) parts.push("the audio reference is the voice the character speaks with");
  if (parts.length === 0) return "";
  return `References: ${parts.join("; ")}.`;
}

export function jobIdOf(raw: Record<string, unknown>): string | null {
  const value = raw.id ?? raw.job_id ?? raw.video_id;
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
  const lastFrame = raw.last_frame_url ?? raw.lastFrameUrl ?? raw.end_frame_url ?? raw.thumbnail_url;
  const errorValue = raw.error;
  const error =
    typeof errorValue === "string"
      ? errorValue
      : errorValue !== null && typeof errorValue === "object"
        ? String((errorValue as { message?: unknown }).message ?? "generation failed")
        : rawStatus === "failed"
          ? "generation failed"
          : undefined;
  return {
    status,
    mp4Url: status === "ready" ? mp4Url : null,
    lastFrameUrl: typeof lastFrame === "string" && lastFrame.trim() !== "" ? lastFrame.trim() : null,
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

export async function submitVideo(request: UniserveRequest): Promise<string> {
  const res = await fetch(`${request.baseUrl}/v1/videos`, {
    method: "POST",
    headers: headers(request.apiKey),
    body: JSON.stringify(buildVideoRequest(request)),
    signal: AbortSignal.timeout(envNumber("FASTH3_SUBMIT_TIMEOUT_MS", 120000)),
  });
  const raw = await parseJson(res, "uniserve POST /v1/videos");
  const jobId = jobIdOf(raw);
  if (jobId === null) throw new Error(`uniserve POST /v1/videos returned no job id: ${JSON.stringify(raw).slice(0, 200)}`);
  return jobId;
}

export async function fetchVideoJob(request: {
  baseUrl: string;
  apiKey: string | null;
  jobId: string;
}): Promise<UniserveJob> {
  const res = await fetch(
    `${request.baseUrl}/v1/videos/${encodeURIComponent(request.jobId)}`,
    { method: "GET", headers: headers(request.apiKey), signal: AbortSignal.timeout(30000) },
  );
  return jobStateOf(await parseJson(res, "uniserve GET /v1/videos/:id"), request.baseUrl);
}

export async function deleteVideoJob(request: {
  baseUrl: string;
  apiKey: string | null;
  jobId: string;
}): Promise<void> {
  const res = await fetch(
    `${request.baseUrl}/v1/videos/${encodeURIComponent(request.jobId)}`,
    { method: "DELETE", headers: headers(request.apiKey), signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`uniserve DELETE /v1/videos/:id failed: ${res.status}`);
  }
}
