import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFinbert } from "@/hooks/use-finbert";
import { SectionBoundary } from "@/components/section-boundary";
import { AskFinlytics } from "@/components/ask-finlytics";
import {
  AlphaSignalsPanel,
  BacktestPanel,
  PeerMatrixPanel,
} from "@/components/institutional-panels";
import { useAccount } from "@/components/account-provider";
import { fetchMarketFeed, fetchPriceHistory, searchAssets } from "@/lib/market-feed.functions";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Newspaper,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoodGauge, PriceChart, SentimentDonut } from "@/components/market-charts";
import {
  formatMoney,
  indexMeta,
  indexSymbols,
  stocks,
  type Stock,
  type Sentiment,
} from "@/lib/market-data";
import {
  AspectPanel,
  EmotionPanel,
  EntitiesPanel,
  NlpBadge,
  SummaryPanel,
  useNlpPipeline,
} from "@/components/nlp-panels";
import { matchesQuery, parseQuery, type NlpDoc } from "@/lib/nlp-engine";
import { formatVolume, useLiveTicker } from "@/hooks/use-live-ticker";
import {
  AlertsPanel,
  WatchlistPanel,
  type AlertRule,
  type WatchItem,
} from "@/components/dashboard-extras";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinLytics AI — Market Intelligence & FinBERT Sentiment" },
      {
        name: "description",
        content:
          "FinLytics AI brings Indian and US market quotes, financial news and FinBERT sentiment analysis into one focused workspace.",
      },
      { property: "og:title", content: "FinLytics AI — Market Intelligence & FinBERT Sentiment" },
      {
        property: "og:description",
        content: "Explore provider quotes, financial news and FinBERT sentiment for Indian and US markets with FinLytics AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Row = {
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment: Sentiment;
  label: string;
  confidence: number;
  kind: "News" | "Social";
};

function timeAgo(timestamp: number) {
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function Index() {
  const [selected, setSelected] = useState(0);
  const [extraAssets, setExtraAssets] = useState<Stock[]>([]);
  const assets: Stock[] = [...stocks, ...extraAssets];
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [searching, setSearching] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const account = useAccount();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<"1D" | "1W" | "1M" | "1Y">("1D");
  const [filter, setFilter] = useState<Sentiment | "All">("All");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const base = assets[selected] ?? stocks[0];

  // Live market feed: share prices, index levels and this company's latest headlines.
  const feed = useQuery({
    queryKey: [
      "market-feed",
      base.newsQuery,
      assets.map((a) => a.yahoo),
      account.profile?.watchlist,
    ],
    queryFn: () =>
      fetchMarketFeed({
        data: {
          symbols: [
            ...new Set([
              base.yahoo,
              ...(account.profile?.watchlist ?? []),
              ...assets.map((item) => item.yahoo),
            ]),
          ].slice(0, 16),
          indexSymbols: [...indexSymbols],
          newsQuery: base.newsQuery,
        },
      }),
    staleTime: 30_000,
    refetchInterval: streaming ? 30_000 : false,
    refetchOnWindowFocus: streaming,
    retry: 1,
  });
  const feedData = feed.data;

  const realQuote = feedData?.quotes.find((q) => q.symbol === base.yahoo);
  const tickBases = [...(feedData?.quotes ?? []), ...(feedData?.indexes ?? [])].map((q) => ({
    symbol: q.symbol,
    price: q.price,
    changePct: q.changePct,
    volume: q.volume,
  }));
  const ticks = useLiveTicker(tickBases, streaming);
  const baseTick = ticks[base.yahoo];
  const stock = {
    ...base,
    currency: realQuote?.currency ?? base.currency,
    price: realQuote?.price ?? null,
    change: realQuote?.changePct ?? null,
  };
  const history = useQuery({
    queryKey: ["price-history", base.yahoo, period],
    queryFn: () => fetchPriceHistory({ data: { symbol: base.yahoo, period } }),
    staleTime: 30_000,
    refetchInterval: streaming ? 60_000 : false,
    retry: 1,
  });
  const quoteTime = realQuote?.marketTime
    ? new Date(realQuote.marketTime).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "Unavailable";
  const staleQuote = Boolean(realQuote && Date.now() - realQuote.marketTime > 20 * 60_000);
  const updated = realQuote ? `Last trade ${quoteTime}` : "Quotes unavailable";
  const bullish = (stock.change ?? 0) > 0;

  const liveRows: Row[] = (feedData?.headlines ?? []).map((item) => ({
    title: item.title,
    source: item.source,
    time: timeAgo(item.publishedAt),
    url: item.url,
    sentiment: "Neutral" as Sentiment,
    label: "Not analysed",
    confidence: 0,
    kind: "News" as const,
  }));
  const shownArticles: Row[] = liveRows;
  const finbert = useFinbert(shownArticles.map((a) => a.title));
  const finbertResults = finbert.results;
  if (finbertResults)
    shownArticles.forEach((a, i) => {
      const r = finbertResults[i];
      if (r) {
        a.sentiment = r.label;
        a.confidence = r.confidence;
        a.label = r.label;
      }
    });
  const modelled = Boolean(
    finbertResults?.length && finbertResults.length === shownArticles.length,
  );
  const tally = shownArticles.reduce(
    (acc, a) => {
      acc[a.sentiment] += 1;
      return acc;
    },
    { Positive: 0, Neutral: 0, Negative: 0 } as Record<Sentiment, number>,
  );
  const analysed = shownArticles.length || 1;
  const pending = !modelled;
  const counts = {
    positive: modelled ? tally.Positive : 0,
    neutral: modelled ? tally.Neutral : 0,
    negative: modelled ? tally.Negative : 0,
    total: modelled ? shownArticles.length : 0,
  };
  const consensus = modelled ? Math.round((counts.positive / analysed) * 100) : 0;
  const mood = modelled
    ? Math.round(((counts.positive - counts.negative) / analysed + 1) * 50)
    : null;
  const sourceCount = new Set(shownArticles.map((a) => a.source)).size;
  const [nlq, setNlq] = useState("");
  const [nlqActive, setNlqActive] = useState("");
  const parsed = nlqActive ? parseQuery(nlqActive) : null;
  const docs: NlpDoc[] = shownArticles.map((a) => ({
    title: a.title,
    source: a.source,
    kind: a.kind,
    sentiment: a.sentiment,
    confidence: a.confidence,
    modelled,
  }));
  const nlp = useNlpPipeline(base.company, docs);
  const visibleArticles = shownArticles.filter(
    (article, i) =>
      (filter === "All" || (modelled && article.sentiment === filter)) &&
      (!parsed || matchesQuery(docs[i] as NlpDoc, parsed)),
  );
  const sectorMatch = (sector: string) =>
    !parsed || !parsed.sectors.length || parsed.sectors.includes(sector);
  function runQuery(event: React.FormEvent) {
    event.preventDefault();
    const q = nlq.trim();
    setNlqActive(q);
    if (!q) return;
    const p = parseQuery(q);
    const firstMatch = p.sectors.length
      ? assets.findIndex((s) => p.sectors.includes(s.sector))
      : -1;
    if (firstMatch >= 0 && !p.sectors.includes(base.sector)) setSelected(firstMatch);
    setNotice(`Query understood — ${p.explanation}.`);
  }
  const liveQuoteFor = (yahoo: string) => feedData?.quotes.find((q) => q.symbol === yahoo);
  const watch = account.profile?.watchlist ?? [];
  const rules = (account.profile?.alerts ?? {}) as Record<string, AlertRule>;
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(
      account.profile
        ? account.profile.theme === "dark"
        : localStorage.getItem("mp-theme") === "dark",
    );
  }, [account.profile?.theme, account.user?.id]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("mp-theme", next ? "dark" : "light");
    void account.save({ theme: next ? "dark" : "light" }).catch(() => {});
  }
  function saveWatch(next: string[]) {
    void account.save({ watchlist: next }).catch(() => {});
  }
  function saveRule(rule: AlertRule) {
    void account.save({ alerts: { ...rules, [rule.symbol]: rule } }).catch(() => {});
  }
  const watched = watch.includes(base.yahoo);
  const watchItems: WatchItem[] = watch.map((sym) => {
    const item = assets.find((s) => s.yahoo === sym);
    const q = liveQuoteFor(sym);
    return {
      symbol: sym,
      name: item?.name ?? sym,
      price: q?.price ?? null,
      change: q?.changePct ?? null,
      currency: q?.currency ?? item?.currency ?? "INR",
      mood: sym === base.yahoo ? mood : null,
    };
  });
  const loading = feed.isLoading;

  function selectStock(index: number) {
    setSelected(index);
    setQuery("");
    setNotice("");
    setFilter("All");
    setSearchResults([]);
  }
  function chooseAsset(asset: Stock) {
    const found = assets.findIndex((a) => a.yahoo === asset.yahoo);
    if (found >= 0) selectStock(found);
    else {
      setExtraAssets((prev) => [...prev, asset]);
      setSelected(assets.length);
      setSearchResults([]);
      setQuery("");
      setFilter("All");
    }
  }
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setNotice("Enter a ticker, company name or ETF.");
      return;
    }
    setSearching(true);
    setNotice("Searching markets…");
    try {
      const results = await searchAssets({ data: { query: term } });
      setSearchResults(results);
      const exact = results.find((a) => a.yahoo.toLowerCase() === term.toLowerCase());
      if (exact) {
        chooseAsset(exact);
        setNotice("");
      } else
        setNotice(
          results.length
            ? "Choose an asset from the search results."
            : "No matching assets found. Try its exchange ticker.",
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Search unavailable. Please retry.");
    } finally {
      setSearching(false);
    }
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const [result] = await Promise.all([feed.refetch(), history.refetch()]);
      finbert.refetch();
      setNotice(result.data?.error ?? "Quotes refreshed; analysing latest headlines.");
    } finally {
      setRefreshing(false);
    }
  }
  function exportReport() {
    const headline = shownArticles
      .map((a) => `${a.label} | ${a.confidence.toFixed(1)}% | ${a.title}`)
      .join("\n");
    const closing = "Provider quotes may be delayed. Sentiment is not investment advice.";
    const report = `FinLytics AI report (sentiment: FinBERT — ProsusAI/finbert)\n${stock.company} (${stock.symbol})\nPrice: ${stock.currency} ${stock.price?.toFixed(2) ?? "Unavailable"}\nChange: ${stock.change?.toFixed(2) ?? "—"}%\nBullish consensus: ${pending ? "Unavailable" : `${consensus}%`}\nMarket mood: ${mood ?? "Unavailable"}/100\n\n${headline}\n\n${closing}`;
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `FinLytics-AI-${stock.symbol}-report.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="FinLytics AI home">
          <img className="brand-mark" src="/finlytics-mark.svg" alt="" width={33} height={33} />
          <span className="brand-wordmark">FinLytics <span className="brand-ai">AI</span></span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <a href="#overview" className="nav-active">
            Overview
          </a>
          <a href="#intelligence">Market intelligence</a>
          <a href="#news">
            News feed <span className="nav-count">{shownArticles.length}</span>
          </a>
        </nav>
        <div className="header-right">
          <span className="exchange-label">
            <Globe2 size={14} /> India & US markets
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            onClick={toggleTheme}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <span className="header-divider" />
        </div>
      </header>
      <div className="market-strip">
        <div>
          <span className="market-dot" /> MARKET SNAPSHOT{" "}
          <span className="sample-label">PROVIDER QUOTES</span>
        </div>
        {indexSymbols.map((symbol) => {
          const q = feedData?.indexes.find((x) => x.symbol === symbol);
          const t = ticks[symbol];
          return (
            <div key={symbol}>
              <b>{indexMeta[symbol]?.label ?? symbol}</b>
              <span key={t?.n} className={`tick-flash ${t?.dir ?? ""}`}>
                {q
                  ? q.price.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </span>
              {q && (
                <span className={q.changePct >= 0 ? "positive-text" : "negative-text"}>
                  {q.changePct >= 0 ? "+" : ""}
                  {q.changePct.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
        <span className="strip-end">May be delayed</span>
      </div>
      <main id="overview" className="workspace">
        <div className="breadcrumb">
          <LayoutDashboard size={13} /> Workspace <ChevronRight size={12} />
          <span>Market overview</span>
        </div>
        <section className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> YOUR EDGE IN THE MARKET
            </div>
            <h1>
              Indian market intelligence<span className="brand-period">.</span>
            </h1>
            <p>Less noise. More signal. A clearer view of what moves your stocks.</p>
          </div>
          <div className="intro-tag">
            <Sparkles size={15} />
            <span>Powered by FinBERT</span>
            <span className="beta-label">AI</span>
          </div>
        </section>
        <form className="search-bar" onSubmit={analyze}>
          <Search size={19} />
          <input
            aria-label="Search company or NSE symbol"
            placeholder="Search a company or symbol, e.g. RELIANCE.NS or AAPL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="search-market">Global markets</span>
          <Button type="submit" disabled={searching} className="analysis-button">
            {searching ? "Searching…" : "Run analysis"} <ArrowRight size={16} />
          </Button>
        </form>
        <form className="search-bar nlq-bar" onSubmit={runQuery}>
          <Sparkles size={17} />
          <input
            aria-label="Ask in plain English"
            placeholder='Ask in plain English, e.g. "Show me tech stocks with rising sentiment around earnings"'
            value={nlq}
            onChange={(e) => setNlq(e.target.value)}
          />
          {nlqActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNlq("");
                setNlqActive("");
                setNotice("");
              }}
            >
              Clear
            </Button>
          )}
          <Button type="submit" variant="outline" className="analysis-button">
            Semantic search
          </Button>
        </form>
        <div className="notice" aria-live="polite">
          {notice || feedData?.error}
        </div>
        <div className="asset-results">
          {searchResults.map((a) => (
            <Button variant="outline" key={a.yahoo} onClick={() => chooseAsset(a)}>
              <b>{a.yahoo}</b>
              <span>{a.name}</span>
            </Button>
          ))}
        </div>
        <div className="benchmark-label">
          BENCHMARK ASSETS <span>India · US · Crypto</span>
        </div>
        <div className="stock-selector">
          {assets.map((item, index) => (
            <Button
              key={item.symbol}
              variant="ghost"
              className={`stock-option ${selected === index ? "selected" : ""} ${sectorMatch(item.sector) ? "" : "dimmed"}`}
              aria-pressed={selected === index}
              onClick={() => selectStock(index)}
            >
              <span className={`stock-monogram stock-color-${index % 6}`}>{item.monogram}</span>
              <span className="stock-option-text">
                <b>{item.name}</b>
                <span>
                  {item.symbol} ·{" "}
                  {(() => {
                    const q = liveQuoteFor(item.yahoo);
                    const ch = q?.changePct;
                    return (
                      <span
                        className={ch == null ? "" : ch >= 0 ? "positive-text" : "negative-text"}
                      >
                        {ch == null ? "—" : `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`}
                      </span>
                    );
                  })()}
                </span>
              </span>
              {selected === index && <Check className="stock-check" size={15} />}
            </Button>
          ))}
        </div>
        <section className="company-heading">
          <div className="company-title">
            <h2>{stock.company}</h2>
            <span className="ticker-badge">{stock.symbol}</span>
            <span className="company-sector">{stock.sector}</span>
          </div>
          <div className="update-tools">
            <span>
              <span
                className={`market-dot ${streaming && realQuote?.session === "Open" ? "pulsing" : ""}`}
              />{" "}
              {streaming ? "Auto-refresh" : "Paused"} ·{" "}
              {realQuote?.session === "Closed"
                ? "Market closed"
                : realQuote?.session === "Open"
                  ? "Market open"
                  : staleQuote
                    ? "Last available quote"
                    : "Session unavailable"}{" "}
              · {updated}
            </span>
            <Button
              variant="ghost"
              size="icon"
              title={streaming ? "Pause auto-refresh" : "Resume auto-refresh"}
              aria-label={streaming ? "Pause auto-refresh" : "Resume auto-refresh"}
              aria-pressed={streaming}
              onClick={() => setStreaming((v) => !v)}
            >
              {streaming ? <Pause /> : <Play />}
            </Button>
            <span hidden></span>
            <Button
              variant="ghost"
              size="icon"
              title="Refresh analysis"
              aria-label="Refresh analysis"
              onClick={refresh}
            >
              <RefreshCw className={refreshing ? "spin" : ""} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={watched ? "Remove from watchlist" : "Add to watchlist"}
              aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
              aria-pressed={watched}
              onClick={() =>
                saveWatch(watched ? watch.filter((s) => s !== base.yahoo) : [...watch, base.yahoo])
              }
            >
              <Star className={watched ? "star-on" : ""} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download size={14} /> Export
            </Button>
          </div>
        </section>
        <section
          className={`metrics-grid ${loading ? "is-loading" : ""}`}
          aria-label="Stock analysis metrics"
        >
          <div className="metric-card">
            <div className="metric-label">
              Share price{" "}
              <span className="metric-icon">
                <TrendingUp size={15} />
              </span>
            </div>
            <div className="metric-value">
              <span key={baseTick?.n} className={`tick-flash ${baseTick?.dir ?? ""}`}>
                {formatMoney(stock.price, stock.currency)}
              </span>
              <span className="currency">{stock.currency}</span>
            </div>
            <div className={`metric-detail ${bullish ? "positive-text" : "negative-text"}`}>
              {bullish ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
              {bullish ? "+" : ""}
              {stock.change?.toFixed(2) ?? "—"}%{" "}
              <span>
                vs. previous close
                {realQuote?.volume != null ? ` · Vol ${formatVolume(realQuote.volume)}` : ""}
              </span>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              Bullish consensus{" "}
              <span className="metric-icon">
                <Activity size={15} />
              </span>
            </div>
            <div className="metric-value">
              {pending ? "—" : consensus}
              <span className="metric-percent">%</span>
              <span className="mini-bars">
                {Array.from({ length: 12 }, (_, i) => (
                  <i key={i} className={i < Math.round((consensus / 100) * 12) ? "filled" : ""} />
                ))}
              </span>
            </div>
            <div className="metric-detail">
              <span className="positive-text">
                {counts.positive} of {counts.total}
              </span>
              <span>{pending ? "headlines not yet analysed" : "headlines are positive"}</span>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              News volume{" "}
              <span className="metric-icon">
                <Newspaper size={15} />
              </span>
            </div>
            <div className="metric-value">
              {shownArticles.length}
              <span className="volume-label">articles</span>
            </div>
            <div className="metric-detail">
              <span className="coverage-dots">
                <i />
                <i />
                <i />
              </span>
              <span>Across {sourceCount} trusted sources</span>
            </div>
          </div>
          <div className="metric-card verdict-card">
            <div className="metric-label">
              AI verdict{" "}
              <span className="metric-icon">
                <Sparkles size={15} />
              </span>
            </div>
            <div
              className={`verdict ${pending || mood === 50 ? "" : (mood ?? 50) < 50 ? "negative" : "positive"}`}
            >
              {pending || mood === 50 ? (
                <Sparkles size={21} />
              ) : (mood ?? 50) < 50 ? (
                <ArrowDownRight size={21} />
              ) : (
                <ArrowUpRight size={21} />
              )}{" "}
              {pending
                ? finbert.error
                  ? "Unavailable"
                  : shownArticles.length
                    ? "Analysing"
                    : "No news"
                : (mood ?? 50) < 50
                  ? "Bearish"
                  : (mood ?? 50) > 50
                    ? "Bullish"
                    : "Neutral"}
              <span>{pending ? "" : "signal"}</span>
            </div>
            <div className="metric-detail">
              <ShieldCheck size={13} />
              <span>
                {pending
                  ? (finbert.error ?? finbert.status)
                  : "Based on FinBERT headline sentiment"}
              </span>
              {finbert.error && (
                <Button variant="ghost" size="sm" onClick={finbert.refetch}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </section>
        <section id="intelligence" className="intelligence-grid">
          <div className="panel price-panel">
            <div className="panel-heading">
              <h3>Price overview</h3>
              <div className="period-selector">
                {(["1D", "1W", "1M", "1Y"] as const).map((item) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    key={item}
                    className={period === item ? "period-selected" : ""}
                    aria-pressed={period === item}
                    onClick={() => setPeriod(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
            <div className="price-subtitle">
              {period} history<span className="chart-demo">ACTUAL PROVIDER DATA</span>
            </div>
            <SectionBoundary name="Price chart">
              <PriceChart
                points={history.data ?? []}
                currency={stock.currency}
                loading={history.isLoading}
              />
            </SectionBoundary>
          </div>
          <div className="panel mood-panel">
            <div className="panel-heading">
              <h3>Market mood</h3>
              <CircleHelp size={14} className="help-icon">
                <title>Aggregated sentiment score from 0 to 100</title>
              </CircleHelp>
            </div>
            <div className="panel-subtitle">The sentiment behind the headlines</div>
            <MoodGauge value={mood} />
            <div className="gauge-bottom">
              <span>Bearish</span>
              <span>Neutral</span>
              <span>Bullish</span>
            </div>
          </div>
          <div className="panel distribution-panel">
            <div className="panel-heading">
              <h3>Sentiment distribution</h3>
              <span className="tiny-label">{counts.total} HEADLINES</span>
            </div>
            <div className="panel-subtitle">A complete picture of market opinion</div>
            <SentimentDonut counts={counts} />
            <div className="distribution-bottom">
              <Zap size={12} />
              <span>
                {pending ? (finbert.error ?? finbert.status) : "FinBERT natural language analysis"}
              </span>
            </div>
          </div>
        </section>
        <section className="extras-grid">
          <WatchlistPanel
            items={watchItems}
            onSelect={(sym) => {
              const i = assets.findIndex((s) => s.yahoo === sym);
              if (i >= 0) selectStock(i);
              else {
                void searchAssets({ data: { query: sym } })
                  .then((rows) => {
                    const a = rows.find((r) => r.yahoo === sym);
                    if (a) chooseAsset(a);
                    else setNotice("Saved asset unavailable.");
                  })
                  .catch(() => setNotice("Asset search unavailable."));
              }
            }}
            onRemove={(sym) => saveWatch(watch.filter((s) => s !== sym))}
          />
          <SectionBoundary name="Alerts">
            <AlertsPanel items={watchItems} rules={rules} onChange={saveRule} />
          </SectionBoundary>
        </section>
        <div className="benchmark-label nlp-heading">
          NLP INTELLIGENCE <span>Aspects · entities · summary · emotion</span>
          <NlpBadge />
        </div>
        <section className="nlp-grid">
          <SectionBoundary name="Summary">
            <SummaryPanel data={nlp.data} docs={docs} />
          </SectionBoundary>
          <SectionBoundary name="Aspect analysis">
            <AspectPanel data={nlp.data} />
          </SectionBoundary>
          <SectionBoundary name="Entities">
            <EntitiesPanel data={nlp.data} />
          </SectionBoundary>
          <SectionBoundary name="Emotion">
            <EmotionPanel data={nlp.data} />
          </SectionBoundary>
        </section>
        <div className="benchmark-label nlp-heading">
          INSTITUTIONAL <span>Alpha signals · peer matrix · backtest</span>
        </div>
        <section className="inst-grid">
          <SectionBoundary name="Alpha signals">
            <AlphaSignalsPanel stock={base} docs={docs} quote={realQuote} />
          </SectionBoundary>
          <SectionBoundary name="Backtest">
            <BacktestPanel
              stock={base}
              headlines={feedData?.headlines ?? []}
              labels={modelled ? finbertResults : null}
            />
          </SectionBoundary>
          <SectionBoundary name="Peer comparison">
            <PeerMatrixPanel
              stock={base}
              assets={assets}
              quoteFor={liveQuoteFor}
              onSelect={(sym) => {
                const i = assets.findIndex((s) => s.yahoo === sym);
                if (i >= 0) selectStock(i);
              }}
            />
          </SectionBoundary>
        </section>
        <section id="news" className="news-section">
          <div className="news-heading">
            <div>
              <h2>
                Behind the sentiment<span className="article-count">{shownArticles.length}</span>
              </h2>
              <p>Financial headlines, decoded.</p>
            </div>
            <div className="filter-controls" aria-label="Filter news by sentiment">
              {(["All", "Positive", "Neutral", "Negative"] as const).map((item) => (
                <Button
                  variant="ghost"
                  size="sm"
                  key={item}
                  className={filter === item ? "filter-active" : ""}
                  aria-pressed={filter === item}
                  onClick={() => setFilter(item)}
                >
                  {item !== "All" && <span className={`legend-dot ${item.toLowerCase()}`} />}{" "}
                  {item === "All" ? "All headlines" : item}
                </Button>
              ))}
            </div>
          </div>
          <div className={`news-table-wrap ${loading ? "is-loading" : ""}`}>
            <table className="news-table">
              <thead>
                <tr>
                  <th>HEADLINE & SOURCE</th>
                  <th>SENTIMENT</th>
                  <th>AI CONFIDENCE</th>
                  <th title="Absolute FinBERT positive-minus-negative probability, not predicted price impact">
                    POLARITY STRENGTH
                  </th>
                  <th aria-label="Open article" />
                </tr>
              </thead>
              <tbody>
                {visibleArticles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-hint">
                      No headlines match this query.
                    </td>
                  </tr>
                )}
                {visibleArticles.map((article, i) => (
                  <tr key={article.kind + article.title}>
                    <td>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="article-link"
                      >
                        <span className={`source-icon source-${i % 3}`}>
                          {article.kind === "Social" ? (
                            <AudioLines size={16} />
                          ) : (
                            <Newspaper size={16} />
                          )}
                        </span>
                        <span>
                          <strong>{article.title}</strong>
                          <span className="article-meta">
                            {article.kind} · {article.source}
                            <i /> {article.time}
                          </span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <span className={`sentiment-badge ${article.sentiment.toLowerCase()}`}>
                        <span />
                        {article.label}
                      </span>
                    </td>
                    <td>
                      <div className="confidence">
                        <span>
                          {article.confidence ? article.confidence.toFixed(1) : "—"}
                          <span>{article.confidence ? "%" : ""}</span>
                        </span>
                        <progress
                          value={article.confidence}
                          max="100"
                          aria-label={`${article.confidence}% confidence`}
                        />
                      </div>
                    </td>
                    <td>
                      <span className="impact-score">
                        {article.confidence
                          ? Math.round(
                              Math.abs(
                                (finbertResults?.find((r) => r.text === article.title)?.scores
                                  .Positive ?? 0) -
                                  (finbertResults?.find((r) => r.text === article.title)?.scores
                                    .Negative ?? 0),
                              ) * 100,
                            )
                          : "—"}
                      </span>
                    </td>
                    <td>
                      <a
                        className="external-link"
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Read ${article.title}`}
                      >
                        <ExternalLink size={15} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="news-bottom">
            <span>
              <ShieldCheck size={13} />{" "}
              {modelled
                ? "AI sentiment is not investment advice."
                : (finbert.error ?? finbert.status)}
            </span>
            <span>
              Showing {visibleArticles.length} of {shownArticles.length} provider headlines
            </span>
          </div>
        </section>
        <footer className="page-footer">
          <span className="footer-brand">
            <img src="/finlytics-mark.svg" alt="" width={20} height={20} /> FinLytics AI
          </span>
          <span>Built for a clearer market perspective.</span>
          <span>Provider quotes may be delayed · No simulated prices</span>
        </footer>
      </main>
      <AskFinlytics
        brandMark="/finlytics-mark.svg"
        context={JSON.stringify({
          selected: {
            name: base.company,
            symbol: base.symbol,
            sector: base.sector,
            price: realQuote?.price ?? null,
            currency: stock.currency,
            changePctToday: realQuote?.changePct ?? null,
            marketSession: realQuote?.session ?? "Unknown",
            lastTrade: quoteTime,
          },
          finbertStatus: modelled ? "complete" : finbert.status,
          headlines: (feedData?.headlines ?? []).map((h, i) => ({
            title: h.title,
            source: h.source,
            published: new Date(h.publishedAt).toISOString(),
            finbert: modelled ? shownArticles[i]?.sentiment : "pending",
            confidence: modelled ? shownArticles[i]?.confidence : null,
          })),
          moodScore0to100: mood,
          aspectsRuleBased: nlp.data?.aspects,
          emotionsRuleBased: nlp.data?.emotions,
          fearGreed: nlp.data?.fearGreed,
          otherTrackedQuotes: (feedData?.quotes ?? []).map((q) => ({
            symbol: q.symbol,
            price: q.price,
            changePct: q.changePct,
          })),
        })}
      />
    </div>
  );
}
