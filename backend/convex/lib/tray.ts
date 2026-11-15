import { envFlag, sleep } from "./env";
import { mockLatencyMs } from "./config";
import { mockJobId, stockClipForJob } from "./stock";
import {
  UniserveRequest,
  deleteVideoJob,
  fetchVideoJob,
  referenceLegend,
  submitVideo,
  uniserveModel,
  uniserveTask,
  v1BaseUrl,
} from "./trayUniserve";

export type Box = { x: number; y: number; w: number; h: number };

export type TrayAnchors = {
  continuityFrameUrl: string | null;
  continuityVideoUrl: string | null;
  characterSheetUrl: string | null;
  styleImageUrl: string | null;
};

export type TrayGenerateRequest = TrayAnchors & {
  prompt: string;
  seed: number;
  aspect: string;
  seconds: number;
};

export type TrayJobState = {
  status: "queued" | "generating" | "ready" | "failed";
  mp4Url: string | null;
  lastFrameUrl: string | null;
  progress?: string | null;
  error?: string;
};

export type TrayDetectResult = { boxes: Record<string, Box | null> };

export function trayUrls(): string[] {
  const list = envFlag("FASTH3_URLS");
  const single = envFlag("FASTH3_URL");
  const raw = list ?? single ?? "";
  return raw
    .split(",")
    .map((entry) => v1BaseUrl(entry))
    .filter((entry) => entry !== "");
}

export function trayMode(): "live" | "mock" {
  return trayUrls().length === 0 ? "mock" : "live";
}

export function instanceCount(): number {
  const count = trayUrls().length;
  return count === 0 ? 0 : count;
}

export function instanceForSeed(seed: number): string | null {
  const urls = trayUrls();
  if (urls.length === 0) return null;
  return urls[Math.abs(Math.trunc(seed)) % urls.length];
}

function instanceFor(seed: number): string {
  const url = instanceForSeed(seed);
  if (url === null) throw new Error("FASTH3_URLS is not set");
  return url;
}

function apiKey(): string | null {
  return envFlag("FASTH3_API_KEY");
}

export function detectConfigured(): boolean {
  return envFlag("DETECT_URL") !== null;
}

export function trayJobReference(jobId: string): { jobId: string; baseUrl: string | null } {
  const separator = jobId.lastIndexOf("@");
  if (separator === -1) return { jobId, baseUrl: null };
  const baseUrl = jobId.slice(separator + 1);
  return { jobId: jobId.slice(0, separator), baseUrl: baseUrl === "" ? null : baseUrl };
}

export async function trayGenerate(request: TrayGenerateRequest): Promise<{ jobId: string }> {
  if (trayMode() === "mock") {
    await sleep(mockLatencyMs());
    return { jobId: mockJobId(`${request.seed}:${request.prompt}`) };
  }
  const baseUrl = instanceFor(request.seed);
  const legend = referenceLegend(request);
  const uniserve: UniserveRequest = {
    baseUrl,
    apiKey: apiKey(),
    model: uniserveModel(),
    task: uniserveTask(),
    prompt: legend === "" ? request.prompt : `${request.prompt}\n\n${legend}`,
    seed: request.seed,
    aspect: request.aspect,
    seconds: request.seconds,
    continuityFrameUrl: request.continuityFrameUrl,
    continuityVideoUrl: request.continuityVideoUrl,
    characterSheetUrl: request.characterSheetUrl,
    styleImageUrl: request.styleImageUrl,
  };
  const { jobId } = await submitVideo(uniserve);
  return { jobId: `${jobId}@${baseUrl}` };
}

export async function trayGetJob(jobId: string): Promise<TrayJobState> {
  if (trayMode() === "mock") {
    return { status: "ready", mp4Url: stockClipForJob(jobId), lastFrameUrl: null };
  }
  const reference = trayJobReference(jobId);
  if (reference.baseUrl === null) {
    return { status: "failed", mp4Url: null, lastFrameUrl: null, error: `job ${jobId} has no instance` };
  }
  const state = await fetchVideoJob({ baseUrl: reference.baseUrl, apiKey: apiKey(), jobId: reference.jobId });
  return {
    status: state.status,
    mp4Url: state.mp4Url,
    lastFrameUrl: state.lastFrameUrl,
    progress: state.progress,
    error: state.error,
  };
}

export async function trayDownload(mp4Url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const key = apiKey();
  const headers: Record<string, string> = {};
  if (key !== null) headers.authorization = `Bearer ${key}`;
  const res = await fetch(mp4Url, { method: "GET", headers, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`clip download failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("clip download returned no bytes");
  return { bytes, contentType: res.headers.get("content-type") ?? "video/mp4" };
}

export async function trayDetect(frameUrl: string, targets: string[]): Promise<TrayDetectResult> {
  const url = envFlag("DETECT_URL");
  if (url === null || targets.length === 0) return { boxes: {} };
  const key = envFlag("DETECT_API_KEY");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers.authorization = `Bearer ${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ frame_url: frameUrl, targets }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`detect failed: ${res.status} ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text) as { boxes?: unknown };
  return { boxes: normalizeBoxes(parsed.boxes) };
}

export async function trayCancel(jobId: string): Promise<void> {
  if (trayMode() === "mock") return;
  const reference = trayJobReference(jobId);
  if (reference.baseUrl === null) return;
  await deleteVideoJob({ baseUrl: reference.baseUrl, apiKey: apiKey(), jobId: reference.jobId });
}

function normalizeBoxes(raw: unknown): Record<string, Box | null> {
  const out: Record<string, Box | null> = {};
  if (raw === null || raw === undefined) return out;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry === null || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const target = typeof row.target === "string" ? row.target : typeof row.label === "string" ? row.label : null;
      if (target === null) continue;
      out[target] = normalizeBox(row.box ?? row);
    }
    return out;
  }
  if (typeof raw === "object") {
    for (const [target, value] of Object.entries(raw as Record<string, unknown>)) {
      out[target] = normalizeBox(value);
    }
  }
  return out;
}

function normalizeBox(raw: unknown): Box | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const x = Number(row.x);
  const y = Number(row.y);
  const w = Number(row.w ?? row.width);
  const h = Number(row.h ?? row.height);
  if (![x, y, w, h].every((value) => Number.isFinite(value))) return null;
  if (w <= 0 || h <= 0) return null;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const box = { x: clamp(x), y: clamp(y), w: clamp(w), h: clamp(h) };
  if (box.x + box.w > 1) box.w = 1 - box.x;
  if (box.y + box.h > 1) box.h = 1 - box.y;
  return box;
}
