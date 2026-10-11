import { useEffect, useRef, useState } from "react";
export type Tick = {
  price: number;
  change: number;
  dir: "up" | "down" | "";
  volume: number | null;
  n: number;
};
export type TickBase = { symbol: string; price: number; changePct: number; volume: number | null };
/** Animate only genuine quote changes. Never invent price or volume ticks. */
export function useLiveTicker(bases: TickBase[], _playing: boolean) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const ref = useRef(bases);
  ref.current = bases;
  const key = JSON.stringify(bases);
  useEffect(() => {
    setTicks((prev) =>
      Object.fromEntries(
        ref.current.map((b) => {
          const old = prev[b.symbol];
          const changed = Boolean(old && old.price !== b.price);
          return [
            b.symbol,
            {
              price: b.price,
              change: b.changePct,
              volume: b.volume,
              dir: changed && old ? (b.price > old.price ? "up" : "down") : "",
              n: (old?.n ?? 0) + (changed ? 1 : 0),
            },
          ];
        }),
      ),
    );
  }, [key]);
  return ticks;
}
export const formatVolume = (v: number) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(v);
