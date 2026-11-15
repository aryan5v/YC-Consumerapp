import { mockLatencyMs } from "./config";
import { envFlag, sleep } from "./env";
import { mockJobId, stockClipForJob } from "./stock";

export type Box = { x: number; y: number; w: number; h: number };

export type TrayAnchors = {
  continuityFrameUrl: string | null;
  characterSheetUrl: string | null;
  styleImageUrl: string | null;
  voiceRefUrl: string | null;
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
  error?: string;
};

export type TrayDetectResult = { boxes: Record<string, Box | null> };

export function trayMode(): "live" | "mock" {
  return envFlag("FASTH3_URL") === null ? "mock" : "live";
}

function baseUrl(): string {
  const raw = envFlag("FASTH3_URL");
  if (raw === null) throw new Error("FASTH3_URL is not set");
  return raw.replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  const key = envFlag("FASTH3_API_KEY");
  const base: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) base.authorization = `Bearer ${key}`;
  return base;
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`tray POST ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  if (text.trim() === "") return {};
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object") throw new Error(`tray POST ${path} returned ${typeof parsed}`);
  return parsed as Record<string, unknown>;
}

async function getJson(path: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "GET",
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`tray GET ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object") throw new Error(`tray GET ${path} returned ${typeof parsed}`);
  return parsed as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export async function trayGenerate(request: TrayGenerateRequest): Promise<{ jobId: string }> {
  if (trayMode() === "mock") {
    await sleep(mockLatencyMs());
    return { jobId: mockJobId(`${request.seed}:${request.prompt}`) };
  }
  const body = {
    prompt: request.prompt,
    continuity_frame_url: request.continuityFrameUrl,
    character_sheet_url: request.characterSheetUrl,
    style_image_url: request.styleImageUrl,
    voice_ref_url: request.voiceRefUrl,
    seed: request.seed,
    aspect: request.aspect,
    seconds: request.seconds,
  };
  const res = await postJson("/generate", body, 1800000);
  const jobId = readString(res, ["job_id", "jobId", "id"]);
  if (jobId === null) throw new Error("tray /generate returned no job_id");
  return { jobId };
}

export async function trayGetJob(jobId: string): Promise<TrayJobState> {
  if (trayMode() === "mock") {
    return { status: "ready", mp4Url: stockClipForJob(jobId), lastFrameUrl: null };
  }
  const res = await getJson(`/jobs/${encodeURIComponent(jobId)}`, 30000);
  const raw = (readString(res, ["status", "state"]) ?? "generating").toLowerCase();
  const status = normalizeStatus(raw);
  const mp4Url = readString(res, ["mp4_url", "mp4Url", "url", "video_url"]);
  if (raw.includes("cancel")) {
    return { status: "failed", mp4Url: null, lastFrameUrl: null, error: "tray job was cancelled" };
  }
  if (status === "failed") {
    return { status, mp4Url, lastFrameUrl: null, error: readString(res, ["error", "message"]) ?? "tray job failed" };
  }
  return {
    status,
    mp4Url,
    lastFrameUrl: readString(res, ["last_frame_url", "lastFrameUrl", "last_frame", "end_frame_url"]),
  };
}

function normalizeStatus(raw: string): TrayJobState["status"] {
  if (["ready", "succeeded", "success", "done", "complete", "completed", "finished"].includes(raw)) return "ready";
  if (["failed", "error", "cancelled", "canceled"].includes(raw)) return "failed";
  if (["queued", "pending", "submitted"].includes(raw)) return "queued";
  return "generating";
}

export async function trayDetect(frameUrl: string, targets: string[]): Promise<TrayDetectResult> {
  if (trayMode() === "mock" || targets.length === 0) return { boxes: {} };
  const res = await postJson("/detect", { frame_url: frameUrl, targets }, 60000);
  return { boxes: normalizeBoxes(res.boxes) };
}

export async function trayCancel(jobId: string): Promise<void> {
  if (trayMode() === "mock") return;
  await postJson(`/jobs/${encodeURIComponent(jobId)}/cancel`, {}, 15000);
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
