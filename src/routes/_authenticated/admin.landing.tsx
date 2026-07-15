import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { useAccess } from "@/lib/access";
import { VIDEO_TESTIMONIALS } from "@/lib/landing-content";

export const Route = createFileRoute("/_authenticated/admin/landing")({
  component: AdminLanding,
});

function AdminLanding() {
  const { data: access, isLoading } = useAccess();
  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin</div>
          <h1 className="text-2xl font-bold">Landing page media</h1>
        </div>
        <Link to="/admin" className="glass rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </Link>
      </div>

      <div className="glass rounded-2xl p-6 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Read-only overview</div>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              The landing-page demo is an <strong>interactive product walkthrough</strong> built from live CreatorFlow AI UI
              components — no MP4 file to upload or replace. The video testimonials below are currently pulled from
              <code className="px-1 rounded bg-black/30 mx-1">src/lib/landing-content.ts</code>. Full CRUD (upload posters, swap
              MP4/YouTube/Vimeo URLs, publish/unpublish, reorder) is scaffolded to move to a database-backed CMS —
              tell us to wire it up and we'll add the tables + upload UI.
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Current video testimonials</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="text-left">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role · Company</th>
                <th className="py-2 pr-4">Country</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Duration</th>
                <th className="py-2 pr-4">Video URL</th>
              </tr>
            </thead>
            <tbody>
              {VIDEO_TESTIMONIALS.map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-2 pr-4 font-medium">{t.name}</td>
                  <td className="py-2 pr-4">{t.role}{t.company ? ` · ${t.company}` : ""}</td>
                  <td className="py-2 pr-4">{t.country}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                      t.source === "customer" ? "bg-emerald-500/20 text-emerald-300" :
                      t.source === "demo" ? "bg-sky-500/20 text-sky-300" :
                      "bg-amber-500/20 text-amber-300"
                    }`}>
                      {t.source ?? "sample"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{t.duration ?? "—"}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[280px]">
                    {t.videoUrl ?? <span className="italic opacity-60">not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
