/**
 * Small, safe Markdown renderer for deliverables: headings, paragraphs,
 * bullet and numbered lists, block quotes, fenced code, pipe tables and
 * inline bold / code. HTML in the source is escaped first, so artifacts can
 * never inject markup into Mission Control. Links are shown as text.
 */
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
  const lines = esc(src).split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDivider = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) {
      i += 1;
      continue;
    }
    // Fenced code
    if (/^```/.test(t)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }
    // Table
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) {
        rows.push(cells(lines[i]!));
        i += 1;
      }
      out.push(
        `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, idx) => `<td>${inline(r[idx] ?? "")}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    // Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
      i += 1;
      continue;
    }
    // Block quote (consecutive lines)
    if (t.startsWith("&gt;")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("&gt;")) {
        buf.push(lines[i]!.trim().replace(/^&gt;\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    // Lists
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]!)) {
        items.push(lines[i]!.replace(re, ""));
        i += 1;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((l) => `<li>${inline(l)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    // Paragraph: consecutive plain lines
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!;
      const lt = l.trim();
      if (!lt || /^```/.test(lt) || /^#{1,4}\s/.test(lt) || lt.startsWith("&gt;") || /^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || (isTableRow(l) && i + 1 < lines.length && isDivider(lines[i + 1]!))) break;
      buf.push(lt);
      i += 1;
    }
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("");
}
