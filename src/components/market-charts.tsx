import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/market-data";
import type { PricePoint } from "@/lib/market-feed.functions";
export type SentimentCounts = {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
};
export function PriceChart({
  points,
  currency,
  loading,
}: {
  points: PricePoint[];
  currency: string;
  loading: boolean;
}) {
  if (!points.length)
    return (
      <div className="chart-empty">
        {loading ? "Loading market history…" : "Price history unavailable"}
      </div>
    );
  return (
    <div className="price-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
            }
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            orientation="right"
            domain={["auto", "auto"]}
            width={65}
            tickFormatter={(v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [formatMoney(Number(v), currency), "Price"]}
            contentStyle={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              borderRadius: 6,
              fontSize: 11,
            }}
          />
          <Area
            dataKey="price"
            type="linear"
            stroke="var(--primary)"
            fill="var(--primary-soft)"
            strokeWidth={1.8}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoodGauge({ value }: { value: number | null }) {
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 280 158" role="img" aria-label={`Market mood index ${value} out of 100`}>
        <path d="M 30 130 A 110 110 0 0 1 85 35" className="gauge-negative" />
        <path d="M 85 35 A 110 110 0 0 1 195 35" className="gauge-neutral" />
        <path d="M 195 35 A 110 110 0 0 1 250 130" className="gauge-positive" />
        <path
          d="M 30 130 A 110 110 0 0 1 250 130"
          className="gauge-progress"
          pathLength="100"
          strokeDasharray={`${value ?? 0} 100`}
        />
        <text x="140" y="115" className="gauge-value" textAnchor="middle">
          {value ?? "—"}
        </text>
        <text x="24" y="153" className="chart-axis">
          0
        </text>
        <text x="134" y="13" className="chart-axis">
          50
        </text>
        <text x="238" y="153" className="chart-axis">
          100
        </text>
      </svg>
      <span
        className={`mood-label ${value == null ? "" : value < 50 ? "negative-text" : value > 50 ? "positive-text" : ""}`}
      >
        {value == null
          ? "Analysis unavailable"
          : value < 50
            ? "Bearish sentiment"
            : value > 50
              ? "Bullish sentiment"
              : "Neutral sentiment"}
      </span>
    </div>
  );
}

export function SentimentDonut({ counts }: { counts: SentimentCounts }) {
  const total = counts.total || 1;
  const values = [counts.negative, counts.neutral, counts.positive];
  let offset = 0;
  return (
    <div className="distribution-content">
      <div className="donut-wrap">
        <svg viewBox="0 0 160 160" role="img" aria-label="Sentiment distribution">
          <circle cx="80" cy="80" r="62" className="donut-track" />
          {values.map((value, i) => {
            const start = offset;
            const length = (value / total) * 100;
            offset += length;
            return (
              <circle
                key={i}
                cx="80"
                cy="80"
                r="62"
                pathLength="100"
                strokeDasharray={`${Math.max(0, length - 1.8)} ${100 - Math.max(0, length - 1.8)}`}
                strokeDashoffset={-start}
                className={`donut-segment donut-${i}`}
              />
            );
          })}
          <text x="80" y="78" textAnchor="middle" className="donut-value">
            {counts.total}
          </text>
          <text x="80" y="98" textAnchor="middle" className="chart-axis">
            headlines
          </text>
        </svg>
      </div>
      <div className="donut-legend">
        {[
          ["Positive", counts.positive, "positive"],
          ["Neutral", counts.neutral, "neutral"],
          ["Negative", counts.negative, "negative"],
        ].map(([label, count, kind]) => (
          <div key={label}>
            <span className={`legend-dot ${kind}`} />
            <span>{label}</span>
            <strong>{((Number(count) / total) * 100).toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
