import { Fragment, useSyncExternalStore } from "react";
import { episode, nodes } from "./mockEpisode";
import type { ClipStatus, HomeView, RunView, StoryProvider } from "./types";

type Run = {
  id: string;
  node: string;
  beatIndex: number;
  path: string[];
  ended: boolean;
  readyAt: Record<string, number>;
};

const MUTATION_LATENCY = 40;
const FIRST_CLIP_DELAY = 900;

let run: Run | null = null;
let streak = 3;
let countedToday = false;
let runs = 0;
let homeSnap: HomeView;
let runSnap: RunView | undefined;
const listeners = new Set<() => void>();

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusOf(r: Run, node: string): ClipStatus {
  const at = r.readyAt[node];
  return at !== undefined && at <= Date.now() ? "ready" : "generating";
}

function buildRun(r: Run): RunView {
  const node = nodes[r.node];
  const child = (to: string) => {
    const status = statusOf(r, to);
    return { status, clipUrl: status === "ready" ? nodes[to].clip : null };
  };
  const ready = statusOf(r, r.node) === "ready";
  return {
    status: r.ended ? "ended" : "active",
    beatIndex: r.beatIndex,
    beatsTotal: episode.beatsTotal,
    current: {
      beatId: `${r.id}:${r.beatIndex}:${r.node}`,
      clipUrl: ready ? node.clip : null,
      narration: node.narration,
      status: ready ? "ready" : "generating",
    },
    stop:
      node.stop === null
        ? null
        : node.stop.kind === "choice"
          ? {
              kind: "choice",
              options: node.stop.options.map((o) => {
                const c = child(o.to);
                return { id: o.id, label: o.label, box: o.box, childStatus: c.status, childClipUrl: c.clipUrl };
              }),
            }
          : {
              kind: "puzzle",
              question: node.stop.question,
              answerType: node.stop.answerType,
              choices: node.stop.choices,
              outcomes: { success: child(node.stop.success.to), failure: child(node.stop.failure.to) },
            },
    ending: node.ending ? { ...node.ending, path: r.path } : null,
  };
}

function emit() {
  homeSnap = {
    episode: { id: episode.id, date: today(), title: episode.title, tagline: episode.tagline, posterUrl: episode.posterUrl },
    streak,
    run: run ? { id: run.id, status: run.ended ? "ended" : "active" } : null,
  };
  runSnap = run ? buildRun(run) : undefined;
  listeners.forEach((l) => l());
}
emit();

function generate(r: Run, node: string, at: number) {
  if (r.readyAt[node] !== undefined) return;
  r.readyAt[node] = at;
  setTimeout(() => run === r && emit(), Math.max(0, at - Date.now()) + 10);
}

function enter(r: Run, node: string) {
  r.node = node;
  const stop = nodes[node].stop;
  if (stop === null) {
    r.ended = true;
    if (!countedToday) {
      countedToday = true;
      streak += 1;
    }
    return;
  }
  const from = Math.max(Date.now(), r.readyAt[node] ?? 0);
  const children = stop.kind === "choice" ? stop.options : [stop.success, stop.failure];
  for (const c of children) generate(r, c.to, from + c.delay);
}

function advance(r: Run, to: string, label: string) {
  r.path.push(label);
  r.beatIndex += 1;
  generate(r, to, Date.now());
  enter(r, to);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const latency = () => new Promise<void>((resolve) => setTimeout(resolve, MUTATION_LATENCY));

function activeRun(runId: string) {
  if (!run || run.id !== runId) throw new Error("Unknown run");
  return run;
}

export const mockProvider: StoryProvider = {
  name: "mock",
  canReplay: true,
  Root: Fragment,
  useHome: () => useSyncExternalStore(subscribe, () => homeSnap),
  useRun: (runId) => {
    const view = useSyncExternalStore(subscribe, () => runSnap);
    return run && run.id === runId ? view : undefined;
  },
  async startToday() {
    await latency();
    runs += 1;
    const r: Run = { id: `mock-run-${runs}`, node: episode.start, beatIndex: 0, path: [], ended: false, readyAt: {} };
    run = r;
    generate(r, episode.start, Date.now() + FIRST_CLIP_DELAY);
    enter(r, episode.start);
    emit();
    return r.id;
  },
  async choose(runId, optionId) {
    await latency();
    const r = activeRun(runId);
    const stop = nodes[r.node].stop;
    const option = stop?.kind === "choice" ? stop.options.find((o) => o.id === optionId) : undefined;
    if (!option) throw new Error("Unknown option");
    advance(r, option.to, option.label);
  },
  async answer(runId, answer) {
    await latency();
    const r = activeRun(runId);
    const stop = nodes[r.node].stop;
    if (stop?.kind !== "puzzle") throw new Error("No puzzle at this beat");
    const given = answer.trim().toLowerCase();
    const correct =
      stop.answerType === "number" ? stop.accept.some((a) => Number(a) === Number(given)) : stop.accept.includes(given);
    const branch = correct ? stop.success : stop.failure;
    advance(r, branch.to, branch.label);
    return { correct };
  },
};
