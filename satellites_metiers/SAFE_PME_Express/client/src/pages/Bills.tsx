import { useState, useMemo } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Table } from "@/components/primitives";
import { addDaysISO, parseTND, todayISO } from "../../../shared/fiscal";
import { ExportBar } from "@/components/ExportBar";
import type { Column } from "@/lib/io";

type Bill = {
  id: string;
  number: string;
  partnerName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalHt: number;
  totalVat: number;
  withholding: number;
  totalTtc: number;
};

const billColumns: Column<Bill>[] = [
  { key: "num", label: "N° fournisseur", value: (b) => b.number },
  { key: "sup", label: "Fournisseur", value: (b) => b.partnerName },
  { key: "date", label: "Date", value: (b) => b.issueDate },
  { key: "due", label: "Échéance", value: (b) => b.dueDate },
  { key: "status", label: "Statut", value: (b) => STATUS[b.status]?.label ?? b.status },
  { key: "ht", label: "Total HT", value: (b) => b.totalHt / 1000, display: (b) => (b.totalHt / 1000).toFixed(3) },
  { key: "vat", label: "TVA déductible", value: (b) => b.totalVat / 1000, display: (b) => (b.totalVat / 1000).toFixed(3) },
  { key: "wh", label: "Retenue", value: (b) => b.withholding / 1000, display: (b) => (b.withholding / 1000).toFixed(3) },
  { key: "ttc", label: "Total TTC", value: (b) => b.totalTtc / 1000, display: (b) => (b.totalTtc / 1000).toFixed(3) },
];

const STATUS: Record<string, { label: string; tone: string }> = {
  brouillon: { label: "Brouillon", tone: "muted" },
  validee: { label: "Validée", tone: "info" },
  payee: { label: "Payée", tone: "success" },
};

type Line = { label: string; quantity: string; unitPrice: string; vatRate: number };

export default function Bills() {
  const utils = trpc.useUtils();
  const list = trpc.bills.list.useQuery();
  const partners = trpc.partners.list.useQuery({ type: "fournisseur" });
  const create = trpc.bills.create.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate();
      utils.dashboard.get.invalidate();
      setOpen(false);
      reset();
    },
  });

  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 30));
  const [withholdingRate, setWithholdingRate] = useState(0);
  const [lines, setLines] = useState<Line[]>([{ label: "", quantity: "1", unitPrice: "", vatRate: 19 }]);

  function reset() {
    setNumber("");
    setPartnerId("");
    setIssueDate(todayISO());
    setDueDate(addDaysISO(todayISO(), 30));
    setWithholdingRate(0);
    setLines([{ label: "", quantity: "1", unitPrice: "", vatRate: 19 }]);
  }

  const computed = lines.map((l) => {
    const ht = Math.round(parseTND(l.unitPrice) * (parseTND(l.quantity) / 1000));
    return { ht, vat: Math.round((ht * l.vatRate) / 100) };
  });
  const totalHt = computed.reduce((s, c) => s + c.ht, 0);
  const totalVat = computed.reduce((s, c) => s + c.vat, 0);
  const withholding = Math.round((totalHt * withholdingRate) / 100);

  const totals = useMemo(
    () => (list.data ?? []).reduce((a, r) => ({ ht: a.ht + r.totalHt, vat: a.vat + r.totalVat }), { ht: 0, vat: 0 }),
    [list.data],
  );

  function submit() {
    const partner = partners.data?.find((p) => p.id === partnerId);
    const valid = lines.filter((l) => l.label.trim());
    if (!partner || !number.trim() || valid.length === 0) return;
    create.mutate({
      number: number.trim(),
      partnerId: partner.id,
      partnerName: partner.name,
      issueDate,
      dueDate,
      status: "validee",
      withholding,
      lines: valid.map((l) => ({
        label: l.label,
        quantity: parseTND(l.quantity),
        unitPrice: parseTND(l.unitPrice),
        vatRate: l.vatRate,
      })),
    });
  }

  return (
    <>
      <PageHeader
        title="Achats fournisseurs"
        subtitle="Factures d'achat, TVA déductible et retenue à la source"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Saisir un achat
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        <span className="erp-chip bg-secondary text-muted-foreground">
          Achats HT {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totals.ht / 1000)}
        </span>
        <span className="erp-chip bg-info-soft text-info">
          TVA déductible {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totals.vat / 1000)}
        </span>
      </div>

      <div className="mb-3">
        <ExportBar
          rows={list.data ?? []}
          basename="achats"
          title="Achats fournisseurs"
          subtitle="ERP Tunisie — Achats"
          columns={billColumns}
        />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon="▥"
            title="Aucun achat enregistré"
            description="Saisissez vos factures fournisseurs : la TVA déductible alimentera automatiquement votre déclaration de TVA."
            action={
              <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                Saisir un achat
              </button>
            }
          />
        ) : (
          <Table head={["N° fournisseur", "Fournisseur", "Date", "Échéance", "Statut", "Total HT", "TVA", "Retenue", "Total TTC"]}>
            {(list.data ?? []).map((b) => {
              const st = STATUS[b.status] ?? STATUS.brouillon;
              return (
                <tr key={b.id}>
                  <td className="font-mono text-[12px]">{b.number}</td>
                  <td>{b.partnerName}</td>
                  <td className="text-muted-foreground">{new Date(b.issueDate).toLocaleDateString("fr-FR")}</td>
                  <td className="text-muted-foreground">{new Date(b.dueDate).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="text-right"><Money value={b.totalHt} /></td>
                  <td className="text-right"><Money value={b.totalVat} /></td>
                  <td className="text-right"><Money value={b.withholding} zeroDash /></td>
                  <td className="text-right"><Money value={b.totalTtc} bold /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvel achat" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="N° facture fournisseur">
            <input className="erp-input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="FA-2026-001" />
          </Field>
          <Field label="Fournisseur">
            <select className="erp-select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className="erp-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Échéance">
            <input type="date" className="erp-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Retenue à la source" hint="Appliquée sur le montant HT">
            <select className="erp-select" value={withholdingRate} onChange={(e) => setWithholdingRate(Number(e.target.value))}>
              <option value={0}>Aucune</option>
              <option value={1}>1 %</option>
              <option value={3}>3 %</option>
            </select>
          </Field>
          <div className="rounded-lg bg-secondary/60 p-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <Money value={totalHt} bold />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA</span>
              <Money value={totalVat} bold />
            </div>
            {withholding > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retenue</span>
                <Money value={withholding} bold />
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total TTC</span>
              <Money value={totalHt + totalVat} bold />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th className="w-[12%] text-right">Qté</th>
                <th className="w-[16%] text-right">P.U. HT</th>
                <th className="w-[12%]">TVA</th>
                <th className="w-[16%] text-right">Total HT</th>
                <th className="w-[6%]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="erp-input h-8"
                      value={l.label}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="Désignation"
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.quantity}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.unitPrice}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
                      placeholder="0.000"
                    />
                  </td>
                  <td>
                    <select
                      className="erp-select h-8"
                      value={l.vatRate}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, vatRate: Number(e.target.value) } : x)))}
                    >
                      <option value={19}>19 %</option>
                      <option value={13}>13 %</option>
                      <option value={7}>7 %</option>
                      <option value={0}>0 %</option>
                    </select>
                  </td>
                  <td className="text-right"><Money value={computed[i]?.ht ?? 0} /></td>
                  <td className="text-center">
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                      disabled={lines.length === 1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="erp-btn-ghost mt-2 h-8 text-[12px]"
            onClick={() => setLines((p) => [...p, { label: "", quantity: "1", unitPrice: "", vatRate: 19 }])}
          >
            + Ajouter une ligne
          </button>
        </div>

        {create.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{create.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </Modal>
    </>
  );
}
