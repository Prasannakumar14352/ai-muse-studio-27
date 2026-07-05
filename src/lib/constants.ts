import {
  Video, Film, Image as ImageIcon, Type, Layers,
  Youtube, Instagram, Facebook, Linkedin, Music2,
} from "lucide-react";

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
  { id: "3d", label: "3D", grad: "from-fuchsia-500 to-purple-600" },
  { id: "ghibli", label: "Ghibli-inspired", grad: "from-emerald-400 to-sky-500" },
  { id: "anime", label: "Anime", grad: "from-pink-500 to-red-500" },
  { id: "realistic", label: "Realistic", grad: "from-slate-500 to-slate-800" },
  { id: "pixar", label: "Pixar-like", grad: "from-amber-400 to-orange-500" },
  { id: "cinematic", label: "Cinematic", grad: "from-indigo-500 to-purple-700" },
  { id: "documentary", label: "Documentary", grad: "from-stone-500 to-stone-800" },
  { id: "dark", label: "Dark Mystery", grad: "from-zinc-800 to-black" },
  { id: "ancient", label: "Ancient Gold", grad: "from-yellow-500 to-amber-800" },
  { id: "cyberpunk", label: "Cyberpunk", grad: "from-fuchsia-500 to-cyan-400" },
  { id: "minimal", label: "Minimal", grad: "from-neutral-300 to-neutral-600" },
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

export const PLANS = [
  {
    id: "free", name: "Free", price: "₹0", period: "forever",
    features: ["5 generations / month", "Basic captions", "Basic images", "Community styles"],
    cta: "Current plan",
  },
  {
    id: "creator", name: "Creator", price: "₹499", period: "/ month", featured: true,
    features: ["100 generations / month", "Long & short videos", "Premium visual styles", "Voice selection", "Priority support"],
    cta: "Upgrade to Creator",
  },
  {
    id: "pro", name: "Pro", price: "₹999", period: "/ month",
    features: ["Unlimited generations", "Advanced styles + presets", "Brand kits", "Priority rendering", "Early access features"],
    cta: "Go Pro",
  },
];
