import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";

type Generation = {
  id: string;
  status: string;
  created_at: string;
  ledger_id: string | null;
  provider_request_id: string | null;
  output_url?: string | null;
  storage_path?: string | null;
  model_id?: string;
  track?: string;
};

export const listVideoReconciliation = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const [video, audio] = await Promise.all([
      db
        .from("model_generations")
        .select("id,model_id,status,created_at,ledger_id,provider_request_id,output_url")
        .not("motion_request_key", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("video_audio_generations")
        .select("id,track,status,created_at,ledger_id,provider_request_id,storage_path")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (video.error || audio.error)
      throw new Error("Could not load the video reconciliation snapshot");
    const assets = [
      ...((video.data ?? []) as Generation[]),
      ...((audio.data ?? []) as Generation[]),
    ];
    const ledgerIds = assets.flatMap((asset) => (asset.ledger_id ? [asset.ledger_id] : []));
    const ledger = ledgerIds.length
      ? await supabaseAdmin
          .from("credit_ledger")
          .select("id,status,credits_reserved,credits_charged,credits_refunded")
          .in("id", ledgerIds)
      : { data: [], error: null };
    if (ledger.error) throw new Error("Could not load credit settlement states");
    const byId = new Map(ledger.data?.map((row) => [row.id, row]));
    return assets
      .map((asset) => ({
        id: asset.id,
        kind: asset.model_id ?? asset.track ?? "audio",
        state: asset.status,
        providerRequestId: asset.provider_request_id,
        assetStored: Boolean(asset.storage_path || asset.output_url),
        createdAt: asset.created_at,
        requiresReconciliation:
          asset.status === "uncertain" ||
          (asset.status === "queued" &&
            !asset.provider_request_id &&
            Date.now() - Date.parse(asset.created_at) > 60_000),
        ledger: asset.ledger_id ? (byId.get(asset.ledger_id) ?? null) : null,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
