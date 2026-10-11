import { createServerFn } from "@tanstack/react-start";

/**
 * FinBERT (ProsusAI/finbert) — a BERT model fine-tuned on the Financial
 * PhraseBank for financial sentiment classification (positive / neutral / negative).
 *
 * NLP pipeline per headline:
 *   1. Text normalisation (whitespace cleanup, length cap)
 *   2. WordPiece tokenisation + BERT encoding (done by the FinBERT model)
 *   3. Softmax over 3 sentiment classes -> label + confidence
 *
 * Runs on the server through the Hugging Face Inference API.
 * Requires the HF_TOKEN environment variable (free token from huggingface.co).
 */
export type FinbertLabel = "Positive" | "Neutral" | "Negative";
export type FinbertResult = {
  text: string;
  label: FinbertLabel;
  confidence: number;
  scores: Record<FinbertLabel, number>;
};

const MODEL_URL = "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert";

function preprocess(text: string) {
  return text.replace(/\s+/g, " ").replace(/[“”]/g, '"').trim().slice(0, 512);
}

function capitalise(label: string): FinbertLabel {
  const l = label.toLowerCase();
  return l === "positive" ? "Positive" : l === "negative" ? "Negative" : "Neutral";
}

export const analyzeHeadlines = createServerFn({ method: "POST" })
  .inputValidator((input: { headlines: string[] }) => {
    if (!Array.isArray(input?.headlines)) throw new Error("headlines must be an array");
    return { headlines: input.headlines.slice(0, 30).map((h) => preprocess(String(h))) };
  })
  .handler(
    async ({
      data,
    }): Promise<{ model: string; results: FinbertResult[] | null; error?: string }> => {
      const token = process.env["HF_TOKEN"];
      if (!token)
        return { model: "ProsusAI/finbert", results: null, error: "HF_TOKEN not configured" };
      try {
        const res = await fetch(MODEL_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: data.headlines, parameters: { top_k: 3 } }),
        });
        if (!res.ok)
          return {
            model: "ProsusAI/finbert",
            results: null,
            error: `FinBERT API ${res.status}: ${await res.text()}`,
          };
        const raw = (await res.json()) as
          { label: string; score: number }[][] | { label: string; score: number }[];
        const rows = (Array.isArray(raw[0]) ? raw : [raw]) as { label: string; score: number }[][];
        const results = rows.map((preds, i) => {
          const scores = { Positive: 0, Neutral: 0, Negative: 0 } as Record<FinbertLabel, number>;
          for (const p of preds) scores[capitalise(p.label)] = p.score;
          const label = (Object.keys(scores) as FinbertLabel[]).reduce((a, b) =>
            scores[a] >= scores[b] ? a : b,
          );
          return {
            text: data.headlines[i] ?? "",
            label,
            confidence: Math.round(scores[label] * 1000) / 10,
            scores,
          };
        });
        return { model: "ProsusAI/finbert", results };
      } catch (e) {
        return {
          model: "ProsusAI/finbert",
          results: null,
          error: e instanceof Error ? e.message : "FinBERT request failed",
        };
      }
    },
  );
