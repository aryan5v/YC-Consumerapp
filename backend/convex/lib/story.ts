import {
  DirectorChildIntent,
  DirectorPuzzleStop,
  DirectorStop,
  StopAction,
  StopObject,
} from "./director";
import { Region } from "./segment";

export type ChildSpec = {
  optionId: string;
  actionId?: string;
  label: string;
  action: string;
  target: string | null;
  region: Region | null;
  clipPrompt?: string;
  narration?: string;
  spokenLine: string;
};

export function stopObjects(stop: DirectorStop): StopObject[] {
  if (stop.kind !== "choice") return [];
  return stop.objects;
}

export function childSpecs(stop: DirectorStop): ChildSpec[] {
  if (stop.kind === "choice") {
    return stop.objects.flatMap((object) =>
      object.actions.map((action) => ({
        optionId: object.id,
        actionId: action.id,
        label: object.actions.length > 1 ? `${object.label} — ${action.label}` : object.label,
        action: action.label,
        target: object.target,
        region: object.region,
        clipPrompt: action.clip_prompt,
        narration: action.narration,
        spokenLine: action.spoken_line,
      })),
    );
  }
  return [stop.success, stop.failure].map((child: DirectorChildIntent) => ({
    optionId: child.id,
    label: child.label,
    action: child.leads_to,
    target: null,
    region: null,
    clipPrompt: child.clip_prompt,
    narration: child.narration,
    spokenLine: child.spoken_line,
  }));
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

export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

export function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let hits = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) hits += 1;
  }
  return hits / Math.max(leftTokens.size, rightTokens.size);
}
