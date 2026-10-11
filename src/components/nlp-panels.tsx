import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Flame, Sparkles, Tags } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  aspectSentiment,
  classifyEmotion,
  emotionMix,
  executiveSummary,
  extractEntities,
  fearGreed,
  highlightTokens,
  trendingTopics,
  type NlpDoc,
} from "@/lib/nlp-engine";

/** Mock transformer endpoint hook: resolves like a Hugging Face pipeline response after a short latency. */
export function useNlpPipeline(company: string, docs: NlpDoc[]) {
  return useQuery({
    queryKey: ["nlp-pipeline", company, docs.map((d) => `${d.title}|${d.sentiment}|${d.modelled}`)],
    queryFn: async () => {
      const aspects = aspectSentiment(docs);
      const fg = fearGreed(docs);
      return {
        model: "FinBERT + rule-based aspects, entities and emotion",
        aspects,
        entities: extractEntities(docs),
        topics: trendingTopics(docs),
        emotions: emotionMix(docs),
        fearGreed: fg,
        summary: executiveSummary(company, docs, aspects, fg.score),
      };
    },
    enabled: docs.length > 0 && docs.every((d) => d.modelled),
    staleTime: 5 * 60_000,
  });
}
export type NlpResult = NonNullable<ReturnType<typeof useNlpPipeline>["data"]>;

const Skel = ({ lines = 4 }: { lines?: number }) => (
  <div className="nlp-skeleton">
    {Array.from({ length: lines }, (_, i) => (
      <i key={i} style={{ width: `${90 - i * 12}%` }} />
    ))}
  </div>
);

export function AspectPanel({ data }: { data: NlpResult | undefined }) {
  const radar =
    data?.aspects.map((a) => ({
      aspect: a.aspect.split(" ")[0],
      value: a.mentions ? a.score + 100 : null,
    })) ?? [];
  return (
    <div className="panel nlp-panel">
      <div className="panel-heading">
        <h3>Aspect-based sentiment</h3>
        <span className="tiny-label">ABSA</span>
      </div>
      <div className="panel-subtitle">Keyword-grouped FinBERT sentiment (−100 to +100)</div>
      {!data ? (
        <div className="empty-hint">Awaiting verified FinBERT results.</div>
      ) : (
        <div className="absa-body">
          <div className="absa-radar">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="70%">
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis
                  dataKey="aspect"
                  tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                />
                <PolarRadiusAxis domain={[0, 200]} tick={false} axisLine={false} />
                <Radar
                  dataKey="value"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="absa-bars">
            {data.aspects.map((a) => (
              <div key={a.aspect} className="absa-row">
                <span>{a.aspect}</span>
                <div className="absa-track">
                  <i
                    className={a.score >= 0 ? "pos" : "neg"}
                    style={{
                      width: `${Math.abs(a.score) / 2}%`,
                      [a.score >= 0 ? "left" : "right"]: "50%",
                    }}
                  />
                </div>
                <b className={a.score > 0 ? "positive-text" : a.score < 0 ? "negative-text" : ""}>
                  {a.mentions ? `${a.score > 0 ? "+" : ""}${a.score}` : "—"}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EntitiesPanel({ data }: { data: NlpResult | undefined }) {
  const max = Math.max(1, ...(data?.topics.map((t) => t.weight) ?? [1]));
  return (
    <div className="panel nlp-panel">
      <div className="panel-heading">
        <h3>Entities & topics</h3>
        <Tags size={14} className="help-icon" />
      </div>
      <div className="panel-subtitle">Rule-based entity extraction and topic frequency</div>
      {!data ? (
        <div className="empty-hint">No analysed headlines available.</div>
      ) : (
        <>
          <div className="entity-list">
            {data.entities.length ? (
              data.entities.map((e) => (
                <span key={e.name} className={`entity-chip entity-${e.type.toLowerCase()}`}>
                  <b>{e.name}</b>
                  {e.type} · {e.count}
                </span>
              ))
            ) : (
              <span className="empty-hint">No entities detected.</span>
            )}
          </div>
          <div className="topic-cloud">
            {data.topics.map((t) => (
              <span
                key={t.topic}
                style={{
                  fontSize: `${9 + (t.weight / max) * 8}px`,
                  opacity: 0.55 + (t.weight / max) * 0.45,
                }}
              >
                {t.topic}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SummaryPanel({ data, docs }: { data: NlpResult | undefined; docs: NlpDoc[] }) {
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="panel nlp-panel summary-panel">
      <div className="panel-heading">
        <h3>AI executive synthesis</h3>
        <Button
          size="sm"
          variant="ghost"
          className="nlp-toggle"
          aria-pressed={showSource}
          onClick={() => setShowSource((s) => !s)}
        >
          {showSource ? "Show summary" : "Show source text"}
        </Button>
      </div>
      <div className="panel-subtitle">Extractive synthesis of analysed headlines</div>
      {!data ? (
        <div className="empty-hint">No analysed headlines available.</div>
      ) : !showSource ? (
        <ul className="summary-list">
          {data.summary.map((b, i) => (
            <li key={i}>
              <Sparkles size={11} />
              {b}
            </li>
          ))}
        </ul>
      ) : (
        <div className="source-list">
          {docs.map((d) => (
            <div key={d.kind + d.title} className="source-row">
              <p>
                {highlightTokens(d.title).map((t, i) => (
                  <span key={i} className={t.tone ? `tok-${t.tone}` : ""}>
                    {t.text}
                  </span>
                ))}
              </p>
              <span className={`sentiment-badge ${d.sentiment.toLowerCase()}`}>
                <span />
                {d.modelled ? d.sentiment : "Awaiting"}
              </span>
              <b>{d.modelled ? `${d.confidence.toFixed(1)}%` : "—"}</b>
              <em>{classifyEmotion(d.title)}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmotionPanel({ data }: { data: NlpResult | undefined }) {
  const fg = data?.fearGreed;
  const label = !fg
    ? ""
    : fg.score <= 25
      ? "Extreme fear"
      : fg.score <= 45
        ? "Fear"
        : fg.score < 55
          ? "Neutral"
          : fg.score < 75
            ? "Greed"
            : "Extreme greed";
  return (
    <div className="panel nlp-panel">
      <div className="panel-heading">
        <h3>Emotion & panic meter</h3>
        <Flame size={14} className="help-icon" />
      </div>
      <div className="panel-subtitle">Rule-based headline tone, aggression and urgency</div>
      {!data || !fg ? (
        <div className="empty-hint">No analysed headlines available.</div>
      ) : (
        <>
          <div className="fg-meter">
            <div className="fg-track">
              <i style={{ left: `${fg.score}%` }} />
            </div>
            <div className="fg-labels">
              <span>Panic</span>
              <b className={fg.score < 45 ? "negative-text" : fg.score > 55 ? "positive-text" : ""}>
                {fg.score} · {label}
              </b>
              <span>Greed</span>
            </div>
            <div className="fg-sub">
              <span>Aggression {fg.aggression}%</span>
              <span>Urgency {fg.urgency}%</span>
            </div>
          </div>
          <div className="emotion-bars">
            {data.emotions.map((e) => (
              <div key={e.emotion} className="absa-row">
                <span>{e.emotion}</span>
                <div className="absa-track emo">
                  <i
                    className={`emo-${e.emotion.toLowerCase().replace(/[^a-z]/g, "")}`}
                    style={{ width: `${e.share}%`, left: 0 }}
                  />
                </div>
                <b>{e.share}%</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const NlpBadge = () => (
  <span className="tiny-label nlp-badge">
    <Brain size={10} /> NLP PIPELINE
  </span>
);
