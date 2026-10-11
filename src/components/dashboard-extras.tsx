import { Bell, BellRing, Star, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/market-data";

export function SentimentTrendChart({
  data,
  currency,
}: {
  data: { day: string; price: number; sentiment: number }[];
  currency: string;
}) {
  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
            width={58}
            tickFormatter={(v) => formatMoney(Number(v), currency).replace(/\.\d+$/, "")}
          />
          <YAxis
            yAxisId="sent"
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={26}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--foreground)",
            }}
            formatter={(v, name) =>
              name === "Price" ? formatMoney(Number(v), currency) : `${v}/100`
            }
          />
          <Line
            yAxisId="price"
            name="Price"
            type="monotone"
            dataKey="price"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="sent"
            name="Sentiment"
            type="monotone"
            dataKey="sentiment"
            stroke="var(--positive)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type WatchItem = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  currency: string;
  mood: number | null;
};
export type AlertRule = { symbol: string; below: number; above: number; enabled: boolean };

export function WatchlistPanel({
  items,
  onSelect,
  onRemove,
}: {
  items: WatchItem[];
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  return (
    <div className="panel extras-panel">
      <div className="panel-heading">
        <h3>Watchlist</h3>
        <span className="tiny-label">{items.length} SAVED</span>
      </div>
      <div className="panel-subtitle">Tap the star next to a company to save it</div>
      <div className="watch-list">
        {items.length === 0 ? (
          <div className="empty-hint">
            <Star size={16} /> No stocks saved yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.symbol} className="watch-row">
              <Button variant="ghost" className="watch-name" onClick={() => onSelect(item.symbol)}>
                <b>{item.name}</b>
                <span>{item.symbol}</span>
              </Button>
              <span className="watch-price">
                {formatMoney(item.price, item.currency)}
                <span className={(item.change ?? 0) >= 0 ? "positive-text" : "negative-text"}>
                  {(item.change ?? 0) >= 0 ? "+" : ""}
                  {item.change == null ? "—" : item.change.toFixed(2)}%
                </span>
              </span>
              <span
                className={`sentiment-badge ${(item.mood ?? 50) >= 60 ? "positive" : (item.mood ?? 50) < 45 ? "negative" : "neutral"}`}
              >
                <span />
                {item.mood ?? "—"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemove(item.symbol)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AlertsPanel({
  items,
  rules,
  onChange,
}: {
  items: WatchItem[];
  rules: Record<string, AlertRule>;
  onChange: (rule: AlertRule) => void;
}) {
  return (
    <div className="panel extras-panel">
      <div className="panel-heading">
        <h3>Sentiment alerts</h3>
        <Bell size={14} className="help-icon" />
      </div>
      <div className="panel-subtitle">Get flagged when mood crosses your limits (0–100)</div>
      <div className="watch-list">
        {items.length === 0 ? (
          <div className="empty-hint">
            <Bell size={16} /> Add stocks to your watchlist to set alerts.
          </div>
        ) : (
          items.map((item) => {
            const rule = rules[item.symbol] ?? {
              symbol: item.symbol,
              below: 40,
              above: 70,
              enabled: false,
            };
            const fired =
              rule.enabled &&
              item.mood != null &&
              (item.mood <= rule.below || item.mood >= rule.above);
            return (
              <div key={item.symbol} className={`alert-row ${fired ? "alert-fired" : ""}`}>
                <label className="alert-toggle">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
                  />
                  <b>{item.symbol}</b>
                </label>
                <label className="alert-field">
                  Below
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.below}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        below: Math.min(rule.above - 1, Math.max(0, Number(e.target.value))),
                      })
                    }
                  />
                </label>
                <label className="alert-field">
                  Above
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.above}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        above: Math.max(rule.below + 1, Math.min(100, Number(e.target.value))),
                      })
                    }
                  />
                </label>
                <span className={`alert-state ${fired ? "negative-text" : ""}`}>
                  {fired ? (
                    <>
                      <BellRing size={12} /> Triggered ({item.mood})
                    </>
                  ) : rule.enabled ? (
                    item.mood == null ? (
                      "Awaiting analysis"
                    ) : (
                      "Watching"
                    )
                  ) : (
                    "Off"
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
