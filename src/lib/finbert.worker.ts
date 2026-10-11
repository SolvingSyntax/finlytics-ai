import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
let classifier: Awaited<ReturnType<typeof pipeline<"text-classification">>> | undefined;
self.onmessage = async (event: MessageEvent<{ id: number; headlines: string[] }>) => {
  const { id, headlines } = event.data;
  try {
    classifier ??= await pipeline("text-classification", "Xenova/finbert", {
      dtype: "q8",
      device: "wasm",
      progress_callback: (progress: { status: string; progress?: number }) => {
        if (progress.status === "progress")
          self.postMessage({
            id,
            status: "Downloading FinBERT",
            progress: Math.round(progress.progress ?? 0),
          });
      },
    });
    self.postMessage({ id, status: "Analysing headlines" });
    const raw = await classifier(headlines, { top_k: 3, truncation: true });
    const rows = raw as unknown as { label: string; score: number }[][];
    const results = rows.map((predictions, index) => {
      const scores = { Positive: 0, Neutral: 0, Negative: 0 };
      for (const p of predictions) {
        const label =
          p.label.toLowerCase() === "positive"
            ? "Positive"
            : p.label.toLowerCase() === "negative"
              ? "Negative"
              : "Neutral";
        scores[label] = p.score;
      }
      const label = (Object.keys(scores) as (keyof typeof scores)[]).reduce((a, b) =>
        scores[a] >= scores[b] ? a : b,
      );
      return {
        text: headlines[index] ?? "",
        label,
        confidence: Math.round(scores[label] * 1000) / 10,
        scores,
      };
    });
    self.postMessage({ id, results });
  } catch {
    self.postMessage({
      id,
      error: "FinBERT could not load. Check your connection and retry analysis.",
    });
  }
};
