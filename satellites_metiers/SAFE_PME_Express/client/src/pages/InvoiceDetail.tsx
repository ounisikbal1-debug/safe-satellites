import { Link, useParams } from "wouter";
import { trpc } from "@/_core/trpc";
import { Badge, Loading, Money, PageHeader, Panel, Table } from "@/components/primitives";
import { INVOICE_STATUS, fmtTND } from "../../../shared/fiscal";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const inv = trpc.invoices.get.useQuery({ id });
  const company = trpc.company.get.useQuery();
  const utils = trpc.useUtils();
  const status = trpc.transmission.status.useQuery();
  const send = trpc.transmission.sendInvoice.useMutation({
    onSuccess: () => utils.transmission.history.invalidate(),
  });

  const efatouraReady = status.data?.find((s) => s.platform === "efatoura")?.configured ?? false;

  if (inv.isLoading) return <Panel><Loading /></Panel>;
  if (!inv.data) {
    return (
      <Panel>
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          Facture introuvable.{" "}
          <Link href="/factures" className="text-info hover:underline">
            Retour à la liste
          </Link>
        </p>
      </Panel>
    );
  }

  const i = inv.data;
  const st = INVOICE_STATUS[i.status] ?? INVOICE_STATUS.brouillon;
  const c = company.data;

  return (
    <>
      <PageHeader
        title={`Facture ${i.number}`}
        subtitle={`${i.partnerName} · émise le ${new Date(i.issueDate).toLocaleDateString("fr-FR")}`}
        actions={
          <>
            <Link href="/factures" className="erp-btn-ghost no-print">
              ← Retour
            </Link>
            <button
              className="erp-btn-gold no-print"
              onClick={() => send.mutate({ invoiceId: i.id })}
              disabled={send.isPending}
              title={
                efatouraReady
                  ? "Transmettre cette facture à e-Fatoura"
                  : "e-Fatoura n'est pas configurée — ajoutez EFATOURA_API_URL et EFATOURA_API_KEY dans Web Admin → Secrets"
              }
            >
              {send.isPending ? "Transmission…" : "Transmettre à e-Fatoura"}
            </button>
            <button className="erp-btn no-print" onClick={() => window.print()}>
              Imprimer / PDF
            </button>
          </>
        }
      />

      {send.data && (
        <div
          className={
            send.data.ok
              ? "mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-[12.5px] text-success"
              : "mb-4 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-[12.5px] text-destructive"
          }
        >
          {send.data.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="erp-card p-6 xl:col-span-2">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-[17px] font-semibold text-navy">{c?.name}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {c?.address}
                <br />
                MF : {c?.matriculeFiscal} · RC : {c?.registreCommerce}
                <br />
                Tél : {c?.phone} · {c?.email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">Facture</p>
              <p className="font-mono text-[15px] font-semibold">{i.number}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Date : {new Date(i.issueDate).toLocaleDateString("fr-FR")}
                <br />
                Échéance : {new Date(i.dueDate).toLocaleDateString("fr-FR")}
              </p>
              <div className="mt-2 flex justify-end">
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
            </div>
          </header>

          <div className="grid gap-4 border-b border-border py-4 sm:grid-cols-2">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">Client</p>
              <p className="mt-1 text-[13.5px] font-semibold">{i.partnerName}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">Montant dû</p>
              <p className="num mt-1 text-[20px] font-semibold text-gold">{fmtTND(i.totalTtc)}</p>
            </div>
          </div>

          <div className="mt-2">
            <Table head={["Désignation", "Qté", "P.U. HT", "TVA", "Total HT", "TVA"]}>
              {i.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.label}</td>
                  <td className="num text-right">{(l.quantity / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })}</td>
                  <td className="text-right"><Money value={l.unitPrice} /></td>
                  <td className="text-right text-muted-foreground">{l.vatRate} %</td>
                  <td className="text-right"><Money value={l.lineHt} /></td>
                  <td className="text-right"><Money value={l.lineVat} /></td>
                </tr>
              ))}
            </Table>
          </div>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total HT</dt>
                <dd><Money value={i.totalHt} bold /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">TVA</dt>
                <dd><Money value={i.totalVat} bold /></dd>
              </div>
              {i.stampDuty > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Timbre fiscal</dt>
                  <dd><Money value={i.stampDuty} bold /></dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <dt className="text-[12px] font-semibold uppercase tracking-wider">Total TTC</dt>
                <dd className="num text-[17px] font-semibold text-gold">{fmtTND(i.totalTtc)}</dd>
              </div>
            </dl>
          </div>

          {i.notes && (
            <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-[12px] text-muted-foreground">{i.notes}</p>
          )}

          <p className="mt-4 border-t border-border pt-3 text-[10.5px] text-muted-foreground">
            Arrêtée la présente facture à la somme de {fmtTND(i.totalTtc)} toutes taxes comprises.
          </p>
        </div>

        <div className="space-y-4">
          <Panel title="Ventilation comptable" subtitle="Écriture type (plan comptable tunisien)">
            <div className="space-y-2 text-[12.5px]">
              {[
                { code: "411", label: "Clients", amount: i.totalTtc, side: "Débit" },
                { code: "701", label: "Ventes de produits finis", amount: i.totalHt, side: "Crédit" },
                { code: "4366", label: "TVA collectée 19 %", amount: i.totalVat, side: "Crédit" },
                { code: "4458", label: "Timbre fiscal", amount: i.stampDuty, side: "Crédit" },
              ]
                .filter((r) => r.amount > 0)
                .map((r) => (
                  <div key={r.code} className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                    <span className="min-w-0 flex-1 text-[11.5px] leading-tight">{r.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.side}</span>
                    <Money value={r.amount} />
                  </div>
                ))}
            </div>
          </Panel>

          <Panel title="Suivi">
            <div className="space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Délai de règlement</span>
                <span>{Math.max(0, Math.round((new Date(i.dueDate).getTime() - new Date(i.issueDate).getTime()) / 86400000))} jours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TVA applicable</span>
                <span>{i.totalVat > 0 ? fmtTND(i.totalVat) : "Exonéré"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timbre fiscal</span>
                <span>{i.stampDuty > 0 ? fmtTND(i.stampDuty) : "Non appliqué"}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
