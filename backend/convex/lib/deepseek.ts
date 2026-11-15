import { directorTimeoutMs } from "./config";
import { envFlag } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function directorMode(): "live" | "fixture" {
  return envFlag("DEEPSEEK_API_KEY") === null ? "fixture" : "live";
}

export async function deepseekJSON(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const base = (envFlag("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const key = envFlag("DEEPSEEK_API_KEY");
  if (key === null) throw new Error("DEEPSEEK_API_KEY is not set");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: envFlag("DEEPSEEK_MODEL") ?? "deepseek-chat",
      messages,
      response_format: { type: "json_object" },
      temperature: 1.0,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(directorTimeoutMs()),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`deepseek failed: ${res.status} ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw new Error("deepseek returned no content");
  return content;
}

export function parseJSONObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in director response");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
