const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "into", "in", "on", "at", "of", "for", "with", "my", "your",
  "i", "you", "he", "she", "it", "we", "they", "that", "this", "is", "am", "are", "was", "be", "do",
  "does", "did", "will", "would", "can", "could", "should", "go", "going", "gonna", "want", "wanna",
  "let", "lets", "me", "us", "him", "her", "them", "there", "here", "then", "than", "so", "just",
  "up", "down", "out", "over", "off", "about", "like", "okay", "ok", "yeah", "yes", "no",
]);

const ORDINALS: Record<string, number> = {
  first: 0, one: 0, "1": 0, "1st": 0,
  second: 1, two: 1, "2": 1, "2nd": 1,
  third: 2, three: 2, "3": 2, "3rd": 2,
  fourth: 3, four: 3, "4": 3,
};

export type SpokenOption = { id: string; label: string; target: string; spokenLine: string };
export type SpokenMatch = { optionId: string | null; score: number; verbatim: boolean };

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenList(raw: string): string[] {
  const out: string[] = [];
  for (const token of normalize(raw).split(" ")) {
    if (token === "" || STOPWORDS.has(token)) continue;
    if (token.length < 3 && !/^[0-9]/.test(token)) continue;
    out.push(token);
  }
  return out;
}

function tokenize(raw: string): Set<string> {
  return new Set(tokenList(raw));
}

export function matchSpokenOption(options: SpokenOption[], transcript: string): SpokenMatch {
  const said = normalize(transcript);
  if (said === "" || options.length === 0) return { optionId: null, score: 0, verbatim: false };
  const saidTokens = tokenize(transcript);

  const scores = options.map((option) => {
    const keys = tokenize(`${option.label} ${option.target} ${option.spokenLine}`);
    let hits = 0;
    for (const key of keys) {
      if (saidTokens.has(key)) hits += 1;
    }
    const target = normalize(option.target);
    const verbatim = target.length >= 4 && said.includes(target);
    const ratio = keys.size === 0 ? 0 : hits / keys.size;
    return { optionId: option.id, hits, ratio: verbatim ? 1 : ratio, verbatim };
  });

  const verbatim = scores.filter((entry) => entry.verbatim);
  if (verbatim.length > 0) {
    return { optionId: verbatim[0].optionId, score: 1, verbatim: true };
  }

  const ranked = [...scores].sort((left, right) => right.hits - left.hits || right.ratio - left.ratio);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const unambiguous =
    best.hits > 0 &&
    best.ratio >= 0.25 &&
    (runnerUp === undefined || runnerUp.hits !== best.hits || runnerUp.optionId === best.optionId);
  if (unambiguous) return { optionId: best.optionId, score: best.ratio, verbatim: false };

  for (const word of tokenList(transcript)) {
    const index = ORDINALS[word];
    if (index !== undefined && options[index] !== undefined) {
      return { optionId: options[index].id, score: 0.5, verbatim: false };
    }
  }
  return { optionId: null, score: best.ratio, verbatim: false };
}

export function askAgainLine(characterName: string): string {
  const who = characterName === "" ? "He" : characterName.charAt(0).toUpperCase() + characterName.slice(1);
  return `${who} did not catch that. Say it again, or tap one of the three.`;
}
