import { DirectorPuzzleStop, DirectorStop, DirectorChildIntent, DirectorOption } from "./director";

export type ChildSpec = {
  optionId: string;
  label: string;
  action: string;
  target: string | null;
  clipPrompt?: string;
  narration?: string;
  spokenLine: string;
};

export function childSpecs(stop: DirectorStop): ChildSpec[] {
  if (stop.kind === "choice") {
    return stop.options.map((option: DirectorOption) => ({
      optionId: option.id,
      label: option.label,
      action: option.leads_to,
      target: option.target,
      clipPrompt: option.clip_prompt,
      narration: option.narration,
      spokenLine: option.spoken_line,
    }));
  }
  return [stop.success, stop.failure].map((child: DirectorChildIntent) => ({
    optionId: child.id,
    label: child.label,
    action: child.leads_to,
    target: null,
    clipPrompt: child.clip_prompt,
    narration: child.narration,
    spokenLine: child.spoken_line,
  }));
}

export function composeChildPrompt(parentClipPrompt: string, spec: ChildSpec): string {
  const previous = parentClipPrompt.trim().replace(/\s+/g, " ");
  const parts: string[] = [];
  if (previous !== "") parts.push(`The previous shot: ${previous}`);
  parts.push(`Next shot: ${spec.clipPrompt ?? spec.action}`);
  if (spec.target !== null) parts.push(`The ${spec.target} is clearly visible and well separated in the frame.`);
  parts.push("The camera cuts to a new angle on the same character in the same location at the same moment.");
  return parts.join(" ");
}

export function checkAnswer(stop: DirectorPuzzleStop, answer: string): boolean {
  const given = normalizeAnswer(answer);
  if (given === "") return false;
  const accepted = stop.answers.map(normalizeAnswer).filter((entry) => entry !== "");
  if (stop.answer_type === "number") {
    const givenDigits = digitsOnly(answer);
    if (givenDigits === "") return false;
    return accepted.some((entry) => digitsOnly(entry) === givenDigits);
  }
  if (accepted.some((entry) => entry === given)) return true;
  if (stop.answer_type === "pick") return false;
  return accepted.some((entry) => tokenOverlap(entry, given) >= 0.6);
}

export function outcomeLabel(stop: DirectorPuzzleStop, correct: boolean): string {
  const child = correct ? stop.success : stop.failure;
  return child.label;
}

function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let hits = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) hits += 1;
  }
  return hits / Math.max(leftTokens.size, rightTokens.size);
}
