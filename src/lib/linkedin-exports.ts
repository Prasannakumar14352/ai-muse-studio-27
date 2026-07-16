// Client-side export utilities for LinkedIn posts.
import jsPDF from "jspdf";

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadFile(name: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportTxt(name: string, body: string, meta?: { title?: string; hashtags?: string[]; cta?: string }) {
  const parts: string[] = [];
  if (meta?.title) parts.push(meta.title, "");
  parts.push(body);
  if (meta?.cta) parts.push("", meta.cta);
  if (meta?.hashtags?.length) parts.push("", meta.hashtags.join(" "));
  downloadFile(`${name}.txt`, parts.join("\n"), "text/plain");
}

export function exportMarkdown(name: string, body: string, meta?: { title?: string; hashtags?: string[]; cta?: string }) {
  const parts: string[] = [];
  if (meta?.title) parts.push(`# ${meta.title}`, "");
  parts.push(body);
  if (meta?.cta) parts.push("", `**${meta.cta}**`);
  if (meta?.hashtags?.length) parts.push("", meta.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  downloadFile(`${name}.md`, parts.join("\n"), "text/markdown");
}

// Minimal Word-openable .doc (HTML) — accepted by Word/Google Docs; keeps scope small.
export function exportDoc(name: string, body: string, meta?: { title?: string; hashtags?: string[]; cta?: string }) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(meta?.title ?? name)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;">
${meta?.title ? `<h1>${esc(meta.title)}</h1>` : ""}
${paras}
${meta?.cta ? `<p><strong>${esc(meta.cta)}</strong></p>` : ""}
${meta?.hashtags?.length ? `<p>${meta.hashtags.map((h) => esc(h.startsWith("#") ? h : "#" + h)).join(" ")}</p>` : ""}
</body></html>`;
  downloadFile(`${name}.doc`, html, "application/msword");
}

export function exportPdf(name: string, body: string, meta?: { title?: string; hashtags?: string[]; cta?: string }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  if (meta?.title) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    const lines = doc.splitTextToSize(meta.title, width);
    doc.text(lines, margin, y);
    y += lines.length * 22 + 12;
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  const paras = body.split(/\n{2,}/);
  for (const para of paras) {
    const lines = doc.splitTextToSize(para, width);
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y); y += 16;
    }
    y += 8;
  }

  if (meta?.cta) {
    if (y > doc.internal.pageSize.getHeight() - margin - 32) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(meta.cta, width);
    doc.text(lines, margin, y); y += lines.length * 16 + 8;
  }
  if (meta?.hashtags?.length) {
    if (y > doc.internal.pageSize.getHeight() - margin - 32) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "italic"); doc.setTextColor(80);
    const tags = meta.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ");
    const lines = doc.splitTextToSize(tags, width);
    doc.text(lines, margin, y);
  }

  doc.save(`${name}.pdf`);
}
