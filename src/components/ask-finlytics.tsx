import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquareText, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

const SUGGESTIONS = [
  "Why is sentiment positive or negative for this stock?",
  "Which headline is driving the mood?",
  "Summarise the regulatory risk.",
];

export function AskFinlytics({ context, brandMark }: { context: string; brandMark: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ask-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Ask FinLytics" : "Open Ask FinLytics"}
      >
        {open ? <X size={18} /> : <MessageSquareText size={18} />}
        <span>Ask FinLytics</span>
      </button>
      {open && (
        <div className="ask-window" role="dialog" aria-label="Ask FinLytics">
          <div className="ask-header">
            <img src={brandMark} alt="" width={22} height={22} />
            <div>
              <b>Ask FinLytics</b>
              <span>Answers from this dashboard’s live data</span>
            </div>
            <button type="button" className="ask-icon" onClick={() => setOpen(false)} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <ChatBody context={context} brandMark={brandMark} />
        </div>
      )}
    </>
  );
}

function ChatBody({
  context,
  brandMark,
}: {
  context: string;
  brandMark: string;
}) {
  const contextRef = useRef(context);
  contextRef.current = context;
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: "ask-finlytics",
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ context: contextRef.current }),
    }),
    onError: (e) => {
      let msg = e.message;
      try {
        msg = (JSON.parse(e.message) as { error?: string }).error ?? msg;
      } catch {
        /* plain text */
      }
      toast.error(msg || "Ask FinLytics is unavailable right now.");
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput("");
  };
  function clear() {
    stop();
    setMessages([]);
  }
  const lastIsUser = messages.at(-1)?.role === "user";

  return (
    <>
      <Conversation className="ask-conversation">
        <ConversationContent>
          {!messages.length ? (
            <ConversationEmptyState
              icon={<img src={brandMark} alt="" width={36} height={36} />}
              title="Ask about the stock on screen"
              description="I read the same real prices, headlines and FinBERT labels you see."
            >
              <div className="ask-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent className={m.role === "user" ? "ask-user" : "ask-bot"}>
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (
                      <MessageResponse key={i}>{p.text}</MessageResponse>
                    ) : p.type === "reasoning" && p.text ? (
                      <div key={i} className="ask-reasoning">
                        {p.text}
                      </div>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {busy && lastIsUser && <Shimmer className="ask-thinking">Analysing the data…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="ask-composer">
        <PromptInput onSubmit={(msg) => send(msg.text ?? "")}>
          <PromptInputTextarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="e.g. Why did sentiment turn negative?"
          />
          <PromptInputFooter className="justify-between">
            <button type="button" className="ask-clear" onClick={() => void clear()} disabled={!messages.length}>
              <RotateCcw size={12} /> New chat
            </button>
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
