// Marketing agents for CreatorFlow AI's OWN growth. Nothing here posts by
// itself: every output is filed in Agent HQ as "waiting_approval", and only an
// admin's click publishes, schedules or sends it.
//
//   Social media manager — plans the week's posts for CreatorFlow's own
//                          Instagram / Facebook / LinkedIn / YouTube.
//   Post creator         — turns each brief into a ready post (caption,
//                          hashtags, real product clip or poster, best time).
//   App promoter         — off-platform growth: community answers, launch
//                          posts, creator outreach, Telegram announcements.

import {
  admin, agentJson, alertAdmins, logRun, siteUrl, withinBudget,
} from "@/lib/agents/core.server";
import { liveKb } from "@/lib/agents/support-kb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY = 864e5;

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Real screen recordings of the live app (public/walkthroughs). */
export const MEDIA_LIBRARY = [
  { id: "tour", title: "60-second product tour (all features)" },
  { id: "research", title: "Viral Research engine — scores a topic, titles, hooks" },
  { id: "video", title: "AI Video Studio — script, scenes, images, render" },
  { id: "thumbnails", title: "Thumbnail Studio — styles, CTR options" },
  { id: "images", title: "AI Images — prompt, styles, HD quality" },
  { id: "carousels", title: "Carousel Creator — 7-slide Instagram carousel" },
  { id: "captions", title: "Captions & hashtags wizard" },
  { id: "planner", title: "Content calendar / planner" },
  { id: "analytics", title: "Analytics dashboard" },
] as const;
type MediaId = (typeof MEDIA_LIBRARY)[number]["id"];

export function mediaUrls(id: string): { video: string; poster: string } {
  const safe = MEDIA_LIBRARY.some((m) => m.id === id) ? id : "tour";
  const base = `${siteUrl()}/walkthroughs/${safe}`;
  return { video: `${base}.mp4`, poster: `${base}.jpg` };
}

const HONESTY_RULES = `HARD RULES
- Only claim what the product facts say. No invented numbers (users, views, revenue, "10x"), no fake testimonials, no fake urgency or discounts that aren't in the facts.
- Never say "guaranteed viral" or promise results. Speak to what the tool does.
- Don't name or disparage competitors.
- Link: ${"{SITE}"} (use it in CTAs; on Instagram say "link in bio").`;

async function connectedAdminPlatforms(db: Db): Promise<string[]> {
  const { data: roles } = await db.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
  if (!ids.length) return [];
  const { data } = await db.from("platform_connections").select("platform,status").in("user_id", ids);
  return [...new Set((data ?? []).filter((c: { status: string }) => c.status === "connected").map((c: { platform: string }) => c.platform))] as string[];
}

async function recentTitles(db: Db, agent: string): Promise<string[]> {
  const { data } = await db.from("agent_tasks").select("title")
    .eq("agent", agent).gte("created_at", new Date(Date.now() - 45 * DAY).toISOString())
    .order("created_at", { ascending: false }).limit(60);
  return (data ?? []).map((t: { title: string }) => t.title);
}

// ---------------------------------------------------------------- Manager + creator

type Brief = {
  platform: SocialPlatform; pillar: string; feature: string; angle: string; format: "reel" | "image" | "text";
  media: MediaId; day_offset: number; why: string;
};
type Plan = { strategy: string; briefs: Brief[] };
type Post = {
  index: number; title: string; caption: string; hashtags: string[]; first_comment?: string; best_time_ist: string; youtube_title?: string;
};

export async function runSocialMediaManager(trigger = "schedule", opts: { count?: number; focus?: string } = {}):
  Promise<{ created: number; strategy: string } | null> {
  const db = await admin();
  if (!(await withinBudget(db))) {
    await logRun({ agent: "social_media_manager", trigger, summary: "Skipped — monthly agent budget reached", ok: false }, db);
    return null;
  }
  const count = Math.min(10, Math.max(1, opts.count ?? 5));
  const [kb, connected, done, { count: signups }] = await Promise.all([
    liveKb(db),
    connectedAdminPlatforms(db),
    recentTitles(db, "post_creator"),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * DAY).toISOString()),
  ]);
  const platforms = connected.filter((p) => (SOCIAL_PLATFORMS as readonly string[]).includes(p));
  const targetPlatforms = platforms.length ? platforms : ["instagram", "linkedin", "facebook"];
  const site = siteUrl();
  const rules = HONESTY_RULES.replace("{SITE}", site);

  // 1) Manager: the plan.
  const plan = await agentJson<Plan>(
    `You are the social media marketing manager for CreatorFlow AI, an AI content studio for creators (strong in India and regional languages like Telugu, Hindi, Tamil, but usable worldwide).
Goal: get creators to sign up (50 free credits) and upgrade. Plan ${count} posts for the coming week for CreatorFlow's OWN accounts on: ${targetPlatforms.join(", ")}.
Mix pillars: product demo (show a feature working), creator tip that uses the tool, before/after workflow, regional-language angle, plan/value. Each post must show ONE feature and pick ONE clip from the media library that actually shows it.
Don't repeat recent topics. Spread days across the week (day_offset 0-6).
Return JSON: {"strategy": "3-4 sentences: this week's theme and why", "briefs": [{"platform": one of ${targetPlatforms.map((p) => `"${p}"`).join("|")}, "pillar", "feature", "angle": "one-line hook idea", "format": "reel"|"image"|"text", "media": one of ${MEDIA_LIBRARY.map((m) => `"${m.id}"`).join("|")}, "day_offset": 0-6, "why"}]}
YouTube briefs must be format "reel" (video). LinkedIn suits "text" or "image".
${rules}`,
    JSON.stringify({
      product_facts: kb,
      media_library: MEDIA_LIBRARY,
      recent_post_titles: done,
      signups_last_7d: signups,
      focus_from_admin: opts.focus ?? null,
    }).slice(0, 24000),
  );
  const briefs = (plan.data.briefs ?? []).filter((b) => (SOCIAL_PLATFORMS as readonly string[]).includes(b.platform)).slice(0, count);
  if (!briefs.length) throw new Error("The manager returned no usable briefs");

  // 2) Post creator: the actual posts.
  const posts = await agentJson<{ posts: Post[] }>(
    `You are the post creator for CreatorFlow AI's own social accounts. Write each post from its brief, native to the platform:
- Instagram: punchy first line (the hook), short lines, 1 CTA ("link in bio"), 8-15 relevant hashtags.
- Facebook: conversational, 2-4 short paragraphs, link ${site}, 3-5 hashtags.
- LinkedIn: professional story or lesson, 120-220 words, line breaks, link ${site}, 3-5 hashtags.
- YouTube (Shorts): youtube_title under 90 characters, description-style caption with link ${site}, 5-8 hashtags.
Plain English (a few Telugu/Hindi words are fine when the brief is regional). Emojis sparingly. Hashtags WITHOUT the # sign in the array and NOT repeated inside caption.
best_time_ist like "19:30" — a sensible posting time in India for that platform.
Return JSON: {"posts": [{"index": brief index, "title": "short internal title", "caption", "hashtags": [], "first_comment"?: "optional", "best_time_ist", "youtube_title"?}]}
${rules}`,
    JSON.stringify({ product_facts: kb, briefs: briefs.map((b, index) => ({ index, ...b })) }).slice(0, 24000),
  );
  const cost = plan.costUsd + posts.costUsd;

  let created = 0;
  const today = new Date(Date.now() + 5.5 * 3600e3); // IST "today"
  for (const p of posts.data.posts ?? []) {
    const b = briefs[p.index];
    if (!b || !p.caption) continue;
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(p.best_time_ist ?? "") ? p.best_time_ist.split(":").map(Number) : [19, 0];
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + Math.min(6, Math.max(0, b.day_offset)) + 1, hh, mm));
    const suggestedAt = new Date(d.getTime() - 5.5 * 3600e3).toISOString(); // IST → UTC
    const media = mediaUrls(b.media);
    const useVideo = b.platform === "youtube" || b.format === "reel";
    await db.from("agent_tasks").insert({
      agent: "post_creator",
      kind: "social_post",
      title: `${b.platform}: ${p.title}`.slice(0, 200),
      body: `Pillar: ${b.pillar} · Feature: ${b.feature}\nAngle: ${b.angle}\nWhy: ${b.why}`,
      status: "waiting_approval",
      priority: 2,
      draft_reply: p.caption,
      source: trigger === "schedule" ? "schedule" : "manual",
      source_ref: {
        platform: b.platform,
        format: b.format,
        hashtags: (p.hashtags ?? []).map((h) => `#${String(h).replace(/^#/, "").replace(/\s+/g, "")}`).join(" "),
        media_id: b.media,
        media_url: b.format === "text" ? null : (useVideo ? media.video : media.poster),
        media_type: b.format === "text" ? null : (useVideo ? "video" : "image"),
        suggested_at: suggestedAt,
        youtube_title: p.youtube_title ?? null,
        first_comment: p.first_comment ?? null,
      },
    });
    created++;
  }

  await db.from("agent_tasks").insert({
    agent: "social_media_manager", kind: "report", status: "done", priority: 2, source: "schedule",
    title: `Social plan — week of ${new Date().toISOString().slice(0, 10)}`,
    body: `${plan.data.strategy}\n\n${briefs.map((b, i) => `${i + 1}. [${b.platform}] ${b.feature} — ${b.angle}`).join("\n")}${platforms.length ? "" : "\n\nNo social accounts connected yet — connect them in Connections so approved posts can publish directly."}`,
    resolved_at: new Date().toISOString(),
  });
  await logRun({ agent: "social_media_manager", trigger, summary: `${created} posts drafted. ${plan.data.strategy}`.slice(0, 480), output: { plan: plan.data, posts: posts.data }, cost_usd: cost }, db);
  if (created) await alertAdmins(`📣 ${created} new social posts are waiting for your approval in Agent HQ → Marketing.\n\n${plan.data.strategy}`.slice(0, 3800), db);
  return { created, strategy: plan.data.strategy };
}

// ---------------------------------------------------------------- App promoter

export const PROMO_CHANNELS = [
  "reddit", "quora", "indiehackers", "product_hunt", "creator_outreach", "telegram_group", "whatsapp", "blog_seo", "youtube_community",
] as const;
type PromoChannel = (typeof PROMO_CHANNELS)[number];
type PromoAction = { channel: PromoChannel; title: string; where: string; how: string; text: string; why: string; priority: 1 | 2 | 3 };

export async function runAppPromoter(trigger = "schedule", opts: { count?: number; focus?: string } = {}):
  Promise<{ created: number; summary: string } | null> {
  const db = await admin();
  if (!(await withinBudget(db))) {
    await logRun({ agent: "app_promoter", trigger, summary: "Skipped — monthly agent budget reached", ok: false }, db);
    return null;
  }
  const count = Math.min(8, Math.max(1, opts.count ?? 5));
  const [kb, done] = await Promise.all([liveKb(db), recentTitles(db, "app_promoter")]);
  const site = siteUrl();
  const { data, costUsd } = await agentJson<{ summary: string; actions: PromoAction[] }>(
    `You are the growth marketer for CreatorFlow AI. Find ${count} concrete promotion actions for this week OUTSIDE CreatorFlow's own social feeds, each with ready-to-use text the founder can approve.
Channels: ${PROMO_CHANNELS.join(", ")}.
- reddit / quora: a genuinely helpful answer to a real kind of question creators ask (e.g. "how do I make faceless reels in Telugu"). Lead with value; mention CreatorFlow once, honestly, as "a tool I built". Name the subreddit or question type in "where". Follow the community's self-promotion rules.
- indiehackers / product_hunt: build-in-public or launch post.
- creator_outreach: a short personal DM to a small creator offering free credits to try it (no pressure).
- telegram_group: an announcement for CreatorFlow's paying-buyers Telegram group (new feature, tip of the week). Friendly, under 120 words.
- whatsapp: a short status/broadcast message.
- blog_seo: an article idea with title, target keyword and an outline in "text".
- youtube_community: a community-tab post or poll.
Prefer a mix; skip channels that don't fit this week. Don't repeat recent titles.
Return JSON: {"summary": "2-3 sentences", "actions": [{"channel","title","where": "exact place to post","how": "1-2 steps","text": "the ready text","why","priority": 1|2|3}]}
${HONESTY_RULES.replace("{SITE}", site)}`,
    JSON.stringify({ product_facts: kb, recent_titles: done, focus_from_admin: opts.focus ?? null }).slice(0, 24000),
  );
  let created = 0;
  for (const a of (data.actions ?? []).slice(0, count)) {
    if (!a.text || !(PROMO_CHANNELS as readonly string[]).includes(a.channel)) continue;
    await db.from("agent_tasks").insert({
      agent: "app_promoter",
      kind: "promo",
      title: `${a.channel.replace(/_/g, " ")}: ${a.title}`.slice(0, 200),
      body: `Where: ${a.where}\nHow: ${a.how}\nWhy: ${a.why}`,
      status: "waiting_approval",
      priority: [1, 2, 3].includes(a.priority) ? a.priority : 2,
      draft_reply: a.text,
      source: trigger === "schedule" ? "schedule" : "manual",
      source_ref: { channel: a.channel, where: a.where },
    });
    created++;
  }
  await logRun({ agent: "app_promoter", trigger, summary: `${created} promotion actions drafted. ${data.summary}`.slice(0, 480), output: data, cost_usd: costUsd }, db);
  if (created) await alertAdmins(`🚀 ${created} promotion ideas with ready text are waiting in Agent HQ → Marketing.\n\n${data.summary}`.slice(0, 3800), db);
  return { created, summary: data.summary };
}

/** Post an approved announcement to the buyers' Telegram group(s). */
export async function sendPromoToTelegramGroup(text: string): Promise<number> {
  const core = await import("@/lib/agents/core.server");
  const s = await core.getAgentSettings();
  const token = await core.botToken(s);
  if (!token) throw new Error("Telegram bot isn't connected (Agent HQ → Settings).");
  if (!s.telegram_group_ids.length) throw new Error("No Telegram group linked yet. Add the bot to your buyers group first.");
  let sent = 0;
  for (const chatId of s.telegram_group_ids) {
    if (await core.tgSend(token, chatId, text)) sent++;
  }
  if (!sent) throw new Error("Telegram didn't accept the message.");
  return sent;
}
