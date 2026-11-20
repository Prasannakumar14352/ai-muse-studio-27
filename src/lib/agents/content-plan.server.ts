// Content plan → ready posts. The plan (content_plan_items) is CreatorFlow's
// own 30-day calendar. Each day, the post creator drafts one post per planned
// platform into Agent HQ as "waiting_approval". Nothing publishes until an
// admin approves it. Items that need media built in a studio (video, carousel,
// thumbnail, image) carry a build brief; the admin builds them in the browser
// and attaches the file to the draft before approving.

import { admin, agentJson, alertAdmins, logRun, siteUrl, withinBudget } from "@/lib/agents/core.server";
import { liveKb } from "@/lib/agents/support-kb";
import { HONESTY_RULES, mediaUrls, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/agents/marketing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PlanItem = {
  id: string; day_number: number | null; plan_date: string; idea: string;
  format: "reel" | "long" | "carousel" | "image";
  build: "walkthrough" | "video" | "thumbnail" | "carousel" | "image";
  media_id: string | null; platforms: Array<{ platform: string; time: string }>;
  notes: string | null; status: string;
};

type DraftPost = {
  item_id: string; platform: SocialPlatform; caption: string; hashtags: string[];
  youtube_title?: string; first_comment?: string;
};
type BuildBrief = {
  item_id: string; topic: string; language: string; angle: string; headline?: string; duration_sec?: number;
};

const IST_MS = 5.5 * 3600e3;

/** "2026-11-21" + "19:30" IST → UTC ISO string. */
export function istToUtcIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [19, 0];
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_MS).toISOString();
}

export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + IST_MS + offsetDays * 864e5).toISOString().slice(0, 10);
}

/** What media each platform's post uses, for a plan item. */
function mediaFor(item: PlanItem, platform: string): { url: string | null; type: "video" | "image" | null } {
  if (item.build !== "walkthrough" || !item.media_id) return { url: null, type: null };
  const m = mediaUrls(item.media_id);
  return item.format === "carousel" || item.format === "image"
    ? { url: m.poster, type: "image" }
    : { url: m.video, type: "video" };
}

/**
 * Draft posts for planned items: by default those dated today through
 * `daysAhead` days from now (IST) that are still "planned".
 */
export async function runContentPlanCreator(
  trigger = "schedule",
  opts: { itemIds?: string[]; daysAhead?: number } = {},
): Promise<{ drafted: number; items: number } | null> {
  const db: Db = await admin();
  if (!(await withinBudget(db))) {
    await logRun({ agent: "post_creator", trigger, summary: "Content plan skipped — monthly agent budget reached", ok: false }, db);
    return null;
  }
  let q = db.from("content_plan_items").select("*").eq("status", "planned").order("plan_date").limit(10);
  if (opts.itemIds?.length) q = q.in("id", opts.itemIds);
  else q = q.gte("plan_date", istToday()).lte("plan_date", istToday(opts.daysAhead ?? 2));
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const items = (rows ?? []) as PlanItem[];
  if (!items.length) return { drafted: 0, items: 0 };

  const site = siteUrl();
  const kb = await liveKb(db);
  const wanted = items.flatMap((it) =>
    it.platforms
      .filter((p) => (SOCIAL_PLATFORMS as readonly string[]).includes(p.platform))
      .map((p) => ({ item_id: it.id, platform: p.platform, format: it.format, idea: it.idea, build: it.build })),
  );

  const out = await agentJson<{ posts: DraftPost[]; briefs: BuildBrief[] }>(
    `You are the post creator for CreatorFlow AI's own social accounts. Each planned item below is one day of the founder's content calendar.
Write one post per (item_id, platform) in "wanted", native to the platform:
- Instagram: punchy first line (the hook), short lines, 1 CTA ("link in bio"), 8-15 relevant hashtags.
- Facebook: conversational, 2-4 short paragraphs, link ${site}, 3-5 hashtags.
- YouTube: youtube_title under 90 characters; caption is a description with the link ${site} and 5-8 hashtags. For a "long" item the YouTube post is the full video; Instagram/Facebook posts for a "long" item are teasers that point to the YouTube video.
Plain English (a few Telugu/Hindi words are fine when the idea is regional). Emojis sparingly. Hashtags WITHOUT the # sign in the array and NOT repeated inside the caption.
Also write one build brief per item whose build is not "walkthrough": what the founder should make in the studio — topic (one line), language (English, Telugu or Hindi, from the idea), angle, headline (for thumbnails/carousels/images, max 6 words), duration_sec (30 for reels and teasers, 480 for long videos).
Return JSON: {"posts": [{"item_id", "platform", "caption", "hashtags": [], "youtube_title"?, "first_comment"?}], "briefs": [{"item_id", "topic", "language", "angle", "headline"?, "duration_sec"?}]}
${HONESTY_RULES.replace("{SITE}", site)}`,
    JSON.stringify({ product_facts: kb, items, wanted }).slice(0, 24000),
  );

  const briefs = new Map((out.data.briefs ?? []).map((b) => [b.item_id, b]));
  let drafted = 0;
  const done = new Set<string>();
  for (const p of out.data.posts ?? []) {
    const item = items.find((i) => i.id === p.item_id);
    const slot = item?.platforms.find((x) => x.platform === p.platform);
    if (!item || !slot || !p.caption) continue;
    const media = mediaFor(item, p.platform);
    const brief = briefs.get(item.id) ?? null;
    const { error: insErr } = await db.from("agent_tasks").insert({
      agent: "post_creator",
      kind: "social_post",
      title: `${p.platform}: Day ${item.day_number ?? ""} — ${item.idea}`.slice(0, 200),
      body: `Content plan · ${item.plan_date} · ${item.format}${item.notes ? `\n${item.notes}` : ""}${
        brief ? `\nBuild in ${item.build}: ${brief.topic} (${brief.language})` : ""}`,
      status: "waiting_approval",
      priority: 2,
      draft_reply: p.caption,
      source: trigger === "schedule" ? "schedule" : "manual",
      source_ref: {
        plan_item_id: item.id,
        platform: p.platform,
        format: item.format === "long" ? (p.platform === "youtube" ? "long video" : "teaser reel") : item.format,
        hashtags: (p.hashtags ?? []).map((h) => `#${String(h).replace(/^#/, "").replace(/\s+/g, "")}`).join(" "),
        media_id: item.media_id,
        media_url: media.url,
        media_type: media.type,
        suggested_at: istToUtcIso(item.plan_date, slot.time),
        youtube_title: p.youtube_title ?? null,
        first_comment: p.first_comment ?? null,
        needs_build: item.build !== "walkthrough",
        build: item.build,
        build_topic: brief?.topic ?? item.idea,
        build_language: brief?.language ?? null,
        build_angle: brief?.angle ?? null,
        build_headline: brief?.headline ?? null,
        build_duration: brief?.duration_sec ?? null,
      },
    });
    if (insErr) continue;
    drafted++;
    done.add(item.id);
  }
  if (done.size) {
    await db.from("content_plan_items")
      .update({ status: "drafted", drafted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", [...done]);
  }
  await logRun({
    agent: "post_creator", trigger,
    summary: `Content plan: ${drafted} posts drafted for ${done.size} of ${items.length} planned days.`,
    output: out.data, cost_usd: out.costUsd,
  }, db);
  if (drafted) {
    await alertAdmins(
      `🗓️ ${drafted} content-plan posts are ready for approval in Calendar → Content plan (or Agent HQ → Marketing).`,
      db,
    );
  }
  return { drafted, items: items.length };
}

/** True when the plan has items in the next week — the freestyle social plan then pauses. */
export async function planCoversNextWeek(db?: Db): Promise<boolean> {
  const d: Db = db ?? (await admin());
  const { count } = await d.from("content_plan_items").select("id", { count: "exact", head: true })
    .gte("plan_date", istToday()).lte("plan_date", istToday(6)).neq("status", "skipped");
  return (count ?? 0) > 0;
}
