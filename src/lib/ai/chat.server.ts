import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";


const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

// Local-development fallbacks: free-tier keys from Groq or Google AI Studio,
// read from a local .env file. Both expose OpenAI-compatible endpoints.
type LocalProvider = { baseURL: string; apiKey: string; model: string };
function localProvider(): LocalProvider | null {
  const groq = process.env["GROQ_API_KEY"];
  if (groq)
    return { baseURL: "https://api.groq.com/openai/v1", apiKey: groq, model: "openai/gpt-oss-120b" };
  const gemini = process.env["GEMINI_API_KEY"];
  if (gemini)
    return {
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: gemini,
      model: "gemini-2.0-flash",
    };
  return null;
}

export async function handleChat(request: Request) {
  const local = localProvider();
  if (!local)
    return json(
      500,
      "Chat is not configured. Add GROQ_API_KEY or GEMINI_API_KEY to your .env file, then restart the dev server.",
    );


  let body: { messages?: UIMessage[]; context?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Invalid request.");
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  const last = messages.at(-1);
  if (!last || last.role !== "user") return json(400, "No question received.");
  const context = String(body.context ?? "").slice(0, 12000);

  const provider = createOpenAI({ baseURL: local.baseURL, apiKey: local.apiKey });
  const result = streamText({
    model: provider.chat(local.model),

    system: `You are Ask FinLytics, the analyst copilot inside the FinLytics AI stock sentiment dashboard (a university NLP project built around the FinBERT model).
Answer ONLY from the dashboard data snapshot below: real quotes, real headlines with their FinBERT labels and confidences, and rule-based aspect/emotion scores derived from those labels.
Rules:
- Never invent prices, headlines, times or numbers. If the data does not answer the question (e.g. intraday timing, or a stock that isn't loaded), say so plainly and suggest selecting that stock on the dashboard.
- Cite the specific headlines that drive your conclusion.
- Be concise: a short answer, then bullet points. Use markdown.
- This is research, not financial advice; mention that briefly only when the user asks what to buy or sell.

DASHBOARD SNAPSHOT:
${context || "(no data loaded yet)"}`,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
  });
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/402|credit/i.test(msg)) return "AI credits are exhausted. Please try again later.";
      if (/429|rate/i.test(msg)) return "Too many requests right now. Wait a moment and try again.";
      return "Ask FinLytics couldn't answer just now. Please try again.";
    },
  });
}

