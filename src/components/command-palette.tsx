import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import {
  LayoutDashboard, Film, Megaphone, Layers, Image as ImageIcon, Sparkles, Type,
  Bot, Palette, Library, Store, Target, Search, Calendar as CalendarIcon,
  Plug, Linkedin, Wallet, CreditCard, Receipt, Settings, BarChart3, Crown,
  Split, FolderKanban, Plus, LogOut,
} from "lucide-react";
import { isHiddenPath } from "@/lib/hidden-features";

type Intent = {
  label: string;
  hint?: string;
  icon: typeof LayoutDashboard;
  to: string;
  keywords?: string;
  shortcut?: string;
};

const NAV: Intent[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", keywords: "home overview" },
  { label: "Projects", icon: FolderKanban, to: "/videos", keywords: "all projects list" },
  { label: "AI Studio", icon: Bot, to: "/create", keywords: "create new project studio" },
  { label: "Research", icon: Search, to: "/research", keywords: "viral trends research" },
  { label: "AI Strategy", icon: Target, to: "/strategy", keywords: "strategy plan" },
  { label: "Planner", icon: CalendarIcon, to: "/calendar", keywords: "calendar schedule planner" },
  { label: "Brand Kit", icon: Palette, to: "/brand-kit", keywords: "brand identity colors logo" },
  { label: "Media Library", icon: Library, to: "/library", keywords: "assets library media files" },
  { label: "Publish / Connections", icon: Plug, to: "/connections", keywords: "publish social accounts" },
  { label: "Analytics", icon: BarChart3, to: "/analytics", keywords: "stats performance" },
  { label: "Marketplace", icon: Store, to: "/marketplace", keywords: "templates marketplace" },
  { label: "Settings", icon: Settings, to: "/settings", keywords: "preferences" },
  { label: "Billing", icon: Wallet, to: "/billing" },
  { label: "Invoices", icon: Receipt, to: "/invoices" },
  { label: "Pricing", icon: CreditCard, to: "/pricing", keywords: "upgrade plan" },
];

const CREATE: Intent[] = [
  { label: "Create Video", hint: "Long-form YouTube video", icon: Film, to: "/videos", keywords: "youtube long video generate" },
  { label: "Create Reel / Short", hint: "9:16 short video", icon: Film, to: "/videos", keywords: "short reel tiktok instagram" },
  { label: "Create Promo Video", hint: "Ad / promo clip", icon: Megaphone, to: "/promo-videos", keywords: "ad promo commercial" },
  { label: "Create Carousel", hint: "LinkedIn / IG carousel", icon: Layers, to: "/carousels", keywords: "carousel slides linkedin instagram" },
  { label: "Create Thumbnail", hint: "YouTube thumbnail", icon: Sparkles, to: "/thumbnails", keywords: "thumbnail youtube ctr" },
  { label: "Generate Image", hint: "AI image generation", icon: ImageIcon, to: "/images", keywords: "image ai generate" },
  { label: "Write Blog / SEO", hint: "SEO content package", icon: Type, to: "/seo", keywords: "blog seo article" },
  { label: "Write Caption", hint: "Social captions", icon: Type, to: "/captions", keywords: "caption hashtags" },
  { label: "LinkedIn Post", hint: "AI LinkedIn studio", icon: Linkedin, to: "/linkedin-posts", keywords: "linkedin post" },
  { label: "Voice Over", hint: "AI voiceover", icon: Bot, to: "/videos", keywords: "voice tts narration" },
  { label: "Repurpose Content", icon: Split, to: "/repurpose" },
  { label: "New Project", icon: Plus, to: "/create", shortcut: "N" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: access } = useAccess();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handler);
    const openEvt = () => setOpen(true);
    window.addEventListener("cf:open-command-palette" as never, openEvt);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("cf:open-command-palette" as never, openEvt);
    };
  }, []);

  const { data: recentProjects } = useQuery({
    enabled: open,
    queryKey: ["cmdk-recent-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, content_type")
        .order("updated_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  function go(to: string, params?: Record<string, string>) {
    setOpen(false);
    // Use navigate for both simple and dynamic routes.
    if (params) navigate({ to: to as never, params } as never);
    else navigate({ to: to as never });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search — try 'create a YouTube video'…" />
      <CommandList>
        <CommandEmpty>No results. Try “video”, “thumbnail”, “carousel”…</CommandEmpty>

        <CommandGroup heading="Create">
          {CREATE.filter((c) => !isHiddenPath(c.to)).map((c) => (
            <CommandItem key={c.label} value={`create ${c.label} ${c.keywords ?? ""}`} onSelect={() => go(c.to)}>
              <c.icon className="mr-2 h-4 w-4 text-[color:var(--brand-orange)]" />
              <span className="flex-1">{c.label}</span>
              {c.hint && <span className="text-xs text-muted-foreground ml-2">{c.hint}</span>}
              {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {NAV.filter((n) => !isHiddenPath(n.to)).map((n) => (
            <CommandItem key={n.to + n.label} value={`go ${n.label} ${n.keywords ?? ""}`} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              <span>{n.label}</span>
            </CommandItem>
          ))}
          {access?.isAdmin && (
            <CommandItem value="admin panel" onSelect={() => go("/admin")}>
              <Crown className="mr-2 h-4 w-4 text-amber-400" />
              <span>Admin Panel</span>
            </CommandItem>
          )}
        </CommandGroup>

        {recentProjects && recentProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent projects">
              {recentProjects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.title}`}
                  onSelect={() => go("/projects/$id", { id: p.id })}
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{p.title}</span>
                  {p.content_type && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.content_type}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem value="sign out logout" onSelect={async () => {
            setOpen(false);
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("cf:open-command-palette"));
}
