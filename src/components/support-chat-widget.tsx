// Bottom-right in-app support chat for signed-in users. Answers come from the
// same support agent as the Telegram group; billing and unsure answers are
// passed to the team, whose replies arrive here (with an unread dot).
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { getSupportChat, sendSupportChat, markSupportChatSeen, type SupportChatMsg } from "@/lib/support-chat.functions";

const QUICK = [
  "How do credits work?",
  "My generation failed",
  "Billing / payment issue",
  "I have a feature idea",
];

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SupportChatMsg | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const getFn = useServerFn(getSupportChat);
  const sendFn = useServerFn(sendSupportChat);
  const seenFn = useServerFn(markSupportChatSeen);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const q = useQuery({
    queryKey: ["support-chat"],
    queryFn: () => getFn(),
    refetchInterval: open ? 15_000 : 90_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
  const messages = q.data?.messages ?? [];
  const unread = q.data?.unread ?? 0;

  // Opening the panel (or a new team reply while open) marks replies as read.
  useEffect(() => {
    if (open && unread > 0) {
      void seenFn().then(() => qc.invalidateQueries({ queryKey: ["support-chat"] }));
    }
  }, [open, unread, seenFn, qc]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("cf:open-support-chat", onOpen);
    return () => window.removeEventListener("cf:open-support-chat", onOpen);
  }, []);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages.length, pending, sending]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  async function send(raw: string) {
    const body = raw.trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);
    setText("");
    setPending({ id: "pending", role: "user", text: body, created_at: new Date().toISOString(), seen_by_user: true });
    try {
      await sendFn({ data: { text: body, page: pathname } });
      await qc.invalidateQueries({ queryKey: ["support-chat"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send — please try again.");
      setText(body);
    } finally {
      setPending(null);
      setSending(false);
    }
  }

  const shown = pending ? [...messages, pending] : messages;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={unread ? `Open support chat (${unread} new ${unread === 1 ? "reply" : "replies"})` : "Open support chat"}
          className="fixed bottom-24 md:bottom-4 right-4 z-40 w-12 h-12 rounded-full gradient-primary text-white shadow-lg shadow-orange-500/20 flex items-center justify-center hover:scale-105 transition"
        >
          <MessageCircleQuestion className="w-6 h-6" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-[11px] font-semibold flex items-center justify-center ring-2 ring-background">
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Support chat"
          className="fixed z-50 inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100vh-2.5rem)] flex flex-col bg-background sm:rounded-2xl border border-border shadow-2xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 gradient-primary text-white">
            <MessageCircleQuestion className="w-5 h-5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">CreatorFlow support</div>
              <div className="text-[11px] opacity-90">Instant answers · the team follows up here when needed</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close support chat" className="p-1 rounded hover:bg-white/15">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2" aria-live="polite">
            {q.isLoading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-6 text-muted-foreground" />}
            {!q.isLoading && shown.length === 0 && (
              <div className="text-sm text-muted-foreground px-1 pt-2">
                Hi! Ask anything about CreatorFlow — credits, a failed generation, publishing, or your plan. I can see your account, so you don't need to explain which one.
              </div>
            )}
            {shown.map((m) => <Bubble key={m.id} m={m} />)}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
              </div>
            )}
          </div>

          {!sending && shown.length === 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {QUICK.map((qk) => (
                <button key={qk} onClick={() => void send(qk)} className="text-xs rounded-full border border-border px-2.5 py-1 hover:bg-white/5">
                  {qk}
                </button>
              ))}
            </div>
          )}

          {error && <div className="mx-3 mb-2 text-xs text-rose-300">{error}</div>}

          <form
            onSubmit={(e) => { e.preventDefault(); void send(text); }}
            className="border-t border-border/60 p-2 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
              rows={1}
              maxLength={2000}
              placeholder="Type your question…"
              aria-label="Your question"
              className="flex-1 resize-none max-h-32 bg-input/50 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60"
            />
            <button type="submit" disabled={sending || !text.trim()} aria-label="Send"
              className="h-9 w-9 shrink-0 rounded-xl gradient-primary text-white flex items-center justify-center disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ m }: { m: SupportChatMsg }) {
  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${mine ? "gradient-primary text-white rounded-br-md" : m.role === "admin" ? "bg-emerald-500/10 border border-emerald-500/25 rounded-bl-md" : "bg-white/[0.06] rounded-bl-md"}`}>
        {m.role === "admin" && <div className="text-[10px] uppercase tracking-wide text-emerald-300 mb-0.5">CreatorFlow team</div>}
        {m.text}
      </div>
    </div>
  );
}
