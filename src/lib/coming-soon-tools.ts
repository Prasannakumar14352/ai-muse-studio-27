// Upcoming one-click tools, shown as "Coming soon" in the app (/tools) and on
// the public landing + features pages. Keep this the single source of truth so
// the marketing copy never drifts from what the app shows.
import { Captions, Clapperboard, Eraser, MonitorUp, Mic, type LucideIcon } from "lucide-react";

export type ToolInterestEvent =
  | "tool_subtitles_interest"
  | "tool_bg_remove_interest"
  | "tool_upscale_interest"
  | "tool_talking_photo_interest"
  | "tool_scene_stitch_interest";

export type ComingSoonTool = {
  id: ToolInterestEvent;
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
};

export const COMING_SOON_TOOLS: readonly ComingSoonTool[] = [
  {
    id: "tool_subtitles_interest",
    icon: Captions,
    title: "Auto Subtitles",
    text: "Upload a video or use one from your projects — we transcribe the speech and burn in styled, word-by-word captions.",
    points: ["Telugu, Hindi, English and more", "Reel-style animated caption themes", "Download .srt or burned-in MP4"],
  },
  {
    id: "tool_bg_remove_interest",
    icon: Eraser,
    title: "Background Remover",
    text: "Cut out the subject of any image in one click — ready for thumbnails, product posts and carousels.",
    points: ["Transparent PNG output", "Swap in a colour or new background", "Works with your Media Library"],
  },
  {
    id: "tool_upscale_interest",
    icon: MonitorUp,
    title: "HD Upscaler",
    text: "Sharpen low-resolution images and videos up to Full HD (1080p) and beyond without losing detail.",
    points: ["Images up to 4×", "Videos to 1080p", "One click from any project"],
  },
  {
    id: "tool_talking_photo_interest",
    icon: Mic,
    title: "Talking Photo",
    text: "Turn a single photo into a speaking avatar, lip-synced to your script or AI voiceover in any language.",
    points: ["Use your own or an AI voice", "Multilingual lip-sync", "Perfect for faceless channels"],
  },
  {
    id: "tool_scene_stitch_interest",
    icon: Clapperboard,
    title: "Scene Stitcher",
    text: "Join several clips with a voiceover and music into one finished 30–60 second video, assembled automatically.",
    points: ["Auto timing to the voiceover", "Transitions and captions included", "Publish straight to YouTube"],
  },
];
