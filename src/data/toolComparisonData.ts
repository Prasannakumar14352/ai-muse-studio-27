// Tool comparison data for landing page.
// Statuses are reviewed manually — update `LAST_REVIEWED` when changing entries.
// CreatorFlow AI statuses reflect current in-app functionality; competitor
// statuses reflect publicly available product capabilities as of the review
// date. This is not endorsed by or affiliated with any listed vendor.

export type ComparisonStatus =
  | "available"
  | "through_chat"
  | "limited"
  | "beta"
  | "coming_soon"
  | "not_available"
  | "not_core";

export type ComparisonCategory =
  | "writing"
  | "social"
  | "image"
  | "video"
  | "voice"
  | "branding"
  | "workflow"
  | "publishing";

export type ComparisonTool = {
  id: string;
  name: string;
  description?: string;
  lastVerifiedAt: string;
  active: boolean;
  displayOrder: number;
  isPrimary?: boolean;
};

export type ComparisonCapability = {
  id: string;
  name: string;
  shortDescription: string;
  category: ComparisonCategory;
  displayOrder: number;
  active: boolean;
};

export type ToolCapabilityStatus = {
  toolId: string;
  capabilityId: string;
  status: ComparisonStatus;
  explanation: string;
  sourceLabel?: string;
};

export const LAST_REVIEWED = "July 2026";

export const COMPARISON_TOOLS: ComparisonTool[] = [
  { id: "creatorflow", name: "CreatorFlow AI", description: "Creator workspace", lastVerifiedAt: LAST_REVIEWED, active: true, displayOrder: 1, isPrimary: true },
  { id: "chatgpt", name: "ChatGPT", description: "General-purpose AI assistant", lastVerifiedAt: LAST_REVIEWED, active: true, displayOrder: 2 },
  { id: "canva", name: "Canva", description: "Design & content platform", lastVerifiedAt: LAST_REVIEWED, active: true, displayOrder: 3 },
  { id: "invideo", name: "InVideo", description: "AI video creation", lastVerifiedAt: LAST_REVIEWED, active: true, displayOrder: 4 },
  { id: "capcut", name: "CapCut", description: "Video editor", lastVerifiedAt: LAST_REVIEWED, active: true, displayOrder: 5 },
];

export const COMPARISON_CAPABILITIES: ComparisonCapability[] = [
  { id: "ai_chat", name: "General AI chat", shortDescription: "Open-ended conversational assistant.", category: "writing", displayOrder: 1, active: true },
  { id: "long_writing", name: "Long-form writing", shortDescription: "Articles, essays, structured long text.", category: "writing", displayOrder: 2, active: true },
  { id: "linkedin_workflow", name: "Dedicated LinkedIn post workflow", shortDescription: "End-to-end LinkedIn post generation with hooks, variations and preview.", category: "social", displayOrder: 3, active: true },
  { id: "social_captions", name: "Social caption generation", shortDescription: "Platform-tuned captions and hashtags.", category: "social", displayOrder: 4, active: true },
  { id: "carousel_workflow", name: "Dedicated carousel workflow", shortDescription: "Structured multi-slide carousel generation and editing.", category: "social", displayOrder: 5, active: true },
  { id: "image_gen", name: "Image generation", shortDescription: "Generate images from a text prompt.", category: "image", displayOrder: 6, active: true },
  { id: "image_edit", name: "Image editing", shortDescription: "Edit uploaded images (inpaint, background, etc.).", category: "image", displayOrder: 7, active: true },
  { id: "thumbnails", name: "Thumbnail creation", shortDescription: "Produce complete YouTube / Shorts thumbnails.", category: "image", displayOrder: 8, active: true },
  { id: "ai_video", name: "AI video generation", shortDescription: "Prompt-to-video with scenes, preview and download.", category: "video", displayOrder: 9, active: true },
  { id: "short_video", name: "Short-form video workflow", shortDescription: "Reels / Shorts / TikTok end-to-end workflow.", category: "video", displayOrder: 10, active: true },
  { id: "long_video", name: "Long-form video workflow", shortDescription: "Full long-video production pipeline.", category: "video", displayOrder: 11, active: true },
  { id: "script", name: "Script generation", shortDescription: "Video and content scripts.", category: "writing", displayOrder: 12, active: true },
  { id: "voiceover", name: "AI voiceover", shortDescription: "Generate and export voiceover audio.", category: "voice", displayOrder: 13, active: true },
  { id: "video_edit", name: "Video editing", shortDescription: "Trim, arrange, and refine video scenes.", category: "video", displayOrder: 14, active: true },
  { id: "brand_kit", name: "Brand Kit / presets", shortDescription: "Save brand name, logo, colors, fonts, voice.", category: "branding", displayOrder: 15, active: true },
  { id: "projects", name: "Saved projects", shortDescription: "Save, reopen and manage generations.", category: "workflow", displayOrder: 16, active: true },
  { id: "media_library", name: "Generated media library", shortDescription: "Central library of past generations.", category: "workflow", displayOrder: 17, active: true },
  { id: "seo_pack", name: "SEO content package", shortDescription: "Structured SEO deliverables (title, meta, outline, body).", category: "writing", displayOrder: 18, active: true },
  { id: "social_planning", name: "Social content planning", shortDescription: "Calendar / planner for social content.", category: "publishing", displayOrder: 19, active: true },
  { id: "social_publish", name: "Direct social scheduling & publishing", shortDescription: "Connect accounts and publish/schedule directly.", category: "publishing", displayOrder: 20, active: true },
  { id: "unified_workflow", name: "Unified creator workflow", shortDescription: "Writing + visuals + video + publishing in one place.", category: "workflow", displayOrder: 21, active: true },
  { id: "design_editor", name: "Advanced manual design editor", shortDescription: "Visual drag-and-drop design editor.", category: "image", displayOrder: 22, active: true },
  { id: "timeline_editor", name: "Advanced timeline video editor", shortDescription: "Multi-track timeline video editing.", category: "video", displayOrder: 23, active: true },
];

// Helper to define statuses concisely.
const S = (
  toolId: string,
  capabilityId: string,
  status: ComparisonStatus,
  explanation: string,
  sourceLabel?: string,
): ToolCapabilityStatus => ({ toolId, capabilityId, status, explanation, sourceLabel });

export const TOOL_CAPABILITY_STATUSES: ToolCapabilityStatus[] = [
  // 1. General AI chat
  S("creatorflow", "ai_chat", "coming_soon", "No dedicated always-on chat surface yet; assistants are embedded in specific modules."),
  S("chatgpt", "ai_chat", "available", "Core product capability.", "chatgpt.com"),
  S("canva", "ai_chat", "limited", "AI features are embedded in design workflows rather than a general chat.", "canva.com"),
  S("invideo", "ai_chat", "limited", "AI is scoped to video creation prompts.", "invideo.io"),
  S("capcut", "ai_chat", "limited", "AI features are scoped to editing.", "capcut.com"),

  // 2. Long-form writing
  S("creatorflow", "long_writing", "beta", "Structured long-form drafts via strategy / LinkedIn modules; a dedicated long-form editor is still maturing."),
  S("chatgpt", "long_writing", "available", "Strong general writing capability.", "chatgpt.com"),
  S("canva", "long_writing", "available", "Magic Write supports long-form content in Docs.", "canva.com"),
  S("invideo", "long_writing", "limited", "Text generation is scoped to scripts.", "invideo.io"),
  S("capcut", "long_writing", "limited", "Text generation is scoped to captions and scripts.", "capcut.com"),

  // 3. LinkedIn workflow
  S("creatorflow", "linkedin_workflow", "available", "Dedicated LinkedIn Content Studio: 20+ post types, hooks, variations, brand voice, per-section regeneration and preview."),
  S("chatgpt", "linkedin_workflow", "through_chat", "You can generate LinkedIn copy via prompts, but there is no dedicated LinkedIn workflow.", "chatgpt.com"),
  S("canva", "linkedin_workflow", "limited", "LinkedIn design templates are available; not a dedicated post-writing workflow.", "canva.com"),
  S("invideo", "linkedin_workflow", "not_core", "Focused on video, not LinkedIn text posts."),
  S("capcut", "linkedin_workflow", "not_core", "Focused on video editing."),

  // 4. Social captions
  S("creatorflow", "social_captions", "available", "Captions module generates platform-tuned captions, hashtags and CTAs."),
  S("chatgpt", "social_captions", "through_chat", "Captions generated via chat prompts.", "chatgpt.com"),
  S("canva", "social_captions", "available", "Magic Write generates captions inside social designs.", "canva.com"),
  S("invideo", "social_captions", "limited", "Captions generated inside video workflows."),
  S("capcut", "social_captions", "limited", "Caption generation is tied to video editing."),

  // 5. Carousel
  S("creatorflow", "carousel_workflow", "available", "Dedicated Carousel Studio: slide reordering, per-slide AI edits, brand kit, PDF/PNG export."),
  S("chatgpt", "carousel_workflow", "through_chat", "Can produce carousel copy and images; no slide-layout editor.", "chatgpt.com"),
  S("canva", "carousel_workflow", "available", "Strong carousel design and editing.", "canva.com"),
  S("invideo", "carousel_workflow", "not_core", "Not a slide/carousel tool."),
  S("capcut", "carousel_workflow", "limited", "Some slide-style templates via image workflows."),

  // 6. Image gen
  S("creatorflow", "image_gen", "available", "Image Studio generates images with prompts, references, batch and style controls."),
  S("chatgpt", "image_gen", "available", "Built-in image generation.", "chatgpt.com"),
  S("canva", "image_gen", "available", "Magic Media generates images.", "canva.com"),
  S("invideo", "image_gen", "available", "AI visuals inside video workflows."),
  S("capcut", "image_gen", "available", "AI image generation is available."),

  // 7. Image edit
  S("creatorflow", "image_edit", "beta", "Inpaint, outpaint, background removal and magic eraser are available; some ops depend on provider availability."),
  S("chatgpt", "image_edit", "available", "Image editing supported.", "chatgpt.com"),
  S("canva", "image_edit", "available", "Comprehensive image editing tools.", "canva.com"),
  S("invideo", "image_edit", "limited", "Editing is scoped to video assets."),
  S("capcut", "image_edit", "available", "Strong image editing feature set.", "capcut.com"),

  // 8. Thumbnails
  S("creatorflow", "thumbnails", "available", "Thumbnail Studio supports 16:9 and 9:16 with universal prompts, subject reference and quality analysis."),
  S("chatgpt", "thumbnails", "through_chat", "Thumbnails via image generation prompts.", "chatgpt.com"),
  S("canva", "thumbnails", "available", "Extensive thumbnail templates.", "canva.com"),
  S("invideo", "thumbnails", "limited", "Thumbnail creation is secondary to video."),
  S("capcut", "thumbnails", "available", "Thumbnail templates and editing."),

  // 9. AI video generation
  S("creatorflow", "ai_video", "beta", "Promo Video Generator and Video Studio produce scene plans and clips; final assembled downloadable video is still stabilising."),
  S("chatgpt", "ai_video", "limited", "Video generation is not a core standalone product surface."),
  S("canva", "ai_video", "available", "Magic Media video generation.", "canva.com"),
  S("invideo", "ai_video", "available", "Core capability.", "invideo.io"),
  S("capcut", "ai_video", "available", "AI video generation features.", "capcut.com"),

  // 10. Short-form
  S("creatorflow", "short_video", "beta", "Guided short-video workflow exists; end-to-end reliability still improving."),
  S("chatgpt", "short_video", "limited", "Can assist with ideation and scripts."),
  S("canva", "short_video", "available", "Reels/Shorts templates and editing.", "canva.com"),
  S("invideo", "short_video", "available", "Dedicated short-video workflows.", "invideo.io"),
  S("capcut", "short_video", "available", "Purpose-built for short video.", "capcut.com"),

  // 11. Long-form video
  S("creatorflow", "long_video", "beta", "Long-video studio scaffolding exists; full end-to-end long-video render is still maturing."),
  S("chatgpt", "long_video", "limited", "Useful for planning and scripts, not end-to-end production."),
  S("canva", "long_video", "limited", "Long-video editing exists but is not the focus."),
  S("invideo", "long_video", "available", "Long-video workflows supported.", "invideo.io"),
  S("capcut", "long_video", "available", "Long-video editing is supported.", "capcut.com"),

  // 12. Script generation
  S("creatorflow", "script", "available", "Script generation is used across video, promo and strategy modules."),
  S("chatgpt", "script", "available", "Strong script writing via prompts.", "chatgpt.com"),
  S("canva", "script", "available", "Magic Write scripts.", "canva.com"),
  S("invideo", "script", "available", "Built-in AI script generation.", "invideo.io"),
  S("capcut", "script", "available", "Script generator available.", "capcut.com"),

  // 13. Voiceover
  S("creatorflow", "voiceover", "beta", "TTS voiceover endpoint exists; production-grade voice library and export flow are still expanding."),
  S("chatgpt", "voiceover", "limited", "Voice mode is conversational, not a dedicated exportable voiceover producer."),
  S("canva", "voiceover", "limited", "Voiceover options exist inside designs.", "canva.com"),
  S("invideo", "voiceover", "available", "Native AI voice generation.", "invideo.io"),
  S("capcut", "voiceover", "available", "AI voice / TTS is a native feature.", "capcut.com"),

  // 14. Video editing
  S("creatorflow", "video_edit", "limited", "Scene / timeline editor is available for AI-generated clips; not a general-purpose editor."),
  S("chatgpt", "video_edit", "not_core", "Not a video editor."),
  S("canva", "video_edit", "available", "Full video editor.", "canva.com"),
  S("invideo", "video_edit", "available", "Native video editing.", "invideo.io"),
  S("capcut", "video_edit", "available", "Industry-leading consumer video editor.", "capcut.com"),

  // 15. Brand kit
  S("creatorflow", "brand_kit", "available", "Brand Kit stores logo, colors, fonts, voice and CTA; auto-injected into generations."),
  S("chatgpt", "brand_kit", "limited", "Brand context via Projects and custom instructions.", "chatgpt.com"),
  S("canva", "brand_kit", "available", "Comprehensive Brand Kit.", "canva.com"),
  S("invideo", "brand_kit", "limited", "Brand presets available on higher plans."),
  S("capcut", "brand_kit", "limited", "Brand kit features are available on business plans."),

  // 16. Projects
  S("creatorflow", "projects", "available", "Projects can be saved, reopened and managed."),
  S("chatgpt", "projects", "available", "ChatGPT Projects.", "chatgpt.com"),
  S("canva", "projects", "available", "Designs and folders.", "canva.com"),
  S("invideo", "projects", "available", "Project management is native."),
  S("capcut", "projects", "available", "Project management is native."),

  // 17. Media library
  S("creatorflow", "media_library", "available", "Asset Library stores generated images, videos, logos and documents."),
  S("chatgpt", "media_library", "limited", "Media is scoped to conversations."),
  S("canva", "media_library", "available", "Uploads and media library.", "canva.com"),
  S("invideo", "media_library", "available", "Media library is native."),
  S("capcut", "media_library", "available", "Media library is native."),

  // 18. SEO pack
  S("creatorflow", "seo_pack", "beta", "SEO-oriented outputs exist across modules; a dedicated structured SEO package is still being formalised."),
  S("chatgpt", "seo_pack", "through_chat", "SEO deliverables via prompts.", "chatgpt.com"),
  S("canva", "seo_pack", "limited", "Limited SEO tooling."),
  S("invideo", "seo_pack", "not_core", "Not an SEO tool."),
  S("capcut", "seo_pack", "not_core", "Not an SEO tool."),

  // 19. Social planning
  S("creatorflow", "social_planning", "available", "Content Calendar with monthly view, drafts and queue."),
  S("chatgpt", "social_planning", "limited", "Planning is only through prompts."),
  S("canva", "social_planning", "available", "Content Planner.", "canva.com"),
  S("invideo", "social_planning", "limited", "Planning is not a core feature."),
  S("capcut", "social_planning", "limited", "Planning is not a core feature."),

  // 20. Social publish
  S("creatorflow", "social_publish", "coming_soon", "OAuth connections and scheduled-publish pipeline exist; end-to-end publishing is still stabilising."),
  S("chatgpt", "social_publish", "not_core", "Not a publishing tool."),
  S("canva", "social_publish", "available", "Direct publishing via Content Planner.", "canva.com"),
  S("invideo", "social_publish", "limited", "Publishing is limited."),
  S("capcut", "social_publish", "limited", "Publishing is limited outside TikTok integrations."),

  // 21. Unified workflow
  S("creatorflow", "unified_workflow", "available", "Writing, visuals, video, calendar and publishing live in one workspace tuned for creators."),
  S("chatgpt", "unified_workflow", "limited", "A general assistant, not a creator workflow."),
  S("canva", "unified_workflow", "available", "Unified design and content workflow.", "canva.com"),
  S("invideo", "unified_workflow", "available", "Unified for video workflows."),
  S("capcut", "unified_workflow", "available", "Unified for video workflows."),

  // 22. Design editor
  S("creatorflow", "design_editor", "not_available", "No general-purpose visual design editor."),
  S("chatgpt", "design_editor", "not_core", "Not a design editor."),
  S("canva", "design_editor", "available", "Industry-leading design editor.", "canva.com"),
  S("invideo", "design_editor", "limited", "Design capabilities are inside video scenes."),
  S("capcut", "design_editor", "available", "Strong creative editor.", "capcut.com"),

  // 23. Timeline editor
  S("creatorflow", "timeline_editor", "limited", "Scene-level timeline exists for AI clips; not a full multi-track editor."),
  S("chatgpt", "timeline_editor", "not_core", "Not a video editor."),
  S("canva", "timeline_editor", "available", "Timeline video editor.", "canva.com"),
  S("invideo", "timeline_editor", "available", "Timeline editing supported.", "invideo.io"),
  S("capcut", "timeline_editor", "available", "Full timeline editor.", "capcut.com"),
];

export const COMPARISON_CATEGORIES: { id: ComparisonCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "writing", label: "Writing" },
  { id: "social", label: "Social Content" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "voice", label: "Voice" },
  { id: "branding", label: "Branding" },
  { id: "workflow", label: "Workflow" },
  { id: "publishing", label: "Publishing" },
];

export function getStatus(toolId: string, capabilityId: string): ToolCapabilityStatus | undefined {
  return TOOL_CAPABILITY_STATUSES.find((s) => s.toolId === toolId && s.capabilityId === capabilityId);
}

// Roughly equivalent status groups, used for the "Show differences only" toggle.
const EQUIVALENCE_GROUP: Record<ComparisonStatus, number> = {
  available: 3,
  through_chat: 2,
  limited: 2,
  beta: 2,
  coming_soon: 1,
  not_available: 0,
  not_core: 0,
};

export function statusesRoughlyEqual(a: ComparisonStatus, b: ComparisonStatus): boolean {
  return EQUIVALENCE_GROUP[a] === EQUIVALENCE_GROUP[b];
}
