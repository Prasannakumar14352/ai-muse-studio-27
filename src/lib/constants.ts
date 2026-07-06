import {
  Video, Film, Image as ImageIcon, Type, Layers,
  Youtube, Instagram, Facebook, Linkedin, Music2,
} from "lucide-react";
import style3d from "@/assets/style-3d.jpg";
import styleGhibli from "@/assets/style-ghibli.jpg";
import styleAnime from "@/assets/style-anime.jpg";
import styleRealistic from "@/assets/style-realistic.jpg";
import stylePixar from "@/assets/style-pixar.jpg";
import styleCinematic from "@/assets/style-cinematic.jpg";
import styleDocumentary from "@/assets/style-documentary.jpg";
import styleDark from "@/assets/style-dark.jpg";
import styleAncient from "@/assets/style-ancient.jpg";
import styleCyberpunk from "@/assets/style-cyberpunk.jpg";
import styleMinimal from "@/assets/style-minimal.jpg";

export const CONTENT_TYPES = [
  { id: "long_video", label: "Long YouTube Video", icon: Video, desc: "5–15 min structured video" },
  { id: "short_reel", label: "Short Reel", icon: Film, desc: "15–60s vertical reel" },
  { id: "carousel", label: "Instagram Carousel", icon: Layers, desc: "5–10 slide carousel" },
  { id: "ai_image", label: "AI Image", icon: ImageIcon, desc: "Single AI-generated image" },
  { id: "caption_only", label: "Caption Only", icon: Type, desc: "Caption + hashtags pack" },
];

export const PLATFORMS = [
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "tiktok", label: "TikTok", icon: Music2 },
  { id: "facebook", label: "Facebook", icon: Facebook },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
];

export const TONES = ["Professional", "Viral", "Emotional", "Funny", "Educational", "Luxury", "Cinematic"];

export const STYLES = [
  { id: "3d", label: "3D", image: style3d, descriptor: "stylized 3D CGI render, vibrant colors, soft studio lighting, hero character portrait, Blender/Pixar-quality shading", accent: "#c026d3" },
  { id: "ghibli", label: "Ghibli-inspired", image: styleGhibli, descriptor: "Studio Ghibli watercolor scene, hand-painted pastoral landscape with drifting clouds, Miyazaki nostalgia, warm afternoon light", accent: "#22c55e" },
  { id: "anime", label: "Anime", image: styleAnime, descriptor: "modern anime illustration, cel-shaded character with expressive eyes, dynamic composition, saturated pop colors", accent: "#ec4899" },
  { id: "realistic", label: "Realistic", image: styleRealistic, descriptor: "photorealistic 8k render, natural window light, 85mm lens, magazine-grade sharpness, cinematic depth of field", accent: "#94a3b8" },
  { id: "pixar", label: "Pixar-like", image: stylePixar, descriptor: "Pixar animated movie still, cute stylized character, warm family-movie lighting, expressive smile", accent: "#f97316" },
  { id: "cinematic", label: "Cinematic", image: styleCinematic, descriptor: "cinematic movie still, teal-and-orange grade, anamorphic lens flare, moody wide shot, Hollywood atmosphere", accent: "#6366f1" },
  { id: "documentary", label: "Documentary", image: styleDocumentary, descriptor: "National Geographic documentary photography, candid moment, muted earthy tones, honest journalistic framing", accent: "#78716c" },
  { id: "dark", label: "Dark Mystery", image: styleDark, descriptor: "noir mystery scene, deep shadows with rim light, atmospheric fog, thriller mood, black and midnight-blue palette", accent: "#0ea5e9" },
  { id: "ancient", label: "Ancient Gold", image: styleAncient, descriptor: "ancient Egyptian temple interior, warm golden light on carved hieroglyphs, epic historical cinematography", accent: "#eab308" },
  { id: "cyberpunk", label: "Cyberpunk", image: styleCyberpunk, descriptor: "cyberpunk neon street at night, rain-slicked pavement reflecting pink and cyan signs, Blade Runner future noir", accent: "#f0abfc" },
  { id: "minimal", label: "Minimal", image: styleMinimal, descriptor: "minimal Scandinavian still-life, single subject on soft off-white, gentle shadows, calm negative space", accent: "#a8a29e" },
];

export type StyleDef = typeof STYLES[number];

export function getStyle(id?: string | null): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[5];
}
export function getStyleImage(id?: string | null): string {
  return getStyle(id).image;
}

// 10 predefined content niches
export const NICHES = [
  { id: "fitness", label: "Fitness & Health", emoji: "💪", topics: [
    "3 morning habits that transform your energy",
    "Why silent walking is the new meditation",
    "The one stretch that fixes bad posture",
  ]},
  { id: "finance", label: "Personal Finance", emoji: "💰", topics: [
    "5 money moves in your 20s that pay off forever",
    "The 50/30/20 budget everyone gets wrong",
    "How I saved my first ₹1 lakh in 6 months",
  ]},
  { id: "tech", label: "Tech & AI", emoji: "🤖", topics: [
    "3 AI tools that replaced my whole workflow",
    "The prompt engineers are actually using",
    "Why every creator needs a personal AI stack",
  ]},
  { id: "business", label: "Startup & Business", emoji: "🚀", topics: [
    "How to validate a startup idea in 48 hours",
    "The pricing mistake killing your SaaS",
    "One-person businesses making $10k/month",
  ]},
  { id: "mindset", label: "Mindset & Self-Growth", emoji: "🧠", topics: [
    "The 5-minute rule that beats procrastination",
    "Stop chasing motivation — build systems instead",
    "How reading 10 pages a day changed my life",
  ]},
  { id: "food", label: "Food & Cooking", emoji: "🍜", topics: [
    "3 high-protein breakfasts under 5 minutes",
    "The pasta hack Italian nonnas swear by",
    "Meal prep for busy creators",
  ]},
  { id: "travel", label: "Travel & Adventure", emoji: "✈️", topics: [
    "5 underrated destinations for 2026",
    "How to travel for a month on ₹50k",
    "The one packing list I never leave without",
  ]},
  { id: "fashion", label: "Fashion & Style", emoji: "👗", topics: [
    "Build a capsule wardrobe with 12 pieces",
    "Trends that will define 2026",
    "How to dress for your body type",
  ]},
  { id: "education", label: "Education & Learning", emoji: "📚", topics: [
    "Learn any language in 90 days — the method",
    "The Feynman technique explained in 60 seconds",
    "Study hacks that actually work",
  ]},
  { id: "entertainment", label: "Entertainment & Pop Culture", emoji: "🎬", topics: [
    "Movies that predicted 2026 too accurately",
    "The unsolved mystery still trending online",
    "Behind the scenes of the biggest release",
  ]},
];

export const VOICES = [
  { id: "male_narrator", label: "Male Narrator" },
  { id: "female_narrator", label: "Female Narrator" },
  { id: "energetic_creator", label: "Energetic Creator" },
  { id: "calm_storyteller", label: "Calm Storyteller" },
  { id: "deep_documentary", label: "Deep Documentary" },
  { id: "indian_english", label: "Indian English" },
  { id: "us_english", label: "US English" },
];

export const MUSIC = [
  "Motivational", "Cinematic", "Emotional", "Corporate", "Luxury", "Suspense", "Chill", "No Music",
];

export const GENERATION_COST = 1; // credits per project generation

export type PlanDef = {
  id: string; name: string; price: string; period: string;
  monthlyCredits: number; features: string[]; cta: string; featured?: boolean;
};

export const PLANS: PlanDef[] = [
  {
    id: "free", name: "Free", price: "₹0", period: "forever",
    monthlyCredits: 0,
    features: ["50 signup credits", "Basic captions & images", "Community styles", "Uses credit balance only"],
    cta: "Current plan",
  },
  {
    id: "starter", name: "Starter", price: "₹299", period: "/ month",
    monthlyCredits: 300,
    features: ["300 credits / month", "All content types", "Standard visual styles", "Priority queue"],
    cta: "Upgrade to Starter",
  },
  {
    id: "creator", name: "Creator", price: "₹699", period: "/ month", featured: true,
    monthlyCredits: 1000,
    features: ["1,000 credits / month", "Premium styles", "Voice selection", "Priority support"],
    cta: "Upgrade to Creator",
  },
  {
    id: "pro", name: "Pro", price: "₹1,499", period: "/ month",
    monthlyCredits: 3000,
    features: ["3,000 credits / month", "Advanced styles + presets", "Brand kits", "Priority rendering"],
    cta: "Go Pro",
  },
];
