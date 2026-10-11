import { useEffect, useRef, useState } from "react";
import type { FinbertResult } from "@/lib/finbert.functions";

export function useFinbert(headlines: string[]) {
  const [state, setState] = useState<{
    key: string;
    results: FinbertResult[] | null;
    status: string;
    error?: string;
  }>({ key: "", results: null, status: "Waiting for news" });
  const [retry, setRetry] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const key = JSON.stringify(headlines);
  useEffect(() => {
    if (!headlines.length) return;
    const worker =
      workerRef.current ??
      new Worker(new URL("../lib/finbert.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const id = Date.now();
    setState({ key, results: null, status: "Loading FinBERT" });
    const onMessage = (event: MessageEvent) => {
      if (event.data.id !== id) return;
      if (event.data.results)
        setState({ key, results: event.data.results, status: "FinBERT ready" });
      else if (event.data.error)
        setState({ key, results: null, status: "Unavailable", error: event.data.error });
      else
        setState((s) => ({
          ...s,
          status: `${event.data.status}${event.data.progress != null ? ` · ${event.data.progress}%` : ""}`,
        }));
    };
    const onError = () =>
      setState({
        key,
        results: null,
        status: "Unavailable",
        error: "FinBERT could not start. Retry analysis.",
      });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, headlines: JSON.parse(key) });
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
  }, [key, retry]);
  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );
  return {
    results: state.key === key ? state.results : null,
    status: headlines.length ? state.status : "No news to analyse",
    error: state.key === key ? state.error : undefined,
    refetch: () => setRetry((r) => r + 1),
  };
}
