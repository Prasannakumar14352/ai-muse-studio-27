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

// Short product walkthrough clips shown in the "See CreatorFlow AI in Action"
// marquee — never presented as customer testimonials. Each card has its own
// clip recorded from the live app (in /public/walkthroughs/). Cards without a
// clip show a still; admins can replace any card in Admin → Landing →
// Walkthrough clips (a published clip with the same title wins).
export type ProductWalkthrough = {
  id: string;
  title: string;
  caption: string;
  videoUrl?: string;
  poster?: string;
  duration?: string;
};

const wt = (id: string) => ({ videoUrl: `/walkthroughs/${id}.mp4`, poster: `/walkthroughs/${id}.jpg` });

export const PRODUCT_WALKTHROUGHS: ProductWalkthrough[] = [
  { id: "research", title: "Viral Research", caption: "Score any topic, see real top YouTube videos, then get titles, hooks and keywords.", ...wt("research") },
  { id: "video", title: "AI Video Studio", caption: "Topic in → script, scenes, voiceover, captions and a finished reel out — with real motion clips.", ...wt("video") },
  { id: "thumbnails", title: "Thumbnail Studio", caption: "High-CTR YouTube thumbnails at 1280×720, with an editable headline in any language.", ...wt("thumbnails") },
  { id: "images", title: "AI Images (HD)", caption: "Any style, any ratio — HD mode spells text correctly and keeps every character.", ...wt("images") },
  { id: "carousels", title: "Carousel Creator", caption: "Instagram and LinkedIn carousels with matching design across every slide.", ...wt("carousels") },
  { id: "captions", title: "Captions in your language", caption: "Captions and hashtags in Telugu, Hindi, Tamil and more — ready to paste.", ...wt("captions") },
  { id: "planner", title: "Content Planner", caption: "Plan the month, see every post on a calendar, publish when it's ready.", ...wt("planner") },
  { id: "analytics", title: "Analytics", caption: "See everything you've made — videos, images, carousels and posts — in one place.", ...wt("analytics") },
];

// Sample creator reviews shown until real, consented customer reviews are
// published via /admin/landing. Every entry is tagged `source: "sample"` so
// the UI can render a "Sample Review" badge — never presented as a real
// customer testimonial. Indian creators only, mixed cities and professions.
export const WRITTEN_TESTIMONIALS: Testimonial[] = [
  {
    id: "w1", name: "Rahul Sharma", country: "Bangalore, India", role: "YouTube Creator",
    photo: "https://randomuser.me/api/portraits/men/75.jpg", rating: 5, source: "sample",
    review: "I wanted one place to generate YouTube videos, LinkedIn posts, thumbnails and Instagram carousels. CreatorFlow AI makes the workflow much faster and keeps every project neatly organized in one dashboard.",
  },
  {
    id: "w2", name: "Priya Verma", country: "Mumbai, India", role: "Instagram Creator",
    photo: "https://randomuser.me/api/portraits/women/68.jpg", rating: 5, source: "sample",
    review: "Reels, carousels and captions from a single brief. My feed finally looks consistent and I ship 3x more posts every week without burning out on editing.",
  },
  {
    id: "w3", name: "Ankit Patel", country: "Ahmedabad, India", role: "Digital Marketer",
    photo: "https://randomuser.me/api/portraits/men/32.jpg", rating: 5, source: "sample",
    review: "The research engine surfaces trending angles I would have missed, and I can push them straight into a video plan or LinkedIn campaign. Cuts my ideation time by half.",
  },
  {
    id: "w4", name: "Sneha Reddy", country: "Hyderabad, India", role: "Course Creator",
    photo: "https://randomuser.me/api/portraits/women/44.jpg", rating: 5, source: "sample",
    review: "I run a paid cohort and needed thumbnails, lesson carousels and email banners on repeat. Brand Kit keeps colors and fonts locked, so every asset feels like the same course.",
  },
  {
    id: "w5", name: "Karan Mehta", country: "Pune, India", role: "Agency Owner",
    photo: "https://randomuser.me/api/portraits/men/22.jpg", rating: 5, source: "sample",
    review: "We onboarded eight clients in a month. The LinkedIn carousel studio and image studio alone pay for the plan — my team ships client work in a fraction of the time.",
  },
  {
    id: "w6", name: "Neha Singh", country: "Delhi, India", role: "Coach",
    photo: "https://randomuser.me/api/portraits/women/12.jpg", rating: 5, source: "sample",
    review: "As a mindset coach I post daily. The captions and carousel agents match my tone perfectly and the direct publishing to Instagram and LinkedIn saves me at least an hour every morning.",
  },
  {
    id: "w7", name: "Arjun Nair", country: "Kochi, India", role: "Freelancer",
    photo: "https://randomuser.me/api/portraits/men/45.jpg", rating: 5, source: "sample",
    review: "Lifetime plan was a no-brainer. Top-up credits mean I never worry about running out mid-project, and every asset — video, thumbnail, carousel — downloads clean with no watermark.",
  },
  {
    id: "w8", name: "Pooja Iyer", country: "Chennai, India", role: "Small Business Owner",
    photo: "https://randomuser.me/api/portraits/women/29.jpg", rating: 5, source: "sample",
    review: "I run a boutique studio and used to outsource every social post. Now I generate a week of content in one sitting — hero images, reels, carousels and captions all in my brand voice.",
  },
  {
    id: "w9", name: "Vikram Iyer", country: "Bangalore, India", role: "Entrepreneur",
    photo: "https://randomuser.me/api/portraits/men/60.jpg", rating: 5, source: "sample",
    review: "Launched two D2C brands this year. The AI Strategy plus 30-day content calendar gave me a real plan on day one instead of blank pages. Publishing to Instagram and YouTube directly is the cherry on top.",
  },
  {
    id: "w10", name: "Aditi Joshi", country: "Pune, India", role: "Teacher",
    photo: "https://randomuser.me/api/portraits/women/50.jpg", rating: 5, source: "sample",
    review: "I make explainer videos and worksheets for my students. Thumbnails that actually get clicks, carousels for revision, and captions in one place. Easily the most useful tool I subscribed to this year.",
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
