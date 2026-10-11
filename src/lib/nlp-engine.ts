/**
 * Client-side NLP pipeline that runs on top of the FinBERT labels.
 * Simulates the responses of transformer endpoints (ABSA, NER, summarisation,
 * emotion classification) with transparent lexicon + rule based models so the
 * dashboard works out of the box. Each stage is a pure function; swap any of
 * them for a real Hugging Face pipeline without touching the UI.
 */
export type Polarity = "Positive" | "Neutral" | "Negative";
export type NlpDoc = {
  title: string;
  source: string;
  kind: "News" | "Social";
  sentiment: Polarity;
  confidence: number;
  modelled: boolean;
};

const POS = [
  "gain",
  "gains",
  "rise",
  "rises",
  "rally",
  "jumps",
  "surge",
  "beat",
  "beats",
  "strong",
  "growth",
  "record",
  "upgrade",
  "raise",
  "raises",
  "profit",
  "boost",
  "bullish",
  "outperform",
  "expansion",
  "opportunity",
  "opportunities",
  "better",
  "buy",
  "higher",
  "win",
  "approval",
  "support",
  "positive",
  "nicely",
  "up",
  "soars",
  "climbs",
];
const NEG = [
  "fall",
  "falls",
  "slip",
  "slips",
  "decline",
  "drop",
  "drops",
  "loss",
  "losses",
  "weak",
  "miss",
  "cut",
  "downgrade",
  "probe",
  "fine",
  "lawsuit",
  "pressure",
  "concern",
  "concerns",
  "worried",
  "risk",
  "risks",
  "crash",
  "bearish",
  "retreat",
  "sell",
  "lower",
  "trimming",
  "plunge",
  "slump",
  "fears",
  "tariff",
  "antitrust",
  "down",
];

export const ASPECTS: Record<string, string[]> = {
  "Earnings & Guidance": [
    "earnings",
    "revenue",
    "profit",
    "results",
    "quarter",
    "margin",
    "margins",
    "guidance",
    "eps",
    "sales",
    "q1",
    "q2",
    "q3",
    "q4",
    "dividend",
  ],
  "Leadership & Management": [
    "ceo",
    "chairman",
    "management",
    "board",
    "founder",
    "executive",
    "ambani",
    "musk",
    "cook",
    "huang",
    "leadership",
    "md",
  ],
  "Product Innovation": [
    "ai",
    "launch",
    "product",
    "chip",
    "chips",
    "iphone",
    "ev",
    "platform",
    "innovation",
    "technology",
    "jio",
    "retail",
    "model",
    "gpu",
    "digital",
  ],
  "Regulatory Risk": [
    "sebi",
    "sec",
    "rbi",
    "regulator",
    "regulatory",
    "probe",
    "lawsuit",
    "antitrust",
    "court",
    "fine",
    "compliance",
    "ban",
    "approval",
    "tax",
    "tariff",
    "rpts",
    "nod",
  ],
  Macroeconomics: [
    "inflation",
    "rates",
    "rate",
    "fed",
    "gdp",
    "economy",
    "markets",
    "market",
    "global",
    "demand",
    "oil",
    "rupee",
    "dollar",
    "recession",
    "nifty",
    "sensex",
  ],
};

const ENTITY_DICT: Record<string, string> = {
  sebi: "Regulator",
  rbi: "Regulator",
  sec: "Regulator",
  fed: "Regulator",
  nse: "Exchange",
  bse: "Exchange",
  nasdaq: "Exchange",
  ambani: "Executive",
  "mukesh ambani": "Executive",
  musk: "Executive",
  "elon musk": "Executive",
  "tim cook": "Executive",
  "jensen huang": "Executive",
  "n chandrasekaran": "Executive",
  jio: "Product",
  "jio platforms": "Product",
  iphone: "Product",
  "model y": "Product",
  blackwell: "Product",
  gpu: "Product",
  ipo: "Event",
  reliance: "Company",
  "reliance industries": "Company",
  tcs: "Company",
  infosys: "Company",
  wipro: "Company",
  "hdfc bank": "Company",
  icici: "Company",
  sbi: "Company",
  "tata motors": "Company",
  apple: "Company",
  tesla: "Company",
  nvidia: "Company",
  amd: "Company",
  microsoft: "Company",
  byd: "Company",
  bitcoin: "Asset",
  "motilal oswal": "Broker",
  "morgan stanley": "Broker",
  "goldman sachs": "Broker",
};

export const EMOTIONS: Record<string, string[]> = {
  Optimistic: [
    "growth",
    "opportunity",
    "opportunities",
    "outlook",
    "expansion",
    "upgrade",
    "raise",
    "strong",
    "support",
    "better",
    "beat",
  ],
  "Panic/Fear": [
    "fears",
    "worried",
    "risk",
    "risks",
    "crash",
    "concern",
    "concerns",
    "pressure",
    "slump",
    "plunge",
    "warning",
  ],
  Uncertain: [
    "may",
    "could",
    "might",
    "waiting",
    "what",
    "assess",
    "uncertain",
    "mixed",
    "volatile",
    "should",
    "if",
    "?",
  ],
  Euphoric: [
    "record",
    "surge",
    "soars",
    "rally",
    "jumps",
    "moon",
    "massive",
    "skyrocket",
    "blowout",
  ],
  Aggressive: [
    "dump",
    "trimming",
    "sell",
    "slash",
    "cut",
    "attack",
    "battle",
    "antitrust",
    "lawsuit",
    "!",
  ],
};
const URGENT = [
  "now",
  "breaking",
  "alert",
  "urgent",
  "today",
  "immediately",
  "crash",
  "plunge",
  "panic",
];
const STOP = new Set(
  "a an the and or of to in on for with at by from as is are was be it its this that what why how should do does into over after before vs amid will their his her our your my more most new share shares stock stocks price prices ltd inc limited news quote history today s".split(
    " ",
  ),
);

export const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9$&?!.\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.$-]+|[.-]+$/g, ""))
    .filter(Boolean);
const polarityScore = (p: Polarity) => (p === "Positive" ? 1 : p === "Negative" ? -1 : 0);

/** Lexicon polarity, used for token highlights and as the fallback when FinBERT has not labelled a document. */
export function lexiconPolarity(text: string): { label: Polarity; score: number } {
  const toks = tokenize(text);
  const s = toks.filter((t) => POS.includes(t)).length - toks.filter((t) => NEG.includes(t)).length;
  return { label: s > 0 ? "Positive" : s < 0 ? "Negative" : "Neutral", score: s };
}
export function highlightTokens(text: string) {
  return text.split(/(\s+)/).map((part) => {
    const t = part.toLowerCase().replace(/[^a-z]/g, "");
    return { text: part, tone: POS.includes(t) ? "pos" : NEG.includes(t) ? "neg" : "" };
  });
}
const docPolarity = (d: NlpDoc) =>
  d.modelled ? polarityScore(d.sentiment) * (d.confidence / 100) : 0;

/** Aspect-Based Sentiment Analysis: score from -100..100 per financial driver. */
export function aspectSentiment(docs: NlpDoc[]) {
  return Object.entries(ASPECTS).map(([aspect, words]) => {
    const hits = docs.filter((d) => tokenize(d.title).some((t) => words.includes(t)));
    const score = hits.length
      ? Math.round((hits.reduce((a, d) => a + docPolarity(d), 0) / hits.length) * 100)
      : 0;
    return { aspect, score, mentions: hits.length };
  });
}

/** Named Entity Recognition: dictionary gazetteer + capitalised-phrase fallback. */
export function extractEntities(docs: NlpDoc[]) {
  const counts = new Map<string, { name: string; type: string; count: number }>();
  const add = (name: string, type: string) => {
    const k = name.toLowerCase();
    const e = counts.get(k) ?? { name, type, count: 0 };
    e.count += 1;
    counts.set(k, e);
  };
  for (const d of docs) {
    const lower = ` ${d.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
    const found = new Set<string>();
    for (const key of Object.keys(ENTITY_DICT).sort((a, b) => b.length - a.length)) {
      if (lower.includes(` ${key} `) && ![...found].some((f) => f.includes(key))) {
        found.add(key);
        add(
          key
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .replace(/^(Sebi|Rbi|Sec|Nse|Bse|Tcs|Sbi|Ipo|Gpu|Amd|Byd)$/, (m) => m.toUpperCase()),
          ENTITY_DICT[key] ?? "Other",
        );
      }
    }
    for (const m of d.title.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g)) {
      const n = m[1] ?? "";
      if (!found.has(n.toLowerCase()) && ![...found].some((f) => n.toLowerCase().includes(f)))
        add(n, "Organisation");
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

/** Topic intelligence: frequent stopword-filtered bigrams and unigrams. */
export function trendingTopics(docs: NlpDoc[]) {
  const freq = new Map<string, number>();
  for (const d of docs) {
    const toks = tokenize(d.title).filter(
      (t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t) && !/[?!]/.test(t),
    );
    toks.forEach((t, i) => {
      freq.set(t, (freq.get(t) ?? 0) + 1);
      const n = toks[i + 1];
      if (n) freq.set(`${t} ${n}`, (freq.get(`${t} ${n}`) ?? 0) + 1.5);
    });
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([topic, weight]) => ({ topic, weight }));
}

/** Emotion classification per document + aggregate distribution. */
export function classifyEmotion(text: string) {
  const toks = tokenize(text);
  const raw = text.toLowerCase();
  const scores = Object.entries(EMOTIONS).map(
    ([e, words]) =>
      [
        e,
        words.reduce(
          (a, w) =>
            a + (w.length === 1 ? raw.split(w).length - 1 : toks.filter((t) => t === w).length),
          0,
        ),
      ] as const,
  );
  const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0
    ? best[0]
    : lexiconPolarity(text).score > 0
      ? "Optimistic"
      : lexiconPolarity(text).score < 0
        ? "Panic/Fear"
        : "Uncertain";
}
export function emotionMix(docs: NlpDoc[]) {
  const counts: Record<string, number> = Object.fromEntries(
    Object.keys(EMOTIONS).map((k) => [k, 0]),
  );
  docs.forEach((d) => {
    const e = classifyEmotion(d.title);
    counts[e] = (counts[e] ?? 0) + 1;
  });
  const total = docs.length || 1;
  return Object.entries(counts).map(([emotion, n]) => ({
    emotion,
    share: Math.round((n / total) * 100),
  }));
}

/** Fear & Greed: 0 = panic, 100 = greed. Mixes polarity with linguistic aggression + urgency, weighted to social text. */
export function fearGreed(docs: NlpDoc[]) {
  if (!docs.length) return { score: 50, aggression: 0, urgency: 0 };
  let pol = 0,
    agg = 0,
    urg = 0,
    w = 0;
  for (const d of docs) {
    const weight = d.kind === "Social" ? 1.5 : 1;
    const toks = tokenize(d.title);
    const caps = (d.title.match(/\b[A-Z]{3,}\b/g) ?? []).length;
    agg +=
      weight *
      Math.min(
        1,
        (EMOTIONS["Aggressive"] ?? []).filter((x) => toks.includes(x)).length * 0.5 +
          (d.title.split("!").length - 1) * 0.3 +
          caps * 0.1,
      );
    urg += weight * Math.min(1, toks.filter((t) => URGENT.includes(t)).length * 0.5);
    pol += weight * docPolarity(d);
    w += weight;
  }
  const aggression = Math.round((agg / w) * 100),
    urgency = Math.round((urg / w) * 100);
  const score = Math.round(
    Math.max(0, Math.min(100, 50 + (pol / w) * 45 - aggression * 0.15 - urgency * 0.1)),
  );
  return { score, aggression, urgency };
}

/** Extractive "transformer-style" summary: 3 bullets from the most confident documents. */
export function executiveSummary(
  company: string,
  docs: NlpDoc[],
  aspects: ReturnType<typeof aspectSentiment>,
  fg: number,
) {
  if (!docs.length) return [];
  const pos = docs.filter((d) => docPolarity(d) > 0).length,
    neg = docs.filter((d) => docPolarity(d) < 0).length;
  const tilt = pos > neg ? "leans positive" : neg > pos ? "leans negative" : "is balanced";
  const top = [...aspects]
    .filter((a) => a.mentions)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];
  const lead = [...docs].sort((a, b) => Math.abs(docPolarity(b)) - Math.abs(docPolarity(a)))[0];
  const social = docs.filter((d) => d.kind === "Social");
  return [
    `Coverage of ${company} ${tilt}: ${pos} positive, ${neg} negative and ${docs.length - pos - neg} neutral items across ${social.length ? "news and social posts" : "news headlines"}.`,
    top
      ? `${top.aspect} is the strongest driver (${top.score > 0 ? "+" : ""}${top.score}, ${top.mentions} mention${top.mentions > 1 ? "s" : ""}); key line: “${lead?.title ?? ""}”.`
      : `No single financial driver dominates; key line: “${lead?.title ?? ""}”.`,
    social.length
      ? `Social chatter (${social.length} posts) — language mood ${fg}/100.`
      : `Headline language mood is ${fg}/100; no live social source is connected.`,
  ];
}

/** Natural-language query parser for the semantic search bar. */
const SECTOR_WORDS: Record<string, string[]> = {
  tech: ["Information Technology", "Consumer Technology", "Semiconductors"],
  technology: ["Information Technology", "Consumer Technology", "Semiconductors"],
  it: ["Information Technology"],
  bank: ["Banking & Finance"],
  banking: ["Banking & Finance"],
  finance: ["Banking & Finance"],
  financial: ["Banking & Finance"],
  auto: ["Automotive", "Electric Vehicles"],
  ev: ["Electric Vehicles", "Automotive"],
  energy: ["Energy & Retail"],
  crypto: ["Cryptocurrency"],
  us: [
    "Consumer Technology",
    "Semiconductors",
    "Electric Vehicles",
    "US Index Fund",
    "Cryptocurrency",
  ],
  indian: ["Energy & Retail", "Information Technology", "Automotive", "Banking & Finance"],
  pharma: ["Pharmaceuticals"],
  pharmaceutical: ["Pharmaceuticals"],
};
export type ParsedQuery = {
  sectors: string[];
  polarity: Polarity | null;
  aspect: string | null;
  rising: boolean;
  terms: string[];
  explanation: string;
};
export function parseQuery(q: string): ParsedQuery {
  const toks = tokenize(q);
  const sectors = [...new Set(toks.flatMap((t) => SECTOR_WORDS[t] ?? []))];
  const polarity: Polarity | null = toks.some((t) =>
    ["negative", "bearish", "bad", "falling", "down", "worst"].includes(t),
  )
    ? "Negative"
    : toks.some((t) =>
          [
            "positive",
            "bullish",
            "rising",
            "surging",
            "surge",
            "good",
            "up",
            "best",
            "improving",
          ].includes(t),
        )
      ? "Positive"
      : toks.includes("neutral")
        ? "Neutral"
        : null;
  const aspect =
    Object.entries(ASPECTS).find(([name, words]) =>
      toks.some((t) => words.includes(t) || (name.toLowerCase().includes(t) && t.length > 4)),
    )?.[0] ?? null;
  const used = new Set([
    "show",
    "me",
    "find",
    "with",
    "around",
    "this",
    "week",
    "stocks",
    "stock",
    "news",
    "for",
    "sentiment",
    "rising",
    "negative",
    "positive",
    "about",
    "the",
    "and",
    "in",
    "of",
    "all",
  ]);
  const terms = toks.filter((t) => !used.has(t) && !SECTOR_WORDS[t] && t.length > 2);
  const parts = [
    sectors.length ? `sector: ${sectors.join(", ")}` : "",
    polarity ? `polarity: ${polarity}` : "",
    aspect ? `aspect: ${aspect}` : "",
    toks.includes("rising") ? "trend: rising" : "",
  ].filter(Boolean);
  return {
    sectors,
    polarity,
    aspect,
    rising: toks.includes("rising"),
    terms,
    explanation: parts.length ? parts.join(" · ") : "keyword match",
  };
}
export function matchesQuery(doc: NlpDoc, q: ParsedQuery) {
  if (q.polarity && (!doc.modelled || doc.sentiment !== q.polarity)) return false;
  const toks = tokenize(doc.title);
  if (q.aspect && !toks.some((t) => (ASPECTS[q.aspect ?? ""] ?? []).includes(t))) return false;
  return true;
}
