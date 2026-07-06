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
  { id: "3d", label: "3D", image: style3d },
  { id: "ghibli", label: "Ghibli-inspired", image: styleGhibli },
  { id: "anime", label: "Anime", image: styleAnime },
  { id: "realistic", label: "Realistic", image: styleRealistic },
  { id: "pixar", label: "Pixar-like", image: stylePixar },
  { id: "cinematic", label: "Cinematic", image: styleCinematic },
  { id: "documentary", label: "Documentary", image: styleDocumentary },
  { id: "dark", label: "Dark Mystery", image: styleDark },
  { id: "ancient", label: "Ancient Gold", image: styleAncient },
  { id: "cyberpunk", label: "Cyberpunk", image: styleCyberpunk },
  { id: "minimal", label: "Minimal", image: styleMinimal },
];

export function getStyleImage(id?: string | null): string {
  return STYLES.find((s) => s.id === id)?.image ?? styleCinematic;
}

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
