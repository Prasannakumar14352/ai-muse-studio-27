import { showcaseMetadata, showcaseTemplate } from "./showcase-template";

const ideas = [
  [
    "Hanuman — The Awakening of Divine Power",
    "Indian Mythology",
    "English",
    "indian_mythology",
    "Follow Hanuman from the mountain to the ocean and reveal Lanka at dawn. Depict the tradition respectfully.",
  ],
  [
    "The Little Village Hero — Telugu 3D Story",
    "Telugu Stories",
    "Telugu",
    "3d",
    "Tell an original Telugu story about a child helping their village before monsoon season.",
  ],
  [
    "India in 2100 — Future Documentary",
    "Future Documentary",
    "English",
    "futuristic",
    "Make a speculative future documentary about water, transit, and architecture. Label predictions as scenarios.",
  ],
  [
    "Premium Product Commercial",
    "Product Advertisements",
    "English",
    "minimal_product",
    "Reveal an unbranded ceramic travel mug through tactile macro shots and a daily use scene.",
  ],
  [
    "Beyond the Mountains — Epic Fantasy",
    "Epic Fantasy",
    "English",
    "epic_fantasy",
    "An original mountain expedition discovers a bridge of light during the last hours of twilight.",
  ],
  [
    "The Last Frontier — Science Fiction",
    "Science Fiction",
    "English",
    "cyberpunk",
    "An original deep-space crew follows a silent beacon to an abandoned orbital station.",
  ],
  [
    "The Forgotten Kingdom — Historical Documentary",
    "Historical Documentary",
    "English",
    "documentary",
    "Explore an ancient fictional kingdom through a documentary-style reconstruction. Clearly label fiction.",
  ],
  [
    "The Midnight Mystery — Suspense Story",
    "Horror and Mystery",
    "English",
    "dark_mystery",
    "A night courier follows a chain of clues in an empty station. Build tension through sound and shadows.",
  ],
] as const;

export const showcaseStarterDrafts = ideas.map(([title, category, language, style, prompt]) => ({
  title,
  prompt,
  showcase_metadata: showcaseMetadata.parse({
    categories: [category],
    language,
    description: prompt,
    promptKind: "example",
    template: showcaseTemplate.parse({
      version: 1,
      topic: title,
      style,
      duration: 30,
      aspectRatio: "16:9",
      language,
      motionMode: "key",
      motionModel: "standard",
      visualInstructions: prompt,
      resolution: "1080p",
      fps: 24,
    }),
  }),
}));
