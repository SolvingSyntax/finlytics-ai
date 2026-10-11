export type Sentiment = "Positive" | "Neutral" | "Negative";

export const stocks = [
  {
    name: "Reliance",
    company: "Reliance Industries Ltd",
    symbol: "RELIANCE",
    monogram: "R",
    yahoo: "RELIANCE.NS",
    newsQuery: "Reliance Industries share price",
    sector: "Energy & Retail",
    currency: "INR",
  },
  {
    name: "TCS",
    company: "Tata Consultancy Services",
    symbol: "TCS",
    monogram: "T",
    yahoo: "TCS.NS",
    newsQuery: "Tata Consultancy Services share price",
    sector: "Information Technology",
    currency: "INR",
  },
  {
    name: "Infosys",
    company: "Infosys Limited",
    symbol: "INFY",
    monogram: "I",
    yahoo: "INFY.NS",
    newsQuery: "Infosys share price",
    sector: "Information Technology",
    currency: "INR",
  },
  {
    name: "Tata Motors",
    company: "Tata Motors Limited",
    symbol: "TATAMOTORS",
    monogram: "T",
    yahoo: "TMCV.NS",
    newsQuery: "Tata Motors share price",
    sector: "Automotive",
    currency: "INR",
  },
  {
    name: "HDFC Bank",
    company: "HDFC Bank Limited",
    symbol: "HDFCBANK",
    monogram: "H",
    yahoo: "HDFCBANK.NS",
    newsQuery: "HDFC Bank share price",
    sector: "Banking & Finance",
    currency: "INR",
  },
  {
    name: "SBI",
    company: "State Bank of India",
    symbol: "SBIN",
    monogram: "S",
    yahoo: "SBIN.NS",
    newsQuery: "State Bank of India share price",
    sector: "Banking & Finance",
    currency: "INR",
  },
  {
    name: "Apple",
    company: "Apple Inc.",
    symbol: "AAPL",
    monogram: "A",
    yahoo: "AAPL",
    newsQuery: "Apple stock AAPL",
    sector: "Consumer Technology",
    currency: "USD",
  },
  {
    name: "Tesla",
    company: "Tesla, Inc.",
    symbol: "TSLA",
    monogram: "T",
    yahoo: "TSLA",
    newsQuery: "Tesla stock TSLA",
    sector: "Electric Vehicles",
    currency: "USD",
  },
  {
    name: "NVIDIA",
    company: "NVIDIA Corporation",
    symbol: "NVDA",
    monogram: "N",
    yahoo: "NVDA",
    newsQuery: "Nvidia stock NVDA",
    sector: "Semiconductors",
    currency: "USD",
  },
  {
    name: "Bitcoin",
    company: "Bitcoin",
    symbol: "BTC",
    monogram: "B",
    yahoo: "BTC-USD",
    newsQuery: "Bitcoin price",
    sector: "Cryptocurrency",
    currency: "USD",
  },
  {
    name: "S&P 500 ETF",
    company: "SPDR S&P 500 ETF Trust",
    symbol: "SPY",
    monogram: "S",
    yahoo: "SPY",
    newsQuery: "S&P 500 stock market today",
    sector: "US Index Fund",
    currency: "USD",
  },
] as const;
export type Stock = {
  name: string;
  company: string;
  symbol: string;
  monogram: string;
  yahoo: string;
  newsQuery: string;
  sector: string;
  currency: string;
};

export const indexSymbols = ["^NSEI", "^BSESN", "^NSEBANK"] as const;
export const indexMeta: Record<string, { label: string }> = {
  "^NSEI": { label: "NIFTY 50" },
  "^BSESN": { label: "SENSEX" },
  "^NSEBANK": { label: "BANK NIFTY" },
};

export function formatMoney(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
