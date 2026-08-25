import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Eraser, Send, Sparkles, X } from "lucide-react";
import { sendAiChat, type ChatTurn } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatMessage extends ChatTurn {
  id: number;
}

const GREETING: Omit<ChatMessage, "id"> = {
  role: "assistant",
  content:
    "Hi! I'm your EnergyScope solar assistant. Ask me about your plant's generation, weather impact or the dashboard.",
};

/** Number of recent turns sent to the backend for conversational context. */
const HISTORY_WINDOW = 10;

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, ...GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    const userMessage: ChatMessage = { id: nextId.current++, role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const history: ChatTurn[] = [...messages, userMessage]
        .slice(-HISTORY_WINDOW - 1, -1)
        .map(({ role, content }) => ({ role, content }));
      const reply = await sendAiChat(text, history);
      setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function resetConversation() {
    setMessages([{ id: nextId.current++, ...GREETING }]);
    setError(null);
  }

  return (
    <div className="fixed bottom-5 right-4 z-50 sm:right-6 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            aria-label="EnergyScope AI assistant"
            className={cn(
              "fixed flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl",
              "inset-x-3 top-20 bottom-24", // mobile: near full screen
              "sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[540px] sm:w-[380px]",
            )}
          >
            <header className="flex items-center gap-2 border-b border-border/60 bg-surface-2/60 px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-4" aria-hidden />
              </span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold leading-tight">Solar Assistant</h2>
                <p className="text-xs text-muted-foreground">Making your solar data smarter</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={resetConversation}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <Eraser className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setOpen(false)}
                title="Close chat"
                aria-label="Close chat"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2.5">
                    {[0, 1, 2].map((dot) => (
                      <motion.span
                        key={dot}
                        className="size-1.5 rounded-full bg-muted-foreground/70"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: dot * 0.18,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="mx-4 mb-2 flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="shrink-0 underline underline-offset-2"
                  aria-label="Dismiss error"
                >
                  dismiss
                </button>
              </div>
            )}

            <div className="border-t border-border/60 p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your solar plant..."
                  rows={1}
                  disabled={loading}
                  className="max-h-28 min-h-[40px] resize-none"
                  aria-label="Message"
                />
                <Button
                  size="icon"
                  className="size-10 shrink-0"
                  onClick={() => void handleSend()}
                  disabled={loading || !input.trim()}
                  title="Send (Enter)"
                  aria-label="Send message"
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "ml-auto flex size-12 items-center justify-center rounded-full shadow-lg transition-colors",
          open ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
        )}
        title={open ? "Close AI assistant" : "Open AI assistant"}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
      >
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      </motion.button>
    </div>
  );
}
