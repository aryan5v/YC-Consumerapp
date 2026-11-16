import { envFlag } from "./env";

export type Region = {
  centroid: { x: number; y: number };
  polygon: [number, number][][] | null;
  maskUrl: string | null;
};

export type SegmentResult = { target: string; found: boolean; score: number; region: Region | null };

export function segmentConfigured(): boolean {
  return envFlag("SEGMENT_URL") !== null;
}

function segmentUrl(): string | null {
  const raw = envFlag("SEGMENT_URL");
  if (raw === null) return null;
  return raw.trim().replace(/\/+$/, "");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function point(raw: unknown): [number, number] | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [clamp01(x), clamp01(y)];
    return null;
  }
  if (raw !== null && typeof raw === "object") {
    const row = raw as { x?: unknown; y?: unknown };
    const x = Number(row.x);
    const y = Number(row.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return [clamp01(x), clamp01(y)];
  }
  return null;
}

export function normalizeRegion(raw: unknown, limit = 200): Region | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const row = raw as { centroid?: unknown; polygon?: unknown; mask_url?: unknown; maskUrl?: unknown };
  const polygons: [number, number][][] = [];
  if (Array.isArray(row.polygon) && row.polygon.length > 0) {
    const nested = Array.isArray(row.polygon[0]) && Array.isArray((row.polygon[0] as unknown[])[0]);
    const rings = (nested ? row.polygon : [row.polygon]) as unknown[];
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue;
      const points: [number, number][] = [];
      for (const entry of ring.slice(0, limit)) {
        const parsed = point(entry);
        if (parsed !== null) points.push(parsed);
      }
      if (points.length >= 3) polygons.push(points);
    }
  }
  const centroidRaw = row.centroid;
  let centroid: { x: number; y: number } | null = null;
  if (centroidRaw !== null && typeof centroidRaw === "object") {
    const x = Number((centroidRaw as { x?: unknown }).x);
    const y = Number((centroidRaw as { y?: unknown }).y);
    if (Number.isFinite(x) && Number.isFinite(y)) centroid = { x: clamp01(x), y: clamp01(y) };
  }
  if (centroid === null && polygons.length > 0) {
    const all = polygons.flat();
    const x = all.reduce((total, pair) => total + pair[0], 0) / all.length;
    const y = all.reduce((total, pair) => total + pair[1], 0) / all.length;
    centroid = { x: clamp01(x), y: clamp01(y) };
  }
  if (centroid === null) return null;
  const mask = row.mask_url ?? row.maskUrl;
  return {
    centroid,
    polygon: polygons.length === 0 ? null : polygons,
    maskUrl: typeof mask === "string" && mask.trim() !== "" ? mask.trim() : null,
  };
}

export function regionArea(region: Region): number {
  return (region.polygon ?? []).reduce((area, ring) => {
    let doubled = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const next = ring[(i + 1) % ring.length];
      doubled += ring[i][0] * next[1] - next[0] * ring[i][1];
    }
    return area + Math.abs(doubled) / 2;
  }, 0);
}

export function usableRegion(raw: unknown): Region | null {
  const region = normalizeRegion(raw);
  if (region === null) return null;
  const area = regionArea(region);
  return area >= 0.005 && area <= 0.12 ? region : null;
}

export async function segmentFrame(
  frameUrl: string,
  targets: string[],
): Promise<Record<string, Region | null>> {
  const base = segmentUrl();
  const out: Record<string, Region | null> = {};
  if (base === null || targets.length === 0) return out;
  const key = envFlag("SEGMENT_API_KEY");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/segment`, {
    method: "POST",
    headers,
    body: JSON.stringify({ frame_url: frameUrl, targets }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`segment failed: ${res.status} ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text) as { results?: unknown };
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  for (const entry of results) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as { target?: unknown; found?: unknown; score?: unknown; region?: unknown };
    const target = typeof row.target === "string" ? row.target : null;
    if (target === null) continue;
    const found = row.found === true;
    const score = Number(row.score);
    out[target] = found && Number.isFinite(score) && score > 0 ? normalizeRegion(row.region) : null;
  }
  return out;
}
