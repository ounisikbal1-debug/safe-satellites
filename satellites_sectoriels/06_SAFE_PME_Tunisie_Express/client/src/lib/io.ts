// ── Import / Export : CSV, Excel (.xlsx) et PDF ──────────────────────────────
// Tout se fait côté navigateur : aucun serveur, aucun envoi de fichier.
//  · CSV   — natif, séparateur « ; » (convention française) + BOM UTF-8
//  · Excel — classeur .xlsx réel (SpreadsheetML), pas un CSV renommé
//  · PDF   — document imprimable mis en page, via la boîte d'impression
import * as XLSX from "xlsx";

export type Column<T> = {
  key: string;
  label: string;
  /** Valeur brute pour l'export (nombre, date ISO, texte). */
  value: (row: T) => string | number | null | undefined;
  /** Valeur affichée dans le PDF (par défaut : la valeur brute). */
  display?: (row: T) => string;
  /** Format numérique Excel. */
  numFmt?: string;
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cellText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Échappe une valeur pour le CSV (guillemets doublés, séparateur protégé). */
function csvCell(v: string | number | null | undefined): string {
  const s = cellText(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Export CSV ───────────────────────────────────────────────────────────────
export function exportCsv<T>(rows: T[], columns: Column<T>[], basename: string) {
  const head = columns.map((c) => csvCell(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(";")).join("\r\n");
  // BOM : Excel ouvre l'UTF-8 correctement, accents compris.
  const blob = new Blob(["\uFEFF" + head + "\r\n" + body], { type: "text/csv;charset=utf-8;" });
  download(blob, `${basename}_${stamp()}.csv`);
}

// ── Export Excel ─────────────────────────────────────────────────────────────
export function exportExcel<T>(rows: T[], columns: Column<T>[], basename: string, sheetName = "Données") {
  const aoa: (string | number)[][] = [columns.map((c) => c.label)];
  for (const r of rows) {
    aoa.push(
      columns.map((c) => {
        const v = c.value(r);
        return v === null || v === undefined ? "" : v;
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(38, c.label.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${basename}_${stamp()}.xlsx`);
}

// ── Export PDF ───────────────────────────────────────────────────────────────
/**
 * Ouvre une fenêtre d'impression mise en page (A4 paysage, en-tête société).
 * L'utilisateur choisit « Enregistrer au format PDF » : c'est le chemin qui
 * produit un vrai PDF sans dépendre d'une bibliothèque de rendu côté serveur.
 */
export function exportPdf<T>(
  rows: T[],
  columns: Column<T>[],
  opts: { title: string; subtitle?: string; company?: string; footer?: string },
) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => {
            const v = c.display ? c.display(r) : cellText(c.value(r));
            const numeric = typeof c.value(r) === "number";
            return `<td class="${numeric ? "num" : ""}">${esc(v)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(opts.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Segoe UI", Arial, sans-serif; color: #0B1F3A; margin: 0; font-size: 9.5pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end;
           border-bottom: 2px solid #C9A227; padding-bottom: 6px; margin-bottom: 12px; }
  h1 { font-size: 15pt; margin: 0; letter-spacing: -0.01em; }
  .sub { font-size: 8.5pt; color: #5A6B80; margin-top: 2px; }
  .brand { text-align: right; font-size: 8.5pt; color: #5A6B80; }
  .brand strong { display: block; color: #0B1F3A; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #0B1F3A; color: #fff; text-align: left; padding: 5px 6px;
             font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  tbody td { padding: 4px 6px; border-bottom: 1px solid #E3E8EF; }
  tbody tr:nth-child(even) td { background: #F7F9FC; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 10px; font-size: 7.5pt; color: #7A8899; display: flex; justify-content: space-between; }
  @media print { thead { display: table-header-group; } tr { page-break-inside: avoid; } }
</style></head><body>
<header>
  <div><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}</div>
  <div class="brand"><strong>${esc(opts.company ?? "ERP Tunisie")}</strong>${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</div>
</header>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<footer><span>${esc(opts.footer ?? "")}</span><span>${rows.length} ligne(s) — montants en TND</span></footer>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    alert("Autorisez les fenêtres surgissantes pour générer le PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── Import CSV / Excel ───────────────────────────────────────────────────────
export type ParsedSheet = { headers: string[]; rows: Record<string, string>[] };

/** Lit un fichier CSV ou XLSX et renvoie des lignes indexées par en-tête. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  let aoa: (string | number)[][];

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as (string | number)[][];
  } else {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const sep = detectSeparator(text);
    aoa = parseCsv(text, sep);
  }

  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = aoa.slice(1).map((line) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = String(line[i] ?? "").trim();
    });
    return o;
  });
  return { headers, rows: rows.filter((r) => Object.values(r).some((v) => v !== "")) };
}

function detectSeparator(text: string): string {
  const first = text.split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = {
    ";": (first.match(/;/g) ?? []).length,
    ",": (first.match(/,/g) ?? []).length,
    "\t": (first.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ";";
}

function parseCsv(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") {
      cur += ch;
    }
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

/** Convertit « 1 234,567 » ou « 1234.567 » en millimes. */
export function parseAmountToMillimes(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\s|\u00A0/g, "")
    .replace(/TND|DT/gi, "")
    .replace(/,/g, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}
