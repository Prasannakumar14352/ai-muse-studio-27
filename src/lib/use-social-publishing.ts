// True once an admin has configured and enabled at least one social provider
// (Meta, Google or LinkedIn) in Admin → Social Publishing.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProviderAvailability } from "@/lib/oauth-user.functions";

export function useSocialPublishingAvailable(): boolean {
  const fn = useServerFn(listProviderAvailability);
  const { data } = useQuery({
    queryKey: ["provider-availability"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  return (data ?? []).some((p) => p.available);
}
