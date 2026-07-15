// Landing page content data.
// Structured so it can later be moved to a DB-backed CMS without touching the UI.

export type TestimonialSource = "customer" | "sample" | "demo";

export type Testimonial = {
  id: string;
  name: string;
  country: string;
  role:
    | "Instagram Creator"
    | "YouTube Creator"
    | "YouTuber"
    | "Course Creator"
    | "Agency"
    | "Agency Owner"
    | "Freelancer"
    | "Business Owner"
    | "Small Business Owner"
    | "Digital Marketer"
    | "Coach"
    | "Entrepreneur"
    | "Teacher";
  /** Company or specific creator brand (e.g. "Menon Reels", "Acme Agency"). */
  company?: string;
  /** Poster/thumbnail image. */
  photo: string;
  rating: 1 | 2 | 3 | 4 | 5;
  /** Longer written review used on the card and marquee. */
  review: string;
  /** Short pull-quote overlaid on the video poster. */
  quote?: string;
  /** Provenance — controls the badge on the card. */
  source?: TestimonialSource;
  /**
   * Real, browser-playable video source (MP4 URL, Supabase Storage URL,
   * or YouTube/Vimeo EMBED url — never a watch-page URL).
   * When omitted the card renders as a labelled sample with no play button.
   */
  videoUrl?: string;
  videoType?: "mp4" | "youtube" | "vimeo";
  /** Duration label shown on the play button (e.g. "1:12"). */
  duration?: string;
};

export type TrustBadge = { title: string; desc: string; icon: string };

// Video testimonials must represent GENUINE customer reviews only.
// Until real customer videos are uploaded via /admin/landing, this list is
// intentionally empty and the landing page hides the section entirely.
export const VIDEO_TESTIMONIALS: Testimonial[] = [];

// Short product walkthrough clips shown in a separate "See CreatorFlow AI in
// Action" section — never presented as customer testimonials.
import researchClip from "@/assets/demo/creatorflow-research-walkthrough.mp4.asset.json";
import thumbnailsClip from "@/assets/demo/creatorflow-thumbnails-walkthrough.mp4.asset.json";
import analyticsClip from "@/assets/demo/creatorflow-analytics-walkthrough.mp4.asset.json";
import demoPoster from "@/assets/demo/creatorflow-demo-poster.jpg.asset.json";

export type ProductWalkthrough = {
  id: string;
  title: string;
  caption: string;
  videoUrl: string;
  poster: string;
  duration: string;
};

export const PRODUCT_WALKTHROUGHS: ProductWalkthrough[] = [
  {
    id: "pw1",
    title: "Viral Research Engine",
    caption: "Score a topic, get titles, hooks and one-click prefill into every studio.",
    videoUrl: researchClip.url,
    poster: demoPoster.url,
    duration: "0:15",
  },
  {
    id: "pw2",
    title: "AI Thumbnail Studio",
    caption: "Guided brief → batch concepts → upscale, remove background, inpaint.",
    videoUrl: thumbnailsClip.url,
    poster: demoPoster.url,
    duration: "0:15",
  },
  {
    id: "pw3",
    title: "Publishing & Analytics",
    caption: "Schedule to Instagram, YouTube, LinkedIn & more. Track CTR and revenue.",
    videoUrl: analyticsClip.url,
    poster: demoPoster.url,
    duration: "0:12",
  },
];

export const WRITTEN_TESTIMONIALS: Testimonial[] = [
  {
    id: "w1", name: "Jonas Weber", country: "Germany", role: "Agency",
    photo: "https://i.pravatar.cc/120?img=15", rating: 5,
    review: "We onboarded 12 clients in a month. The LinkedIn carousel + image studio alone pays for the plan.",
  },
  {
    id: "w2", name: "Amara Okafor", country: "Nigeria", role: "Business Owner",
    photo: "https://i.pravatar.cc/120?img=48", rating: 5,
    review: "Finally, an AI tool that keeps my character consistent across every scene of a short.",
  },
  {
    id: "w3", name: "Lucas Martin", country: "France", role: "Freelancer",
    photo: "https://i.pravatar.cc/120?img=8", rating: 5,
    review: "Lifetime plan was a no-brainer. Top-up credits mean I never worry about limits mid-project.",
  },
  {
    id: "w4", name: "Emily Chen", country: "Singapore", role: "Teacher",
    photo: "https://i.pravatar.cc/120?img=45", rating: 5,
    review: "I generate lesson thumbnails and Instagram carousels in the same afternoon. Insane time saver.",
  },
  {
    id: "w5", name: "Rahul Verma", country: "India", role: "YouTuber",
    photo: "https://i.pravatar.cc/120?img=22", rating: 5,
    review: "Retention agent + chapter agent bumped my average watch time by 41%. Real numbers.",
  },
  {
    id: "w6", name: "Isabella Rossi", country: "Italy", role: "Instagram Creator",
    photo: "https://i.pravatar.cc/120?img=25", rating: 5,
    review: "The visual director keeps my brand aesthetic locked. Every post looks like me — not generic AI.",
  },
  {
    id: "w7", name: "David Park", country: "South Korea", role: "Course Creator",
    photo: "https://i.pravatar.cc/120?img=33", rating: 5,
    review: "Direct publishing to LinkedIn saved me an entire step. Approve → schedule → done.",
  },
  {
    id: "w8", name: "Chloe Bennett", country: "United Kingdom", role: "Agency",
    photo: "https://i.pravatar.cc/120?img=49", rating: 5,
    review: "Layer-based slide editor is the missing piece every AI carousel tool has been ignoring.",
  },
];

export const REFUND_ELIGIBLE = [
  "Payment processed successfully but account was never activated.",
  "Unable to access purchased plan due to a verified platform issue.",
  "Credits were deducted because of a confirmed platform bug.",
  "Duplicate payment caused by a payment gateway issue.",
  "Technical issue confirmed by our support team that cannot be resolved within the guarantee period.",
];

export const REFUND_INELIGIBLE = [
  "Credits already consumed through successful AI generations.",
  "Change of mind after purchase.",
  "User entered incorrect prompts or generated undesired content.",
  "Third-party platform restrictions (Instagram, YouTube, LinkedIn, etc.).",
  "User account suspension due to Terms of Service violations.",
];

export const TRUST_BADGES: TrustBadge[] = [
  { title: "Secure Payments", desc: "Razorpay + Stripe grade encryption on every transaction.", icon: "shield" },
  { title: "Commercial Usage", desc: "Use every output in client work and monetized content.", icon: "briefcase" },
  { title: "Instant Downloads", desc: "MP4, PNG, PDF, ZIP — one click, no watermarks.", icon: "download" },
  { title: "Lifetime Plans", desc: "Pay once, keep access forever. No recurring bills.", icon: "infinity" },
  { title: "Monthly Plans", desc: "Fresh credits every month + all premium models.", icon: "calendar" },
  { title: "Credit Top-ups", desc: "Buy extra credits anytime. Top-ups never expire.", icon: "coins" },
  { title: "No API Keys Required", desc: "We handle every model behind the scenes.", icon: "key" },
  { title: "Cloud Saved Projects", desc: "Your work is safe, versioned and accessible anywhere.", icon: "cloud" },
  { title: "AI Powered", desc: "Best-in-class multimodal models orchestrated for creators.", icon: "sparkles" },
];

export const EXTRA_FAQ = [
  { q: "Can I buy lifetime access?", a: "Yes. CreatorFlow AI offers Starter, Creator and Pro Lifetime plans — pay once, keep access forever, no recurring bills." },
  { q: "Can I purchase additional credits?", a: "Absolutely. All users — free, monthly and lifetime — can buy credit top-up packs anytime from the Billing page." },
  { q: "What happens when my credits run out?", a: "Generation pauses until you top up or your monthly plan renews. Your projects and downloads always stay accessible." },
  { q: "Do credits expire?", a: "Monthly plan credits reset each billing cycle. Top-up credits and lifetime included credits do not expire unless configured otherwise." },
  { q: "Can I publish directly to social media?", a: "Yes. Connect Instagram, YouTube, LinkedIn, TikTok and Facebook from the Connections page and publish or schedule in one click." },
  { q: "Can I download everything?", a: "Yes — videos as MP4, images and thumbnails as PNG, carousels as PDF or ZIP. No watermarks, unlimited downloads." },
  { q: "Can I request a refund?", a: "Refunds are available for eligible platform issues — see our Satisfaction Guarantee section for the full policy." },
  { q: "What happens if there is a technical issue?", a: "Contact support and we aim to respond within one business day. Most issues are resolved in 24–48 hours; unresolved eligible issues are credited or refunded." },
];

/* -------------------- Product demo scene script -------------------- */

export type DemoScene = {
  id: string;
  module:
    | "Dashboard" | "Strategy" | "Research" | "Video Studio" | "Carousel Studio"
    | "Image Studio" | "Thumbnail Studio" | "LinkedIn Posts"
    | "Templates & Brand Kit" | "Publishing" | "Result";
  title: string;
  caption: string;
  accent: "purple" | "pink" | "blend";
};

export const DEMO_SCENES: DemoScene[] = [
  { id: "s1", module: "Dashboard", title: "Your CreatorFlow AI command center", caption: "Credit balance, recent projects, quick actions — all in one glass dashboard.", accent: "blend" },
  { id: "s2", module: "Strategy", title: "AI Content Strategy in one click", caption: "Product, audience, goal, platform → a full 30-day content plan.", accent: "purple" },
  { id: "s3", module: "Research", title: "Viral Research Engine", caption: "Topic research, keywords, competitor gaps and trending signals.", accent: "pink" },
  { id: "s4", module: "Video Studio", title: "AI Video Studio", caption: "Blueprint → edit script, scenes, voice, captions → render.", accent: "blend" },
  { id: "s5", module: "Carousel Studio", title: "Carousel Studio", caption: "Plan slides, edit copy, apply brand — export PDF or PNG ZIP.", accent: "purple" },
  { id: "s6", module: "Image Studio", title: "Image Studio", caption: "Prompt, style, aspect — generate concepts in a batch.", accent: "pink" },
  { id: "s7", module: "Thumbnail Studio", title: "Thumbnail Studio", caption: "Title + style → multiple CTR-optimized thumbnail concepts.", accent: "blend" },
  { id: "s8", module: "LinkedIn Posts", title: "LinkedIn workspace", caption: "Post + carousel + hero image in one guided flow.", accent: "purple" },
  { id: "s9", module: "Templates & Brand Kit", title: "Templates & Brand Kit", caption: "Pick a premium template — logo, colors, fonts, voice auto-applied.", accent: "pink" },
  { id: "s10", module: "Publishing", title: "Direct Publishing", caption: "Connect Instagram, Facebook, YouTube, LinkedIn — schedule or ship now.", accent: "blend" },
  { id: "s11", module: "Result", title: "One idea. Every format.", caption: "Video · Carousel · Image · Thumbnail · Caption · LinkedIn — from a single prompt.", accent: "blend" },
];
