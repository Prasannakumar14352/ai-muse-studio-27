/**
 * Subtitle style presets available in the Post-Generation Studio.
 * Each preset defines a self-contained style object matching the existing
 * `SubtitleStyle` shape used elsewhere in the app.
 */
export type SubtitleStylePreset = {
  id: string;
  label: string;
  description: string;
  style: {
    font: "sans" | "serif" | "mono" | "display";
    size: "sm" | "md" | "lg" | "xl";
    color: string;
    background: "none" | "solid" | "gradient" | "blur";
    position: "top" | "middle" | "bottom";
    uppercase: boolean;
    wordHighlight: boolean;
    highlightColor?: string;
    animation: "none" | "fade" | "pop" | "typewriter" | "karaoke" | "slide";
  };
};

export const SUBTITLE_STYLE_PRESETS: SubtitleStylePreset[] = [
  {
    id: "clean-minimal",
    label: "Clean Minimal",
    description: "White sans-serif on subtle blur — YouTube standard.",
    style: {
      font: "sans", size: "lg", color: "#ffffff", background: "blur",
      position: "bottom", uppercase: false, wordHighlight: false, animation: "fade",
    },
  },
  {
    id: "modern-bold",
    label: "Modern Bold",
    description: "Uppercase display font with pink accent per word.",
    style: {
      font: "display", size: "xl", color: "#ffffff", background: "solid",
      position: "bottom", uppercase: true, wordHighlight: true,
      highlightColor: "#ec4899", animation: "pop",
    },
  },
  {
    id: "karaoke-pop",
    label: "Karaoke Pop",
    description: "Per-word highlight that bounces with the beat.",
    style: {
      font: "display", size: "xl", color: "#f5f5f5", background: "none",
      position: "middle", uppercase: true, wordHighlight: true,
      highlightColor: "#f59e0b", animation: "karaoke",
    },
  },
  {
    id: "typewriter",
    label: "Typewriter",
    description: "Mono font, characters reveal one at a time.",
    style: {
      font: "mono", size: "md", color: "#e5e7eb", background: "solid",
      position: "bottom", uppercase: false, wordHighlight: false, animation: "typewriter",
    },
  },
  {
    id: "editorial-serif",
    label: "Editorial Serif",
    description: "Serif for interviews and documentaries.",
    style: {
      font: "serif", size: "lg", color: "#ffffff", background: "gradient",
      position: "bottom", uppercase: false, wordHighlight: false, animation: "fade",
    },
  },
  {
    id: "meme-caption",
    label: "Meme Caption",
    description: "Big top-of-screen impact-style caption.",
    style: {
      font: "display", size: "xl", color: "#ffffff", background: "none",
      position: "top", uppercase: true, wordHighlight: false, animation: "slide",
    },
  },
];

export function getStylePreset(id: string): SubtitleStylePreset {
  return SUBTITLE_STYLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_STYLE_PRESETS[0];
}
