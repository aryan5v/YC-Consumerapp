import {
  DirectorChildIntent,
  DirectorOption,
  DirectorPuzzleStop,
  DirectorStop,
  StopAction,
  StopObject,
  optionToObject,
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
  return stop.objects ?? [];
}

export type StopObjectView = {
  id: string;
  label: string;
  region: Region | null;
  actions: { id: string; label: string }[];
};

// Stored runs outlive the code that wrote them: a phone can hold a run whose stop was written
// before objects existed. Always read a stop through here so older rows stay playable.
export function stopObjectViews(stop: unknown): StopObjectView[] {
  if (stop === null || typeof stop !== "object") return [];
  const row = stop as { kind?: unknown; objects?: unknown; options?: unknown };
  if (row.kind !== "choice") return [];
  if (Array.isArray(row.objects)) {
    return row.objects.flatMap((entry) => {
      if (entry === null || typeof entry !== "object") return [];
      const object = entry as { id?: unknown; label?: unknown; region?: unknown; actions?: unknown };
      if (typeof object.id !== "string") return [];
      const actions = Array.isArray(object.actions)
        ? object.actions.flatMap((action) => {
            if (action === null || typeof action !== "object") return [];
            const shaped = action as { id?: unknown; label?: unknown };
            if (typeof shaped.id !== "string") return [];
            return [
              {
                id: shaped.id,
                label: typeof shaped.label === "string" ? shaped.label : object.id as string,
              },
            ];
          })
        : [];
      return [
        {
          id: object.id,
          label: typeof object.label === "string" ? object.label : object.id,
          region: (object.region ?? null) as Region | null,
          actions: actions.length > 0 ? actions : [{ id: `${object.id}1`, label: String(object.label ?? object.id) }],
        },
      ];
    });
  }
  if (Array.isArray(row.options)) {
    return row.options.flatMap((entry) => {
      if (entry === null || typeof entry !== "object") return [];
      const option = entry as { id?: unknown; label?: unknown };
      if (typeof option.id !== "string") return [];
      const label = typeof option.label === "string" ? option.label : option.id;
      return [{ id: option.id, label, region: null, actions: [{ id: `${option.id}1`, label }] }];
    });
  }
  return [];
}

export function childSpecs(stop: DirectorStop): ChildSpec[] {
  if (stop.kind === "choice") {
    const row = stop as DirectorStop & { options?: DirectorOption[] };
    const objects = Array.isArray(stop.objects)
      ? stop.objects
      : Array.isArray(row.options)
        ? row.options.map(optionToObject)
        : [];
    return objects.flatMap((object) =>
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
