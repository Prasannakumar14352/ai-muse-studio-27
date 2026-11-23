import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess } from "@/lib/access";
import {
  getAgentHq, saveAgentSettings, updateAgentTask, sendTaskReply, runAgentNow, createTelegramLinkCode,
  type AgentTask, type TelegramMsg, type AgentRun, type InAppChatMsg,
} from "@/lib/agent-hq.functions";
import { MarketingPanel } from "@/components/agent-marketing-panel";
import {
  Megaphone, Bot, CheckCircle2, Inbox, Loader2, MessageCircle, MessagesSquare, Play, Send, Settings2, XCircle, ClipboardList, History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/agents")({
  head: () => ({ meta: [{ title: "Agent HQ — CreatorFlow AI" }] }),
  component: AgentHqPage,
});

const AGENT_LABEL: Record<string, string> = {
  support: "Support (Telegram)", product_manager: "Product manager", qa: "QA health check", ops: "Ops & finance",
  social_media_manager: "Social media manager", post_creator: "Post creator", app_promoter: "App promoter",
};
const COLUMNS: Array<{ id: string; label: string }> = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

function AgentHqPage() {
  const { data: access, isLoading } = useAccess();
  const getFn = useServerFn(getAgentHq);
  const q = useQuery({ queryKey: ["agent-hq"], queryFn: () => getFn(), enabled: Boolean(access?.isAdmin), refetchInterval: 20_000 });
  const [tab, setTab] = useState<"inbox" | "marketing" | "board" | "telegram" | "inapp" | "runs" | "settings">("inbox");

  if (isLoading) return <div className="p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!access?.isAdmin) return <Navigate to="/dashboard" replace />;
  const d = q.data;
  const isMarketing = (t: AgentTask) => t.kind === "social_post" || t.kind === "promo";
  const waiting = (d?.tasks ?? []).filter((t) => t.status === "waiting_approval" && !isMarketing(t));
  const marketingWaiting = (d?.tasks ?? []).filter((t) => t.status === "waiting_approval" && isMarketing(t)).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2"><Bot className="w-7 h-7 text-[color:var(--brand-orange)]" /> Agent HQ</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your AI team: Telegram support, daily QA and ops checks, the weekly product plan, and marketing (social posts + promotion). Anything about money, and every post, waits for you.</p>
        </div>
        {d && (
          <div className="text-xs text-muted-foreground text-right">
            AI spend this month: <span className="text-foreground font-semibold">${d.spentUsd.toFixed(2)}</span> of ${d.settings.monthlyBudgetUsd.toFixed(2)}
            <div className="w-48 h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden ml-auto">
              <div className="h-full gradient-primary" style={{ width: `${Math.min(100, (d.spentUsd / Math.max(0.01, d.settings.monthlyBudgetUsd)) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {d && !d.settings.hasBotToken && (
        <div className="glass rounded-2xl p-4 border border-amber-500/40 text-sm">
          Telegram support isn't connected yet. Open <button className="underline" onClick={() => setTab("settings")}>Settings</button> to add your bot.
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {([
          ["inbox", `Approval inbox${waiting.length ? ` (${waiting.length})` : ""}`, Inbox],
          ["marketing", `Marketing${marketingWaiting ? ` (${marketingWaiting})` : ""}`, Megaphone],
          ["board", "Task board", ClipboardList],
          ["telegram", "Telegram log", MessageCircle],
          ["inapp", "In-app chats", MessagesSquare],
          ["runs", "Agent runs", History],
          ["settings", "Settings", Settings2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-sm border inline-flex items-center gap-1.5 ${tab === id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {q.isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {d && tab === "inbox" && <ApprovalInbox tasks={waiting} />}
      {d && tab === "marketing" && <MarketingPanel tasks={d.tasks} />}
      {d && tab === "board" && <TaskBoard tasks={d.tasks.filter((t) => t.status !== "waiting_approval" && t.status !== "rejected" && !isMarketing(t))} />}
      {d && tab === "telegram" && <TelegramLog messages={d.messages} />}
      {d && tab === "inapp" && <InAppChats messages={d.inAppChats} />}
      {d && tab === "runs" && <RunsLog runs={d.runs} />}
      {d && tab === "settings" && <SettingsPanel s={d.settings} />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["agent-hq"] });
}

function ApprovalInbox({ tasks }: { tasks: AgentTask[] }) {
  if (!tasks.length) return <Empty text="Nothing waiting for you. Billing questions and anything the agent isn't sure about will appear here." />;
  return <div className="space-y-3">{tasks.map((t) => <ApprovalCard key={t.id} t={t} />)}</div>;
}

function ApprovalCard({ t }: { t: AgentTask }) {
  const refresh = useRefresh();
  const send = useServerFn(sendTaskReply);
  const update = useServerFn(updateAgentTask);
  const [text, setText] = useState(t.draft_reply ?? "");
  const [busy, setBusy] = useState(false);
  const ref = t.source_ref as { from?: string };
  return (
    <div className="glass rounded-2xl p-4 border border-border space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <KindBadge kind={t.kind} />
        <span className="text-muted-foreground">{ref.from ? `from ${ref.from} · ` : ""}{new Date(t.created_at).toLocaleString()}</span>
      </div>
      <div className="font-semibold">{t.title}</div>
      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{t.body}</div>
      {(t.source === "telegram" || t.source === "in_app") && (
        <>
          <label className="text-xs text-muted-foreground block">{t.source === "in_app" ? "Reply to send in their in-app chat" : "Reply to post in the group"}</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            className="w-full text-sm bg-black/30 border border-border rounded-lg p-3 focus:outline-none focus:border-orange-500/60" />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {(t.source === "telegram" || t.source === "in_app") && (
          <button disabled={busy || !text.trim()} onClick={async () => {
            setBusy(true);
            try { await send({ data: { id: t.id, text, markDone: t.kind !== "bug" && t.kind !== "feature" } }); toast.success(t.source === "in_app" ? "Reply sent to their chat" : "Reply posted in Telegram"); refresh(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
            finally { setBusy(false); }
          }} className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve &amp; send
          </button>
        )}
        <button onClick={async () => { await update({ data: { id: t.id, status: "todo" } }); refresh(); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm">Move to task board</button>
        <button onClick={async () => { await update({ data: { id: t.id, status: "rejected" } }); refresh(); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Dismiss</button>
      </div>
    </div>
  );
}

function TaskBoard({ tasks }: { tasks: AgentTask[] }) {
  const refresh = useRefresh();
  const update = useServerFn(updateAgentTask);
  const send = useServerFn(sendTaskReply);
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {COLUMNS.map((c) => {
        const items = tasks.filter((t) => t.status === c.id).slice(0, 60);
        return (
          <div key={c.id} className="glass rounded-2xl p-3 border border-border">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{c.label} · {items.length}</div>
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {items.map((t) => (
                <details key={t.id} className="rounded-xl border border-border bg-black/20 p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center gap-1.5 text-[11px] mb-1">
                      <KindBadge kind={t.kind} />
                      {t.priority === 1 && <span className="text-rose-300">urgent</span>}
                      <span className="text-muted-foreground ml-auto">{t.source === "in_app" ? "In-app chat" : AGENT_LABEL[t.agent] ?? t.agent}</span>
                    </div>
                    <div className="text-sm font-medium">{t.title}</div>
                  </summary>
                  <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.id !== "in_progress" && c.id !== "done" && (
                      <button onClick={async () => { await update({ data: { id: t.id, status: "in_progress" } }); refresh(); }} className="text-[11px] rounded glass border border-border px-2 py-1">Start</button>
                    )}
                    {c.id !== "done" && (
                      <button onClick={async () => { await update({ data: { id: t.id, status: "done" } }); refresh(); }} className="text-[11px] rounded glass border border-border px-2 py-1">Mark done</button>
                    )}
                    {c.id !== "done" && (t.source === "telegram" || t.source === "in_app") && t.kind === "bug" && (
                      <button onClick={async () => {
                        try {
                          await send({ data: { id: t.id, text: "Good news — this is fixed now. Please try again, and reply here if anything still looks wrong.", markDone: true } });
                          toast.success("Marked fixed and told the user"); refresh();
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
                      }} className="text-[11px] rounded gradient-primary text-white px-2 py-1">Fixed — tell user</button>
                    )}
                  </div>
                </details>
              ))}
              {!items.length && <div className="text-xs text-muted-foreground p-2">Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TelegramLog({ messages }: { messages: TelegramMsg[] }) {
  if (!messages.length) return <Empty text="No group messages yet." />;
  return (
    <div className="glass rounded-2xl border border-border divide-y divide-white/5">
      {messages.map((m) => (
        <div key={m.id} className="p-3 text-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{m.from_name}</span>
            {m.category && <KindBadge kind={m.category} />}
            <span>{handledLabel(m.handled_by)}</span>
            <span className="ml-auto">{new Date(m.created_at).toLocaleString()}</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap">{m.text}</div>
          {m.reply_text && <div className="mt-2 text-xs border-l-2 border-[color:var(--brand-orange)] pl-2 whitespace-pre-wrap text-muted-foreground">{m.reply_text}</div>}
        </div>
      ))}
    </div>
  );
}

function InAppChats({ messages }: { messages: InAppChatMsg[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!messages.length) return <Empty text="No in-app chats yet. Signed-in users can ask from the chat button at the bottom right." />;
  const byUser = new Map<string, InAppChatMsg[]>();
  for (const m of messages) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);
  const threads = [...byUser.entries()].map(([uid, ms]) => ({ uid, ms: [...ms].reverse(), last: ms[0] }));
  return (
    <div className="space-y-2">
      {threads.map(({ uid, ms, last }) => (
        <div key={uid} className="glass rounded-2xl border border-border">
          <button onClick={() => setOpen(open === uid ? null : uid)} className="w-full text-left p-3 flex items-center gap-2 text-sm">
            <span className="font-medium truncate">{last.email ?? uid.slice(0, 8)}</span>
            {last.category && <KindBadge kind={last.category} />}
            <span className="text-muted-foreground truncate flex-1">{last.text}</span>
            <span className="text-xs text-muted-foreground shrink-0">{new Date(last.created_at).toLocaleString()}</span>
          </button>
          {open === uid && (
            <div className="border-t border-white/5 p-3 space-y-2 max-h-[60vh] overflow-auto">
              {ms.map((m) => (
                <div key={m.id} className={`text-sm rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === "user" ? "bg-white/5" : m.role === "admin" ? "ml-auto bg-emerald-500/10 border border-emerald-500/20" : "ml-auto bg-orange-500/10 border border-orange-500/20"}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                    {m.role === "user" ? "User" : m.role === "admin" ? "You" : "Assistant"}{m.page ? ` · ${m.page}` : ""} · {new Date(m.created_at).toLocaleTimeString()}
                  </div>
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RunsLog({ runs }: { runs: AgentRun[] }) {
  const run = useServerFn(runAgentNow);
  const refresh = useRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["qa", "ops", "product_manager"] as const).map((a) => (
          <button key={a} disabled={busy !== null} onClick={async () => {
            setBusy(a);
            try { await run({ data: { agent: a } }); toast.success(`${AGENT_LABEL[a]} finished`); refresh(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Run failed"); }
            finally { setBusy(null); }
          }} className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy === a ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run {AGENT_LABEL[a]} now
          </button>
        ))}
      </div>
      {!runs.length ? <Empty text="No agent runs yet." /> : (
        <div className="glass rounded-2xl border border-border divide-y divide-white/5">
          {runs.map((r) => (
            <div key={r.id} className="p-3 text-sm flex items-start gap-2">
              {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{AGENT_LABEL[r.agent] ?? r.agent} · {r.trigger} · {new Date(r.created_at).toLocaleString()} · ${Number(r.cost_usd).toFixed(4)}</div>
                <div className="whitespace-pre-wrap break-words">{r.summary}</div>
                {r.error && <div className="text-xs text-rose-300 mt-1">{r.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ s }: { s: HqSettings }) {
  const save = useServerFn(saveAgentSettings);
  const linkCode = useServerFn(createTelegramLinkCode);
  const refresh = useRefresh();
  const [token, setToken] = useState("");
  const [budget, setBudget] = useState(String(s.monthlyBudgetUsd));
  const [invite, setInvite] = useState(s.buyersGroupInviteUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  async function apply(patch: SettingsPatch, ok: string) {
    setBusy(true);
    try { await save({ data: patch }); toast.success(ok); refresh(); setToken(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <h2 className="font-semibold">Telegram support bot</h2>
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
          <li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, pick a name (e.g. "CreatorFlow Support") and copy the token.</li>
          <li>Paste the token below and save. This connects the bot to CreatorFlow.</li>
          <li>Add the bot to your buyers' group and make it an <b>admin</b> (so it can read every message). The first group it hears from becomes the support group.</li>
          <li>Link your own Telegram (below) so approvals and daily reports reach you as private messages.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off"
            placeholder={s.hasBotToken ? `Connected as @${s.botUsername ?? "bot"} — paste a new token to replace` : "123456789:AA…"}
            className="flex-1 min-w-[260px] bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
          <button disabled={busy || !token.trim()} onClick={() => apply({ botToken: token.trim() }, "Bot connected")}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm disabled:opacity-60">Save &amp; connect</button>
        </div>
        <div className="text-xs text-muted-foreground">
          Status: {s.hasBotToken ? <>connected as <b>@{s.botUsername}</b></> : "not connected"}
          {" · "}Support group: {s.groupIds.length ? s.groupIds.join(", ") : "waiting for the first group message"}
          {s.groupIds.length > 0 && <> · <button className="underline" onClick={() => apply({ resetGroup: true }, "The next group the bot hears from becomes the support group")}>change group</button></>}
        </div>
        <Toggle label="Support agent is on" value={s.telegramEnabled} onChange={(v) => apply({ telegramEnabled: v }, v ? "Support agent on" : "Support agent paused")} />
        <Toggle label="Answer simple questions automatically (billing and unsure answers always wait for you)" value={s.autoReply} onChange={(v) => apply({ autoReply: v }, "Saved")} />
      </div>

      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <h2 className="font-semibold">Buyers' group invite link</h2>
        <p className="text-sm text-muted-foreground">
          Shown only to users with an active paid plan (Starter, Creator, Pro, lifetime) — on their Billing page and right after they buy a plan.
          Free users and credit-pack-only buyers see a locked "included with paid plans" card. Leave empty to hide it everywhere.
        </p>
        <p className="text-xs text-muted-foreground">
          In Telegram: open the group → tap its name → Invite Links (or Add Members → Invite via link) → copy. Tip: turn on "Approve new members" for that link so you can check each join request.
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://t.me/+AbCdEf…" inputMode="url" aria-label="Buyers' group invite link"
            className="flex-1 min-w-[260px] bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
          <button disabled={busy || invite.trim() === (s.buyersGroupInviteUrl ?? "")}
            onClick={() => apply({ buyersGroupInviteUrl: invite.trim() }, invite.trim() ? "Invite link saved — paid users can see it now" : "Invite link removed")}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm disabled:opacity-60">Save</button>
        </div>
        {s.buyersGroupInviteUrl && <p className="text-xs text-emerald-300">Live — paid users see a "Join on Telegram" button.</p>}
      </div>

      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <h2 className="font-semibold">Your Telegram (for approvals and reports)</h2>
        <p className="text-sm text-muted-foreground">{s.adminTelegramLinked ? "Linked — you'll get approvals, alerts and reports as private messages from the bot." : "Not linked yet."}</p>
        <button disabled={!s.hasBotToken} onClick={async () => { const r = await linkCode(); setCode(r.code); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm disabled:opacity-60">Get my link code</button>
        {code && (
          <p className="text-sm">Open <a className="underline" href={`https://t.me/${s.botUsername}`} target="_blank" rel="noreferrer">@{s.botUsername}</a>, press Start, then send: <code className="px-1.5 py-0.5 rounded bg-black/40">/link {code}</code> (valid 30 minutes).</p>
        )}
      </div>

      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <h2 className="font-semibold">Budget and schedule</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Monthly AI budget for agents: $
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" aria-label="Monthly AI budget in US dollars"
            className="w-24 bg-input/50 border border-border rounded-lg px-2 py-1.5" />
          <button disabled={busy} onClick={() => apply({ monthlyBudgetUsd: Math.max(0, Number(budget) || 0) }, "Budget saved")}
            className="rounded-lg glass border border-border px-3 py-1.5">Save</button>
          <span className="text-xs text-muted-foreground">When it's used up, every message goes to you instead.</span>
        </div>
        <Toggle label="Daily QA health check + ops numbers (08:10 IST), weekly product plan on Mondays" value={s.scheduledAgentsEnabled} onChange={(v) => apply({ scheduledAgentsEnabled: v }, "Saved")} />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[color:var(--brand-orange)]" />
      {label}
    </label>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const cls: Record<string, string> = {
    bug: "bg-rose-500/15 text-rose-300", billing: "bg-amber-500/15 text-amber-300", question: "bg-sky-500/15 text-sky-300",
    feature: "bg-violet-500/15 text-primary", report: "bg-emerald-500/15 text-emerald-300", alert: "bg-rose-500/15 text-rose-300",
    chat: "bg-white/10 text-muted-foreground",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${cls[kind] ?? "bg-white/10"}`}>{kind}</span>;
}

function handledLabel(h: string | null): string {
  return h === "agent" ? "answered by agent" : h === "admin" ? "sent to you" : h === "ignored" ? "no reply needed" : h === "pending" ? "processing…" : "";
}

function Empty({ text }: { text: string }) {
  return <div className="glass rounded-2xl p-8 border border-border text-center text-sm text-muted-foreground">{text}</div>;
}

type HqSettings = {
  telegramEnabled: boolean; hasBotToken: boolean; botUsername: string | null; groupIds: number[];
  autoReply: boolean; monthlyBudgetUsd: number; scheduledAgentsEnabled: boolean; adminTelegramLinked: boolean;
  buyersGroupInviteUrl: string | null;
};
type SettingsPatch = {
  botToken?: string; telegramEnabled?: boolean; autoReply?: boolean; monthlyBudgetUsd?: number;
  scheduledAgentsEnabled?: boolean; resetGroup?: boolean; buyersGroupInviteUrl?: string;
};
