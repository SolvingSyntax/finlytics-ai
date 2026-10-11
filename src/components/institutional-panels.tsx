import { useQuery } from "@tanstack/react-query";
import { Activity, Radar, Scale } from "lucide-react";
import { useFinbert } from "@/hooks/use-finbert";
import {
  fetchPeerHeadlines,
  fetchPriceHistory,
  type Headline,
  type Quote,
} from "@/lib/market-feed.functions";
import { aspectSentiment, type NlpDoc, type Polarity } from "@/lib/nlp-engine";
import type { Stock } from "@/lib/market-data";

const polarity = (s: Polarity) => (s === "Positive" ? 1 : s === "Negative" ? -1 : 0);
const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number | null | undefined) =>
  n == null || n === 0 ? "" : n > 0 ? "inst-pos" : "inst-neg";

/* ---------------- Alpha signals ---------------- */
type Signal = { bias: "Bullish" | "Bearish" | "Watch"; title: string; why: string };

export function AlphaSignalsPanel({
  stock,
  docs,
  quote,
}: {
  stock: Stock;
  docs: NlpDoc[];
  quote: Quote | undefined;
}) {
  const ready = docs.length > 0 && docs.every((d) => d.modelled);
  const signals: Signal[] = [];
  if (ready) {
    const net = docs.reduce((a, d) => a + polarity(d.sentiment) * (d.confidence / 100), 0);
    const netPct = Math.round((net / docs.length) * 100);
    const move = quote?.changePct ?? null;
    const top = [...docs]
      .filter((d) => d.sentiment !== "Neutral")
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (netPct >= 25)
      signals.push({
        bias: "Bullish",
        title: `Bullish news momentum for ${stock.symbol}`,
        why: `Net FinBERT sentiment ${netPct > 0 ? "+" : ""}${netPct} across ${docs.length} headlines${top ? ` — catalyst: “${top.title}”` : ""}.`,
      });
    else if (netPct <= -25)
      signals.push({
        bias: "Bearish",
        title: `Bearish news pressure on ${stock.symbol}`,
        why: `Net FinBERT sentiment ${netPct} across ${docs.length} headlines${top ? ` — catalyst: “${top.title}”` : ""}.`,
      });
    if (move != null && Math.abs(netPct) >= 15 && Math.sign(move) !== Math.sign(netPct) && move !== 0)
      signals.push({
        bias: "Watch",
        title: "Price and news diverge",
        why: `Price ${pct(move)} today while headline sentiment is ${netPct > 0 ? "positive" : "negative"}. Divergences often resolve one way or the other.`,
      });
    for (const a of aspectSentiment(docs))
      if (a.mentions >= 2 && Math.abs(a.score) >= 40)
        signals.push({
          bias: a.score > 0 ? "Bullish" : "Bearish",
          title: `${a.aspect}: ${a.score > 0 ? "strong positive" : "strong negative"} cluster`,
          why: `${a.mentions} headlines on this theme with aspect score ${a.score > 0 ? "+" : ""}${a.score}.`,
        });
  }
  return (
    <div className="panel inst-panel">
      <div className="panel-heading">
        <h3>
          <Activity size={12} /> Alpha signals
        </h3>
        <span className="tiny-label">RULES ON FINBERT LABELS</span>
      </div>
      <div className="panel-subtitle">
        Setups surfaced from real headlines and today’s move. Research aid, not advice.
      </div>
      <div className="inst-list">
        {!ready && <p className="inst-empty">Waiting for FinBERT to analyse the latest news…</p>}
        {ready && !signals.length && (
          <p className="inst-empty">No strong sentiment spike right now — no signal.</p>
        )}
        {signals.slice(0, 4).map((s) => (
          <div key={s.title} className="inst-signal">
            <span className={`inst-bias inst-bias-${s.bias.toLowerCase()}`}>{s.bias}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.why}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Peer comparison ---------------- */
export function PeerMatrixPanel({
  stock,
  assets,
  quoteFor,
  onSelect,
}: {
  stock: Stock;
  assets: Stock[];
  quoteFor: (yahoo: string) => Quote | undefined;
  onSelect: (yahoo: string) => void;
}) {
  const sameSector = assets.filter((a) => a.sector === stock.sector);
  const peers = (sameSector.length >= 2 ? sameSector : assets).slice(0, 5);
  if (!peers.some((p) => p.yahoo === stock.yahoo)) peers.splice(4, 1, stock);
  const news = useQuery({
    queryKey: ["peer-news", peers.map((p) => p.newsQuery)],
    queryFn: () => fetchPeerHeadlines({ data: { queries: peers.map((p) => p.newsQuery) } }),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const groups: Headline[][] = news.data ?? [];
  const flat = groups.flatMap((g, i) => g.map((h) => ({ h, i })));
  const fb = useFinbert(flat.map((x) => x.h.title));
  const rows = peers.map((p, i) => {
    const docs: NlpDoc[] = fb.results
      ? flat.flatMap((x, j) => {
          const r = fb.results?.[j];
          return x.i === i && r
            ? [{ title: x.h.title, source: x.h.source, kind: "News" as const, sentiment: r.label, confidence: r.confidence, modelled: true }]
            : [];
        })
      : [];
    const asp = aspectSentiment(docs);
    const score = docs.length
      ? Math.round((docs.reduce((a, d) => a + polarity(d.sentiment) * (d.confidence / 100), 0) / docs.length) * 100)
      : null;
    const pick = (name: string) => {
      const a = asp.find((x) => x.aspect.toLowerCase().includes(name));
      return a && a.mentions ? a.score : null;
    };
    return { p, score, earnings: pick("earn"), reg: pick("regul"), move: quoteFor(p.yahoo)?.changePct ?? null, n: docs.length };
  });
  rows.sort((a, b) => (b.score ?? -999) - (a.score ?? -999));
  return (
    <div className="panel inst-panel inst-wide">
      <div className="panel-heading">
        <h3>
          <Scale size={12} /> Peer comparison
        </h3>
        <span className="tiny-label">{sameSector.length >= 2 ? stock.sector.toUpperCase() : "TRACKED ASSETS"}</span>
      </div>
      <div className="panel-subtitle">
        Ranked by FinBERT sentiment on each company’s latest real headlines. Click a row to open it.
      </div>
      <div className="inst-table-wrap">
        <table className="inst-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th>Sentiment</th>
              <th>Earnings</th>
              <th>Regulatory</th>
              <th>Today</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.p.yahoo}
                className={r.p.yahoo === stock.yahoo ? "inst-current" : ""}
                onClick={() => onSelect(r.p.yahoo)}
              >
                <td>{r.score == null ? "—" : i + 1}</td>
                <td>
                  <b>{r.p.symbol}</b> <span>{r.p.name}</span>
                </td>
                <td className={tone(r.score)}>
                  {r.score == null
                    ? news.isError || fb.error
                      ? "Unavailable"
                      : news.isLoading || !fb.results
                        ? "Analysing…"
                        : "No news"
                    : `${r.score > 0 ? "+" : ""}${r.score}`}
                </td>
                <td className={tone(r.earnings)}>{r.earnings ?? "—"}</td>
                <td className={tone(r.reg)}>{r.reg ?? "—"}</td>
                <td className={tone(r.move)}>{pct(r.move)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Backtest overlay ---------------- */
export function BacktestPanel({
  stock,
  headlines,
  labels,
}: {
  stock: Stock;
  headlines: Headline[];
  labels: { label: Polarity; confidence: number }[] | null;
}) {
  const hist = useQuery({
    queryKey: ["price-history", stock.yahoo, "1M"],
    queryFn: () => fetchPriceHistory({ data: { symbol: stock.yahoo, period: "1M" } }),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const pts = hist.data ?? [];
  const W = 560;
  const H = 150;
  const t0 = pts[0]?.timestamp ?? 0;
  const t1 = pts.at(-1)?.timestamp ?? 1;
  const prices = pts.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (p: number) => H - ((p - lo) / Math.max(1e-9, hi - lo)) * (H - 10) - 5;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.timestamp).toFixed(1)},${y(p.price).toFixed(1)}`).join("");

  const events =
    labels && pts.length > 2
      ? headlines.flatMap((h, i) => {
          const l = labels[i];
          if (!l || l.label === "Neutral" || h.publishedAt < t0) return [];
          const idx = pts.findIndex((p) => p.timestamp >= h.publishedAt);
          const at = idx < 0 ? pts.length - 1 : idx;
          const before = pts[Math.max(0, at - 1)]?.price ?? 0;
          const after = pts[Math.min(pts.length - 1, at + 1)]?.price ?? before;
          const realised = idx >= 0 && at + 1 < pts.length;
          const hit = realised ? Math.sign(after - before) === polarity(l.label) : null;
          return [{ h, l, t: Math.max(h.publishedAt, t0), price: pts[at]?.price ?? 0, hit }];
        })
      : [];
  const scored = events.filter((e) => e.hit != null);
  const hits = scored.filter((e) => e.hit).length;
  return (
    <div className="panel inst-panel inst-wide">
      <div className="panel-heading">
        <h3>
          <Radar size={12} /> Sentiment vs price backtest
        </h3>
        <span className="tiny-label">
          {scored.length ? `HIT RATE ${Math.round((hits / scored.length) * 100)}% · ${scored.length} EVENTS` : "1 MONTH"}
        </span>
      </div>
      <div className="panel-subtitle">
        Real 1-month closes with each dated FinBERT-labelled headline. A hit means price moved the
        way the headline’s sentiment pointed over the next trading day. Small sample — indicative only.
      </div>
      {hist.isLoading ? (
        <div className="skeleton inst-chart-skel" />
      ) : hist.isError || pts.length < 3 ? (
        <p className="inst-empty">Price history unavailable for this asset.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="inst-chart" role="img" aria-label="Backtest chart">
          <path d={line} className="inst-line" />
          {events.map((e) => (
            <circle
              key={e.h.url + e.h.title}
              cx={x(e.t)}
              cy={y(e.price)}
              r={5}
              className={`inst-dot ${e.l.label === "Positive" ? "inst-dot-pos" : "inst-dot-neg"} ${e.hit === false ? "inst-dot-miss" : ""}`}
            >
              <title>{`${e.l.label} (${e.l.confidence}%): ${e.h.title}${e.hit == null ? " — outcome pending" : e.hit ? " — hit" : " — miss"}`}</title>
            </circle>
          ))}
        </svg>
      )}
      {!hist.isLoading && pts.length >= 3 && !events.length && (
        <p className="inst-empty">
          {labels ? "No positive/negative headlines fall inside this window yet." : "Waiting for FinBERT labels…"}
        </p>
      )}
    </div>
  );
}
