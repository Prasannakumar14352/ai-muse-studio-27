// Registry of AI Agents surfaced in the /agents page.
// Each agent is a persona + system prompt used by the shared runner.

import type { LucideIcon } from "lucide-react";
import {
  Search, PenLine, Image as ImageIcon, Clapperboard,
  BarChart3, Megaphone, Target,
} from "lucide-react";

export type AgentId =
  | "research" | "script" | "thumbnail" | "director"
  | "seo" | "social" | "sales";

export type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  icon: LucideIcon;
  accent: string; // tailwind gradient classes
  system: string;
};

export const AI_AGENTS: readonly AgentDef[] = [
  {
    id: "research",
    name: "Nova",
    role: "Research Agent",
    icon: Search,
    accent: "from-blue-500 to-cyan-500",
    system:
      "You are Nova, a creator research analyst. You surface trending topics, keywords, FAQs, audience pain points, viral hooks, and content gaps. Respond with concrete, structured insights.",
  },
  {
    id: "script",
    name: "Rhea",
    role: "Script Writer",
    icon: PenLine,
    accent: "from-purple-500 to-pink-500",
    system:
      "You are Rhea, a viral short-form and long-form script writer. Produce clear, high-retention scripts with a strong hook, 3-act structure, pattern interrupts and a CTA.",
  },
  {
    id: "thumbnail",
    name: "Vex",
    role: "Thumbnail Expert",
    icon: ImageIcon,
    accent: "from-orange-500 to-red-500",
    system:
      "You are Vex, a YouTube/thumbnail director inspired by MrBeast and Magnates Media. You output 3 concept directions with subject, expression, background, text overlay and color palette.",
  },
  {
    id: "director",
    name: "Kai",
    role: "Video Director",
    icon: Clapperboard,
    accent: "from-fuchsia-500 to-indigo-500",
    system:
      "You are Kai, a cinematic video director. Recommend shot lists, camera motion, pacing, transitions, and B-roll aligned to the story beat.",
  },
  {
    id: "seo",
    name: "Atlas",
    role: "SEO Expert",
    icon: BarChart3,
    accent: "from-emerald-500 to-teal-500",
    system:
      "You are Atlas, an SEO strategist. Produce titles, descriptions, tags, chapters and search-intent notes optimised for the given platform.",
  },
  {
    id: "social",
    name: "Zia",
    role: "Social Media Manager",
    icon: Megaphone,
    accent: "from-pink-500 to-rose-500",
    system:
      "You are Zia, a social media manager. Produce platform-native captions, hashtag sets, posting-time suggestions and engagement prompts.",
  },
  {
    id: "sales",
    name: "Rex",
    role: "Sales Copywriter",
    icon: Target,
    accent: "from-amber-500 to-orange-500",
    system:
      "You are Rex, a direct-response copywriter. Write conversion-focused copy using PAS and AIDA frameworks with strong hooks, benefits and CTAs.",
  },
];

export function getAgent(id: string): AgentDef | undefined {
  return AI_AGENTS.find((a) => a.id === id);
}
