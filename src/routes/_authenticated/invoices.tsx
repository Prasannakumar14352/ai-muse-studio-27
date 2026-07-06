import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyPayments } from "@/lib/razorpay.functions";
import { BRAND, SUPPORT_EMAIL } from "@/lib/constants";
import { Download, Receipt, CheckCircle2, Clock, XCircle, ArrowLeft } from "lucide-react";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
  errorComponent: ({ error, reset }) => (
    <div className="max-w-2xl mx-auto p-6 glass rounded-2xl mt-8">
      <h2 className="text-lg font-semibold text-red-400">Could not load invoices</h2>
      <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      <button onClick={reset} className="mt-4 px-4 py-2 rounded-lg gradient-primary text-white text-sm">Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-muted-foreground">Not found</div>,
});

type Payment = {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  pack_id: string;
  credits: number;
  amount_cents: number;
  currency: string;
  status: string;
  receipt_number: string | null;
  created_at: string;
};

function InvoicesPage() {
  const list = useServerFn(listMyPayments);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-payments"],
    queryFn: () => list(),
  });

  const payments = (data?.payments ?? []) as Payment[];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[color:var(--brand-orange)]" /> Invoices & Receipts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and download receipts for all your {BRAND} purchases.
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["my-payments"] })}
          className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10">
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Loading…</div>
      ) : payments.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center space-y-3">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">No payments yet.</p>
          <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-4 py-2 text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> Buy credits
          </Link>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Receipt #</th>
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-right px-4 py-3">Credits</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{p.receipt_number ?? "—"}</td>
                    <td className="px-4 py-3">{p.pack_id.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-right">{p.credits.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      ${(p.amount_cents / 100).toFixed(2)} {p.currency}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "success" ? (
                        <button
                          onClick={() => downloadReceiptPDF(p)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Need help with a charge? Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[color:var(--brand-orange)] hover:underline">{SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Paid
    </span>;
  }
  if (status === "failed") {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
      <XCircle className="w-3 h-3" /> Failed
    </span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
    <Clock className="w-3 h-3" /> Pending
  </span>;
}

function downloadReceiptPDF(p: Payment) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 60;

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(BRAND, 40, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
  doc.text("Digital Products Marketplace", 40, y + 16);
  doc.text(SUPPORT_EMAIL, 40, y + 30);

  doc.setFontSize(20); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text("RECEIPT", W - 40, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`# ${p.receipt_number ?? p.razorpay_order_id}`, W - 40, y + 16, { align: "right" });
  doc.text(new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), W - 40, y + 30, { align: "right" });

  y += 70;
  doc.setDrawColor(220); doc.line(40, y, W - 40, y);

  // Bill to / meta
  y += 30;
  doc.setTextColor(0); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Payment details", 40, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(80);
  y += 18;
  doc.text(`Order ID: ${p.razorpay_order_id}`, 40, y); y += 14;
  doc.text(`Payment ID: ${p.razorpay_payment_id ?? "—"}`, 40, y); y += 14;
  doc.text(`Status: ${p.status.toUpperCase()}`, 40, y);

  // Line item table
  y += 40;
  doc.setFillColor(245, 245, 250); doc.rect(40, y, W - 80, 26, "F");
  doc.setTextColor(60); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("DESCRIPTION", 50, y + 17);
  doc.text("CREDITS", W - 220, y + 17);
  doc.text("AMOUNT", W - 50, y + 17, { align: "right" });

  y += 40;
  doc.setFont("helvetica", "normal"); doc.setTextColor(0); doc.setFontSize(11);
  doc.text(`${p.pack_id.replace(/_/g, " ")} — ${BRAND} credit pack`, 50, y);
  doc.text(p.credits.toLocaleString(), W - 220, y);
  doc.text(`$${(p.amount_cents / 100).toFixed(2)} ${p.currency}`, W - 50, y, { align: "right" });

  y += 30; doc.setDrawColor(220); doc.line(40, y, W - 40, y);
  y += 25;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Total", W - 220, y);
  doc.text(`$${(p.amount_cents / 100).toFixed(2)} ${p.currency}`, W - 50, y, { align: "right" });

  // Footer
  y = doc.internal.pageSize.getHeight() - 80;
  doc.setDrawColor(230); doc.line(40, y, W - 40, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(130);
  doc.text(`Thank you for your purchase. For support, contact ${SUPPORT_EMAIL}`, W / 2, y + 20, { align: "center" });
  doc.text(`This is a system-generated receipt from ${BRAND}.`, W / 2, y + 34, { align: "center" });

  doc.save(`${BRAND}-receipt-${p.receipt_number ?? p.razorpay_order_id}.pdf`);
}
