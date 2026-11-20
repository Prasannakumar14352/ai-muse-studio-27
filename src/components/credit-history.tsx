// Billing → Credit history: date, what it was for, credits, balance after.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { listMyCreditHistory } from "@/lib/credit-history.functions";

export function CreditHistory() {
  const fn = useServerFn(listMyCreditHistory);
  const q = useInfiniteQuery({
    queryKey: ["credit-history"],
    queryFn: ({ pageParam }) => fn({ data: pageParam ? { before: pageParam } : {} }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });
  const rows = (q.data?.pages ?? []).flatMap((p) => p.rows);

  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="font-semibold flex items-center gap-2"><History className="w-4 h-4" /> Credit history</h2>
      <p className="text-xs text-muted-foreground mt-1">Every credit spent, refunded or added. Failed generations are refunded automatically.</p>
      {q.isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : !rows.length ? (
        <div className="text-sm text-muted-foreground py-6 text-center">No credit activity yet.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium text-right">Credits</th>
                <th className="py-2 font-medium text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/20">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{new Date(r.at).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    {r.label}
                    {r.status === "refunded" && <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">refunded</span>}
                    {r.status === "reserved" && <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">in progress</span>}
                  </td>
                  <td className={`py-2 pr-3 text-right font-medium ${r.credits > 0 ? "text-emerald-300" : r.credits < 0 ? "" : "text-muted-foreground"}`}>
                    {r.credits > 0 ? `+${r.credits.toLocaleString()}` : r.credits < 0 ? `−${Math.abs(r.credits).toLocaleString()}` : "0"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{r.balanceAfter === null ? "—" : r.balanceAfter.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.hasNextPage && (
            <button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}
              className="mt-3 text-xs rounded-lg glass border border-border px-3 py-1.5 disabled:opacity-60">
              {q.isFetchingNextPage ? "Loading…" : "Show older"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
