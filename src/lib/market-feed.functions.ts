import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Stock } from "./market-data";

export type Quote = {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
  currency: string;
  marketTime: number;
  volume: number | null;
  session: "Open" | "Closed" | "Unknown";
};
export type Headline = { title: string; source: string; publishedAt: number; url: string };
export type MarketFeed = {
  live: boolean;
  error?: string | undefined;
  fetchedAt: number;
  quotes: Quote[];
  indexes: Quote[];
  headlines: Headline[];
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HEADLINE_LIMIT = 8;

async function quoteFor(symbol: string): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`quote ${symbol}: HTTP ${res.status}`);
  const body = (await res.json()) as { chart?: { result?: { meta?: Record<string, unknown> }[] } };
  const meta = body.chart?.result?.[0]?.meta;
  const price = Number(meta?.["regularMarketPrice"]);
  const previousClose = Number(meta?.["chartPreviousClose"] ?? meta?.["previousClose"]);
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0)
    throw new Error(`quote ${symbol}: empty`);
  const period = (
    meta?.["currentTradingPeriod"] as { regular?: { start?: number; end?: number } } | undefined
  )?.regular;
  const now = Date.now() / 1000;
  const session =
    period?.start && period.end
      ? now >= period.start && now < period.end
        ? "Open"
        : "Closed"
      : "Unknown";
  return {
    symbol,
    session,
    price,
    previousClose,
    changePct: Math.round(((price - previousClose) / previousClose) * 10000) / 100,
    currency: String(meta?.["currency"] ?? "INR"),
    marketTime: Number(meta?.["regularMarketTime"] ?? 0) * 1000,
    volume: typeof meta?.["regularMarketVolume"] === "number" ? meta["regularMarketVolume"] : null,
  };
}

async function quotesFor(symbols: string[]): Promise<Quote[]> {
  const settled = await Promise.allSettled(symbols.map(quoteFor));
  return settled
    .filter((r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled")
    .map((r) => r.value);
}

function decodeEntities(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCharCode(Number(digits)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function directUrl(link: string): string {
  try {
    const wrapped = new URL(link);
    const target = wrapped.searchParams.get("url");
    if (target && /^https?:\/\//i.test(target)) return target;
  } catch {
    /* keep original */
  }
  return link;
}

async function headlinesFor(query: string): Promise<Headline[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=en-IN&mkt=en-IN`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`headlines: HTTP ${res.status}`);
  const xml = await res.text();
  const seen = new Set<string>();
  const items: Headline[] = [];
  for (const block of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag: string) => {
      const found = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block[1] ?? "");
      return found ? decodeEntities(found[1] ?? "") : "";
    };
    const title = pick("title");
    const link = pick("link");
    const publisher = pick("source");
    const publishedAt = Date.parse(pick("pubDate"));
    if (!title || !link || !Number.isFinite(publishedAt)) continue;
    const suffix = ` - ${publisher}`;
    const clean =
      publisher && title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    items.push({
      title: clean,
      source: publisher || "Bing News",
      publishedAt,
      url: directUrl(link),
    });
    if (items.length >= HEADLINE_LIMIT) break;
  }
  return items;
}

export const fetchMarketFeed = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        symbols: z.array(z.string().min(1).max(40)).max(16),
        indexSymbols: z.array(z.string().min(1).max(40)).max(6),
        newsQuery: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MarketFeed> => {
    const [q, i, n] = await Promise.allSettled([
      quotesFor(data.symbols),
      quotesFor(data.indexSymbols),
      headlinesFor(data.newsQuery),
    ]);
    const quotes = q.status === "fulfilled" ? q.value : [];
    const indexes = i.status === "fulfilled" ? i.value : [];
    const headlines = n.status === "fulfilled" ? n.value : [];
    return {
      live: quotes.length > 0,
      error: !quotes.length
        ? "Quotes unavailable. Please retry."
        : n.status === "rejected"
          ? "News feed unavailable."
          : undefined,
      fetchedAt: Date.now(),
      quotes,
      indexes,
      headlines,
    };
  });

export type PricePoint = { timestamp: number; price: number };
export const fetchPriceHistory = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ symbol: z.string().min(1).max(40), period: z.enum(["1D", "1W", "1M", "1Y"]) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PricePoint[]> => {
    const range = { "1D": "1d", "1W": "5d", "1M": "1mo", "1Y": "1y" }[data.period];
    const interval = { "1D": "5m", "1W": "30m", "1M": "1d", "1Y": "1d" }[data.period];
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(data.symbol)}?range=${range}&interval=${interval}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) throw new Error("Price history unavailable");
    const body = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const row = body.chart?.result?.[0];
    return (row?.timestamp ?? []).flatMap((t, i) => {
      const p = row?.indicators?.quote?.[0]?.close?.[i];
      return p != null && Number.isFinite(p) ? [{ timestamp: t * 1000, price: p }] : [];
    });
  });

export const searchAssets = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ query: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }): Promise<Stock[]> => {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(data.query)}&quotesCount=12&newsCount=0`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) throw new Error("Asset search is temporarily unavailable. Try again.");
    const body = (await res.json()) as {
      quotes?: {
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        exchange?: string;
      }[];
    };
    return (body.quotes ?? []).flatMap((q) => {
      if (!q.symbol || !["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX"].includes(q.quoteType ?? ""))
        return [];
      const name = q.longname ?? q.shortname ?? q.symbol;
      return [
        {
          name,
          company: name,
          symbol: q.symbol,
          monogram: name.charAt(0),
          yahoo: q.symbol,
          newsQuery: `${name} stock news`,
          sector: q.quoteType ?? "Equity",
          currency: /\.(NS|BO)$/.test(q.symbol) ? "INR" : "USD",
        },
      ];
    });
  });

/** Latest real headlines for several peer companies (used by the peer matrix). */
export const fetchPeerHeadlines = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ queries: z.array(z.string().min(1).max(120)).min(1).max(6) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Headline[][]> => {
    const rows = await Promise.allSettled(data.queries.map((q) => headlinesFor(q)));
    return rows.map((r) => (r.status === "fulfilled" ? r.value.slice(0, 4) : []));
  });
