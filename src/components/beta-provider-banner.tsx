import { AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * Displayed at the top of any module whose production provider is not
 * configured. Users see WHY they can't fully use it, admins get a link to
 * the readiness dashboard where the actual capability status lives.
 */
export function BetaProviderBanner({
  featureLabel,
  reason,
  isAdmin,
}: {
  featureLabel: string;
  reason: string;
  isAdmin?: boolean;
}) {
  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="flex-1 space-y-1 text-sm">
          <div className="font-semibold text-amber-100">
            {featureLabel} is in Beta
          </div>
          <p className="text-amber-100/80">
            A production provider is not configured, so generation is disabled to
            avoid returning mock output. {reason}
          </p>
          {isAdmin ? (
            <Link
              to="/admin/readiness"
              className="mt-1 inline-block text-xs font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              Open Feature Readiness
            </Link>
          ) : (
            <p className="text-xs text-amber-100/60">
              Contact your workspace admin to enable this feature.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
