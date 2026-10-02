import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../context/AppState";

type Message = { role: "assistant" | "user"; text: string };
type MessageBlock = { type: "paragraph" | "unordered" | "ordered"; lines: string[] };

function renderInlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : part,
  );
}

function AssistantMessage({ text }: { text: string }) {
  const blocks: MessageBlock[] = [];
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const unordered = line.match(/^[-*•]\s+(.*)$/);
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    const type = unordered ? "unordered" : ordered ? "ordered" : "paragraph";
    const content = unordered?.[1] || ordered?.[1] || line;
    const previous = blocks[blocks.length - 1];
    if (previous?.type === type) previous.lines.push(content);
    else blocks.push({ type, lines: [content] });
  }

  return <div className="space-y-1">
    {blocks.map((block, index) => {
      if (block.type === "unordered") {
        return <ul key={index} className="list-disc space-y-1 pl-5 marker:text-orange-300">
          {block.lines.map((line, itemIndex) => <li key={itemIndex} className="pl-1">{renderInlineText(line)}</li>)}
        </ul>;
      }
      if (block.type === "ordered") {
        return <ol key={index} className="list-decimal space-y-1 pl-5 marker:text-orange-300">
          {block.lines.map((line, itemIndex) => <li key={itemIndex} className="pl-1">{renderInlineText(line)}</li>)}
        </ol>;
      }
      return <p key={index}>{renderInlineText(block.lines.join(" "))}</p>;
    })}
  </div>;
}

type FestFundAIProps = {
  festivalId?: string;
  festivalName?: string;
  role?: "ADMIN" | "COMMITTEE" | "VISITOR";
  publicVisitor?: boolean;
};

const quickPrompts = [
  "💰 Current Balance",
  "📊 Analyze Finances",
  "📅 Upcoming Events",
  "👥 Donor Summary",
  "🔮 Forecast Funds",
  "📄 Festival Summary",
  "🏪 Nearby Vendors",
];

export function FestFundAI({ festivalId, festivalName, role, publicVisitor = false }: FestFundAIProps) {
  const { user } = useAuth();
  const effectiveRole = role || user?.role || "VISITOR";
  const effectiveFestId = festivalId || user?.festId || "";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const greeting = useMemo(() => {
    const name = user?.name || (effectiveRole === "VISITOR" ? "Festival Visitor" : "there");
    if (publicVisitor || effectiveRole === "VISITOR") {
      return `Welcome to ${festivalName || "this festival"}! 👋 I'm your FestFund AI assistant. What would you like to know about this festival?`;
    }
    return `Hello ${name}! 👋 I'm FestFund AI. You're currently managing ${festivalName || effectiveFestId || "your festival"}. How can I help?`;
  }, [effectiveFestId, effectiveRole, festivalName, publicVisitor, user?.name]);

  const send = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    if (!effectiveFestId) {
      setMessages((current) => [...current, { role: "assistant", text: "Choose a festival first so FestFund AI can answer using the correct context." }]);
      return;
    }

    setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: "" }]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post(publicVisitor ? "/ai/public/chat" : "/ai/chat", { message: text, festId: effectiveFestId });
      const answer = response.data?.data?.answer || "I’m not able to answer that right now.";
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          last.text = answer;
        }
        return next;
      });
    } catch (error) {
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          last.text = "FestFund AI is temporarily unavailable. Your FestFund dashboard is still working normally.";
        }
        return next;
      });
      console.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePrompt = (prompt: string) => {
    void send(prompt);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setMessages((current) => current.length ? current : [{ role: "assistant", text: greeting }]);
        }}
        className="fixed bottom-5 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/50 bg-gradient-to-br from-[#FF8A00] via-[#FF6B00] to-[#E65100] text-2xl text-white shadow-[0_0_35px_rgba(255,117,24,0.65)] transition hover:scale-105 hover:shadow-[0_0_45px_rgba(255,117,24,0.85)]"
        aria-label="Ask FestFund AI"
      >
        <Bot className="h-7 w-7" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="fixed bottom-24 right-5 z-50 flex w-[min(92vw,390px)] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#180f0a]/95 text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#FF8A00]/15 to-[#FFB300]/10 px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="h-4 w-4 text-amber-300" /> FestFund AI
                </p>
                {(festivalName || effectiveFestId) && <p className="text-xs text-white/70">{festivalName || effectiveFestId}</p>}
                {effectiveFestId && <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{effectiveFestId}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-white/70 hover:bg-white/5" aria-label="Close chat">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/10 bg-[#1f120d]/80 px-3 py-3">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePrompt(prompt)}
                  className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1.5 text-[11px] text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-500/20"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
              {(messages.length ? messages : [{ role: "assistant", text: greeting }]).map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === "user" ? "bg-gradient-to-r from-[#FF8A00] to-[#E65100] text-white" : "bg-white/5 text-white/85"}`}>
                    {message.role === "assistant" ? (
                      <AssistantMessage text={message.text || (loading ? "● ● ●" : "")} />
                    ) : message.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/70">
                    <span>●</span>
                    <span className="animate-pulse"> ● ●</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-[#120d0a] p-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder={effectiveFestId ? "Ask anything about this festival..." : "Choose a festival first"}
                  className="flex-1 bg-transparent px-2 py-1 text-sm text-white placeholder:text-white/40 focus:outline-none"
                  aria-label="Message FestFund AI"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8A00] to-[#E65100] text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
