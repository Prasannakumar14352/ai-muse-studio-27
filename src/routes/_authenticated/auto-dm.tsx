// Auto DM — comment-to-DM and DM keyword replies for Instagram and Facebook Pages.
// Shows a "Coming soon" board to users until the Meta app and webhook token are
// set up (admins always see the full page plus a setup checklist).
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Bell,
  Check,
  Facebook,
  Instagram,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquareReply,
  Pencil,
  Plus,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmDialog } from "@/components/confirm-dialog";
import { startOAuth } from "@/lib/oauth-user.functions";
import { trackFunnelEvent } from "@/lib/tracking.functions";
import {
  deleteDmRule,
  getAutoDmStatus,
  listDmAccounts,
  listDmActivity,
  listDmMedia,
  listDmRules,
  saveDmRule,
  setDmEnabled,
} from "@/lib/auto-dm.functions";

export const Route = createFileRoute("/_authenticated/auto-dm")({
  validateSearch: (s: Record<string, unknown>) => ({
    ok: typeof s.ok === "string" ? s.ok : undefined,
    err: typeof s.err === "string" ? s.err : undefined,
  }),
  head: () => ({ meta: [{ title: "Auto DM · CreatorFlow AI" }] }),
  component: AutoDmPage,
});

type Account = Awaited<ReturnType<typeof listDmAccounts>>[number];
type Rule = Awaited<ReturnType<typeof listDmRules>>[number];

const TRIGGER_LABEL: Record<Rule["trigger"], string> = {
  comment_keyword: "Comment with keyword → DM",
  any_comment: "Any comment → DM",
  dm_keyword: "DM with keyword → reply",
};
const KIND_LABEL = {
  private_reply: "Comment → DM",
  dm: "DM reply",
  public_reply: "Public reply",
} as const;
const PlatformIcon = ({ p, className }: { p: string; className?: string }) =>
  p === "instagram" ? <Instagram className={className} /> : <Facebook className={className} />;

const HOW = [
  {
    icon: MessageCircle,
    title: "Someone comments a keyword",
    text: "e.g. “GUIDE” on your reel or post — or sends it to you in DMs.",
  },
  {
    icon: Zap,
    title: "CreatorFlow replies instantly",
    text: "A private DM with your message and link, within seconds.",
  },
  {
    icon: MessageSquareReply,
    title: "Optional public reply",
    text: "“Sent you a DM 📩” under their comment, so others comment too.",
  },
  {
    icon: Check,
    title: "Inside Meta's rules",
    text: "Official API only: one DM per comment, 24-hour window, STOP to opt out.",
  },
];

function AutoDmPage() {
  const search = useSearch({ from: "/_authenticated/auto-dm" });
  const statusFn = useServerFn(getAutoDmStatus);
  const { data: status, isLoading } = useQuery({
    queryKey: ["auto-dm-status"],
    queryFn: () => statusFn(),
  });

  useEffect(() => {
    if (search.ok) toast.success(`Connected ${search.ok}`);
    if (search.err) toast.error(`Connection failed: ${search.err}`);
  }, [search.ok, search.err]);

  if (isLoading || !status) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!status.live && !status.isAdmin) return <ComingSoon />;
  if (!status.allowed) return <Locked />;
  return (
    <div className="max-w-5xl space-y-8">
      <Header />
      {!status.live && <AdminSetup metaApp={status.metaApp} webhookToken={status.webhookToken} />}
      <Workspace />
    </div>
  );
}

function Header({ soon = false }: { soon?: boolean }) {
  return (
    <div className="space-y-3">
      {soon && (
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-white/[0.06] text-muted-foreground border border-border">
          <MessageCircle className="w-3.5 h-3.5" /> Coming soon
        </span>
      )}
      <h1 className="text-3xl md:text-4xl font-bold">
        Auto <span className="gradient-text">DM</span>
      </h1>
      <p className="text-muted-foreground max-w-2xl">
        When someone comments a keyword on your Instagram or Facebook post, CreatorFlow sends them a
        DM with your link — automatically. Also replies to DMs that contain a keyword. Creator plan
        and above.
      </p>
    </div>
  );
}

function HowItWorks() {
  return (
    <ol className="grid md:grid-cols-4 gap-3">
      {HOW.map((s, i) => (
        <li key={s.title} className="glass rounded-2xl p-4 border border-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center font-semibold text-foreground">
              {i + 1}
            </span>
            <s.icon className="w-4 h-4" />
          </div>
          <div className="font-semibold text-sm">{s.title}</div>
          <p className="text-xs text-muted-foreground">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

function ComingSoon() {
  const track = useServerFn(trackFunnelEvent);
  const [saved, setSaved] = useState(false);
  async function notify() {
    try {
      await track({ data: { event: "auto_dm_interest", meta: { page: "auto-dm" } } });
      setSaved(true);
      toast.success("Thanks — we'll let you know when Auto DM launches.");
    } catch {
      toast.error("Couldn't save that — please try again.");
    }
  }
  return (
    <div className="max-w-5xl space-y-8">
      <Header soon />
      <HowItWorks />
      <Button onClick={notify} disabled={saved} className="gap-2">
        {saved ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />}{" "}
        {saved ? "You're on the list" : "Notify me when it's live"}
      </Button>
    </div>
  );
}

function Locked() {
  return (
    <div className="max-w-5xl space-y-8">
      <Header />
      <HowItWorks />
      <div className="glass rounded-2xl p-6 border border-border flex flex-wrap items-center gap-4">
        <Lock className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold">Auto DM is on the Creator plan and above</div>
          <p className="text-sm text-muted-foreground">Monthly, yearly or lifetime.</p>
        </div>
        <Button asChild>
          <Link to="/pricing">See plans</Link>
        </Button>
      </div>
    </div>
  );
}

function AdminSetup({ metaApp, webhookToken }: { metaApp: boolean; webhookToken: boolean }) {
  const Item = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="w-4 h-4 text-emerald-400 mt-0.5" />
      ) : (
        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
      )}
      <span>{children}</span>
    </li>
  );
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 text-sm">
      <div className="font-semibold">Admin: users see “Coming soon” until these are done</div>
      <ul className="space-y-2">
        <Item ok={metaApp}>
          Meta app ID + secret saved and enabled in{" "}
          <Link to="/admin/integrations" className="underline">
            Admin → Social Publishing
          </Link>
          .
        </Item>
        <Item ok={webhookToken}>
          <code>META_WEBHOOK_VERIFY_TOKEN</code> (16+ random characters) set in Vercel.
        </Item>
        <Item ok={false}>
          Meta Dashboard → Webhooks: callback <code>/api/public/webhooks/meta</code> with that
          token; subscribe Instagram <code>comments, messages</code> and Page{" "}
          <code>feed, messages</code>.
        </Item>
        <Item ok={false}>
          App Review: Advanced Access for instagram_manage_messages, instagram_manage_comments,
          pages_messaging, pages_manage_metadata, pages_manage_engagement.
        </Item>
      </ul>
      <p className="text-muted-foreground">
        You can test with your own accounts now (Standard Access works for app roles).
      </p>
    </div>
  );
}

function Workspace() {
  const qc = useQueryClient();
  const accountsFn = useServerFn(listDmAccounts);
  const rulesFn = useServerFn(listDmRules);
  const activityFn = useServerFn(listDmActivity);
  const enableFn = useServerFn(setDmEnabled);
  const start = useServerFn(startOAuth);
  const del = useServerFn(deleteDmRule);
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["dm-accounts"],
    queryFn: () => accountsFn(),
  });
  const { data: rules = [] } = useQuery({ queryKey: ["dm-rules"], queryFn: () => rulesFn() });
  const { data: activity } = useQuery({
    queryKey: ["dm-activity"],
    queryFn: () => activityFn(),
    refetchInterval: 20_000,
  });
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(platform: "instagram" | "facebook") {
    setBusy(platform);
    try {
      const { url } = await start({ data: { platform, purpose: "dm" } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the connection");
      setBusy(null);
    }
  }
  async function toggle(a: Account, on: boolean) {
    setBusy(a.id);
    try {
      await enableFn({ data: { connectionId: a.id, enabled: on } });
      toast.success(on ? `Auto DM on for ${a.label}` : `Auto DM off for ${a.label}`);
      qc.invalidateQueries({ queryKey: ["dm-accounts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setBusy(null);
    }
  }
  async function remove(r: Rule) {
    if (
      !(await confirmDialog({
        title: `Delete “${r.name}”?`,
        description: "Comments that match it will no longer get a DM.",
      }))
    )
      return;
    await del({ data: { id: r.id } });
    qc.invalidateQueries({ queryKey: ["dm-rules"] });
  }
  const label = (id: string) => accounts.find((a) => a.id === id)?.label ?? "Account";

  return (
    <>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!busy}
              onClick={() => connect("instagram")}
            >
              <Instagram className="w-4 h-4" /> Connect Instagram
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!busy}
              onClick={() => connect("facebook")}
            >
              <Facebook className="w-4 h-4" /> Connect Facebook Page
            </Button>
          </div>
        </div>
        {isLoading ? null : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect an Instagram Business/Creator account (linked to a Facebook Page) or a Facebook
            Page. In the Instagram app, also turn on Settings → Messages → Connected tools → Allow
            access to messages.
          </p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-3">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="glass rounded-2xl p-4 border border-border flex items-center gap-3"
              >
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <PlatformIcon p={a.platform} className="w-8 h-8" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-1.5">
                    <PlatformIcon p={a.platform} className="w-3.5 h-3.5" /> {a.label}
                  </div>
                  {a.needsPermissions ? (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => connect(a.platform)}
                    >
                      Reconnect for Auto DM
                    </button>
                  ) : a.lastError ? (
                    <div className="text-xs text-amber-400">{a.lastError}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {a.dmEnabled ? "Auto DM is on" : "Auto DM is off"}
                    </div>
                  )}
                </div>
                <Switch
                  checked={a.dmEnabled}
                  disabled={busy === a.id || (a.needsPermissions && !a.dmEnabled)}
                  onCheckedChange={(v) => toggle(a, v)}
                  aria-label={`Auto DM for ${a.label}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rules</h2>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={accounts.length === 0}
            onClick={() =>
              setEditing({
                connection_id: accounts[0]?.id,
                trigger: "comment_keyword",
                match_mode: "contains",
                keywords: [],
                public_replies: [],
                active: true,
              })
            }
          >
            <Plus className="w-4 h-4" /> New rule
          </Button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rules yet. Example: comment “GUIDE” → DM “Here's the free guide 👇” with your link.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="glass rounded-xl p-4 border border-border flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[220px]">
                  <div className="font-medium">
                    {r.name}{" "}
                    {!r.active && <span className="text-xs text-muted-foreground">(paused)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {label(r.connection_id)} · {TRIGGER_LABEL[r.trigger]}
                    {r.keywords.length > 0 && <> · {r.keywords.map((k) => `“${k}”`).join(", ")}</>}
                    {r.media_id ? " · one post" : r.trigger !== "dm_keyword" ? " · all posts" : ""}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit rule"
                  onClick={() => setEditing(r)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete rule"
                  onClick={() => remove(r)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Activity</h2>
        <div className="flex gap-3 text-sm">
          <span className="glass rounded-lg px-3 py-1.5 border border-border">
            Sent (7 days): <b>{activity?.sent7d ?? 0}</b>
          </span>
          <span className="glass rounded-lg px-3 py-1.5 border border-border">
            Failed (7 days): <b>{activity?.failed7d ?? 0}</b>
          </span>
        </div>
        {(activity?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="pr-3">Type</th>
                  <th className="pr-3">To</th>
                  <th className="pr-3">Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {activity!.items.map((i) => (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(i.created_at).toLocaleString()}
                    </td>
                    <td className="pr-3 whitespace-nowrap">{KIND_LABEL[i.kind]}</td>
                    <td className="pr-3">{i.recipient_name ?? "—"}</td>
                    <td className="pr-3 whitespace-nowrap">
                      <span
                        className={
                          i.status === "sent"
                            ? "text-emerald-400"
                            : i.status === "failed"
                              ? "text-red-400"
                              : "text-muted-foreground"
                        }
                      >
                        {i.status}
                      </span>
                      {i.error && (
                        <div className="text-xs text-muted-foreground max-w-[220px]">{i.error}</div>
                      )}
                    </td>
                    <td className="max-w-[320px] truncate">{i.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <RuleDialog
          initial={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["dm-rules"] });
          }}
        />
      )}
    </>
  );
}

function RuleDialog({
  initial,
  accounts,
  onClose,
  onSaved,
}: {
  initial: Partial<Rule>;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveDmRule);
  const mediaFn = useServerFn(listDmMedia);
  const [connectionId, setConnectionId] = useState(initial.connection_id ?? accounts[0]?.id ?? "");
  const [name, setName] = useState(initial.name ?? "");
  const [trigger, setTrigger] = useState<Rule["trigger"]>(initial.trigger ?? "comment_keyword");
  const [keywords, setKeywords] = useState((initial.keywords ?? []).join(", "));
  const [matchMode, setMatchMode] = useState<Rule["match_mode"]>(initial.match_mode ?? "contains");
  const [mediaId, setMediaId] = useState<string>(initial.media_id ?? "");
  const [dmText, setDmText] = useState(initial.dm_text ?? "");
  const [linkUrl, setLinkUrl] = useState(initial.link_url ?? "");
  const [publicReplies, setPublicReplies] = useState((initial.public_replies ?? []).join("\n"));
  const [active, setActive] = useState(initial.active ?? true);
  const [saving, setSaving] = useState(false);
  const isComment = trigger !== "dm_keyword";

  const { data: media = [], isFetching: mediaLoading } = useQuery({
    queryKey: ["dm-media", connectionId],
    queryFn: () => mediaFn({ data: { connectionId } }),
    enabled: !!connectionId && isComment,
    staleTime: 5 * 60_000,
  });

  async function submit() {
    setSaving(true);
    try {
      await save({
        data: {
          id: initial.id,
          connectionId,
          name: name || "Untitled rule",
          trigger,
          mediaId: isComment ? mediaId || null : null,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          matchMode,
          dmText,
          linkUrl: linkUrl || null,
          publicReplies: isComment
            ? publicReplies
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          active,
        },
      });
      toast.success("Rule saved");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save";
      toast.error(
        msg.includes("[") ? "Check the fields: keywords, message and link (https://)." : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  const select = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Free guide giveaway"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-acc">Account</Label>
            <select
              id="r-acc"
              className={select}
              value={connectionId}
              onChange={(e) => {
                setConnectionId(e.target.value);
                setMediaId("");
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform === "instagram" ? "Instagram" : "Facebook"} · {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-trig">When</Label>
            <select
              id="r-trig"
              className={select}
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as Rule["trigger"])}
            >
              {Object.entries(TRIGGER_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {trigger !== "any_comment" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="r-kw">Keywords (comma separated)</Label>
                <Input
                  id="r-kw"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="GUIDE, link, గైడ్"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-mm">Match</Label>
                <select
                  id="r-mm"
                  className={select}
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as Rule["match_mode"])}
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact</option>
                </select>
              </div>
            </div>
          )}
          {isComment && (
            <div className="space-y-1.5">
              <Label htmlFor="r-media">Post</Label>
              <select
                id="r-media"
                className={select}
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
              >
                <option value="">All posts and reels</option>
                {mediaId && !media.some((m) => m.id === mediaId) && (
                  <option value={mediaId}>Selected post</option>
                )}
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.caption || m.id}
                  </option>
                ))}
              </select>
              {mediaLoading && (
                <p className="text-xs text-muted-foreground">Loading your recent posts…</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="r-dm">DM message</Label>
            <Textarea
              id="r-dm"
              value={dmText}
              onChange={(e) => setDmText(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Thanks for commenting! Here's the free guide 👇"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-link">Link (optional)</Label>
            <Input
              id="r-link"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          {isComment && (
            <div className="space-y-1.5">
              <Label htmlFor="r-pub">
                Public reply under the comment (optional, one per line — one is picked at random)
              </Label>
              <Textarea
                id="r-pub"
                value={publicReplies}
                onChange={(e) => setPublicReplies(e.target.value)}
                rows={3}
                placeholder={"Sent you a DM 📩\nCheck your inbox! 🙌"}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="r-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="r-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !dmText.trim() || !connectionId}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{" "}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
