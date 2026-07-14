// Landing page content data.
// Structured so it can later be moved to a DB-backed CMS without touching the UI.

export type Testimonial = {
  id: string;
  name: string;
  country: string;
  role:
    | "Instagram Creator"
    | "YouTuber"
    | "Course Creator"
    | "Agency"
    | "Freelancer"
    | "Business Owner"
    | "Teacher";
  photo: string; // URL
  rating: 1 | 2 | 3 | 4 | 5;
  review: string;
  /**
   * Real, browser-playable video source (MP4 file, Supabase Storage URL,
   * or YouTube/Vimeo EMBED url — never a watch-page URL).
   * Omit when no real testimonial video exists yet: the card renders as a
   * clearly labelled "Sample testimonial" with a disabled play button.
   */
  videoUrl?: string;
  videoType?: "mp4" | "youtube" | "vimeo";
};

export type TrustBadge = { title: string; desc: string; icon: string };

// NOTE: All entries below are currently poster-only "Sample testimonial"
// cards. To enable playback, add `videoUrl` + `videoType` with a real
// asset (MP4 in /public, Supabase Storage URL, or a YouTube/Vimeo EMBED
// url like https://www.youtube.com/embed/VIDEO_ID).
export const VIDEO_TESTIMONIALS: Testimonial[] = [
  {
    id: "v1",
    name: "Priya Menon",
    country: "India",
    role: "Instagram Creator",
    photo: "https://i.pravatar.cc/160?img=47",
    rating: 5,
    review:
      "I went from posting twice a week to daily reels. CreatorFlow AI plans my hooks, scripts and thumbnails in minutes.",
  },
  {
    id: "v2",
    name: "Marcus Bell",
    country: "United States",
    role: "YouTuber",
    photo: "https://i.pravatar.cc/160?img=12",
    rating: 5,
    review:
      "The blueprint editor is a game changer. I approve the script, tweak scenes, then render — no more slideshow feel.",
  },
  {
    id: "v3",
    name: "Sofia Álvarez",
    country: "Spain",
    role: "Course Creator",
    photo: "https://i.pravatar.cc/160?img=32",
    rating: 5,
    review:
      "My students get carousels, captions and thumbnails for every lesson. It replaced three tools in my stack.",
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
