import { useRef, useState } from "react";
import { exportCsv, exportExcel, exportPdf, parseSpreadsheet, type Column } from "@/lib/io";

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  basename: string;
  title: string;
  subtitle?: string;
  company?: string;
  /** Import activé : reçoit les lignes lues et renvoie un compte-rendu. */
  onImport?: (rows: Record<string, string>[]) => Promise<{ imported: number; errors: string[] }> | { imported: number; errors: string[] };
  /** Modèle CSV à télécharger pour l'import. */
  templateHeaders?: string[];
};

export function ExportBar<T>({
  rows,
  columns,
  basename,
  title,
  subtitle,
  company,
  onImport,
  templateHeaders,
}: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ imported: number; errors: string[] } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;
    setBusy(true);
    setReport(null);
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.rows.length === 0) {
        setReport({ imported: 0, errors: ["Le fichier ne contient aucune ligne exploitable."] });
      } else {
        setReport(await onImport(parsed.rows));
      }
    } catch (err) {
      setReport({ imported: 0, errors: [err instanceof Error ? err.message : "Fichier illisible."] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    if (!templateHeaders) return;
    const head = templateHeaders.join(";");
    const blob = new Blob(["\uFEFF" + head + "\r\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modele_${basename}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="no-print">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Exporter</span>
        <button className="erp-btn-ghost h-7 px-2 text-[11.5px]" onClick={() => exportExcel(rows, columns, basename)} disabled={rows.length === 0} title="Télécharger en Excel (.xlsx)">
          Excel
        </button>
        <button className="erp-btn-ghost h-7 px-2 text-[11.5px]" onClick={() => exportCsv(rows, columns, basename)} disabled={rows.length === 0} title="Télécharger en CSV">
          CSV
        </button>
        <button
          className="erp-btn-ghost h-7 px-2 text-[11.5px]"
          onClick={() => exportPdf(rows, columns, { title, subtitle, company })}
          disabled={rows.length === 0}
          title="Générer un PDF imprimable"
        >
          PDF
        </button>

        {onImport && (
          <>
            <span className="ml-2 mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Importer</span>
            <button className="erp-btn-ghost h-7 px-2 text-[11.5px]" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Lecture…" : "Excel / CSV"}
            </button>
            {templateHeaders && (
              <button className="erp-btn-ghost h-7 px-2 text-[11.5px]" onClick={downloadTemplate} title="Télécharger un modèle vierge">
                Modèle
              </button>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={handleFile} />
          </>
        )}
      </div>

      {report && (
        <div
          className={
            report.errors.length === 0
              ? "mt-2 rounded-lg border border-success/30 bg-success-soft px-2.5 py-1.5 text-[11.5px] text-success"
              : "mt-2 rounded-lg border border-destructive/30 bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-destructive"
          }
        >
          <strong>{report.imported}</strong> ligne(s) importée(s).
          {report.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {report.errors.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {report.errors.length > 6 && <li>… et {report.errors.length - 6} autre(s).</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
