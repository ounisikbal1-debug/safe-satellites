import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, PageHeader, Panel, Table } from "@/components/primitives";
import { INVOICE_STATUS, parseTND, todayISO, addDaysISO, tndInput } from "../../../shared/fiscal";
import { ExportBar } from "@/components/ExportBar";
import type { Column } from "@/lib/io";

type Invoice = {
  id: string;
  number: string;
  partnerName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalHt: number;
  totalVat: number;
  stampDuty: number;
  totalTtc: number;
};

const invoiceColumns: Column<Invoice>[] = [
  { key: "num", label: "Numéro", value: (i) => i.number },
  { key: "client", label: "Client", value: (i) => i.partnerName },
  { key: "date", label: "Date", value: (i) => i.issueDate },
  { key: "due", label: "Échéance", value: (i) => i.dueDate },
  { key: "status", label: "Statut", value: (i) => INVOICE_STATUS[i.status]?.label ?? i.status },
  { key: "ht", label: "Total HT", value: (i) => i.totalHt / 1000, display: (i) => (i.totalHt / 1000).toFixed(3) },
  { key: "vat", label: "TVA", value: (i) => i.totalVat / 1000, display: (i) => (i.totalVat / 1000).toFixed(3) },
  { key: "stamp", label: "Timbre", value: (i) => i.stampDuty / 1000, display: (i) => (i.stampDuty / 1000).toFixed(3) },
  { key: "ttc", label: "Total TTC", value: (i) => i.totalTtc / 1000, display: (i) => (i.totalTtc / 1000).toFixed(3) },
];

export default function Invoices() {
  const list = trpc.invoices.list.useQuery();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("tous");

  const rows = useMemo(() => {
    const all = list.data ?? [];
    return all.filter((i) => {
      const okQ =
        !q ||
        i.number.toLowerCase().includes(q.toLowerCase()) ||
        i.partnerName.toLowerCase().includes(q.toLowerCase());
      const okS = status === "tous" || i.status === status;
      return okQ && okS;
    });
  }, [list.data, q, status]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ ht: a.ht + r.totalHt, vat: a.vat + r.totalVat, ttc: a.ttc + r.totalTtc }),
        { ht: 0, vat: 0, ttc: 0 },
      ),
    [rows],
  );

  return (
    <>
      <PageHeader
        title="Factures clients"
        subtitle="Facturation, TVA, timbre fiscal et suivi des règlements"
        actions={
          <Link href="/factures/nouvelle" className="erp-btn-gold">
            + Nouvelle facture
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="erp-input max-w-xs"
          placeholder="Rechercher un numéro ou un client…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="erp-select max-w-[190px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="tous">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="validee">Validée</option>
          <option value="payee">Payée</option>
          <option value="annulee">Annulée</option>
        </select>
        <div className="ml-auto flex gap-2 text-[12px]">
          <span className="erp-chip bg-secondary text-muted-foreground">HT {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totals.ht / 1000)}</span>
          <span className="erp-chip bg-info-soft text-info">TVA {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totals.vat / 1000)}</span>
          <span className="erp-chip bg-gold-soft text-[hsl(38_72%_30%)]">TTC {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totals.ttc / 1000)}</span>
        </div>
      </div>

      <div className="mb-3">
        <ExportBar
          rows={rows}
          basename="factures"
          title="Factures clients"
          subtitle="ERP Tunisie — Ventes"
          columns={invoiceColumns}
        />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="▤"
            title="Aucune facture à afficher"
            description={
              list.data?.length
                ? "Aucune facture ne correspond à votre recherche. Modifiez les filtres."
                : "Créez votre première facture de vente : TVA 19/13/7/0 %, timbre fiscal 1,000 TND et totaux calculés automatiquement."
            }
            action={
              <Link href="/factures/nouvelle" className="erp-btn-gold">
                Créer une facture
              </Link>
            }
          />
        ) : (
          <Table head={["Numéro", "Client", "Émission", "Échéance", "Statut", "Total HT", "TVA", "Timbre", "Total TTC"]}>
            {rows.map((inv) => {
              const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.brouillon;
              const late =
                inv.status !== "payee" && inv.status !== "annulee" && inv.dueDate < todayISO();
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-[12px]">
                    <Link href={`/factures/${inv.id}`} className="font-medium text-info hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td>{inv.partnerName}</td>
                  <td className="text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString("fr-FR")}</td>
                  <td className={late ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {new Date(inv.dueDate).toLocaleDateString("fr-FR")}
                  </td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="text-right"><Money value={inv.totalHt} /></td>
                  <td className="text-right"><Money value={inv.totalVat} /></td>
                  <td className="text-right"><Money value={inv.stampDuty} zeroDash /></td>
                  <td className="text-right"><Money value={inv.totalTtc} bold /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}

// ── Nouvelle facture ─────────────────────────────────────────────────────────
type Line = { label: string; quantity: string; unitPrice: string; vatRate: number; productId?: string | null };

export function NewInvoice() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const partners = trpc.partners.list.useQuery({ type: "client" });
  const products = trpc.products.list.useQuery();
  const nextNum = trpc.invoices.nextNumber.useQuery();
  const create = trpc.invoices.create.useMutation({
    onSuccess: (inv) => {
      utils.invoices.list.invalidate();
      utils.dashboard.get.invalidate();
      navigate(`/factures/${inv.id}`);
    },
  });

  const [partnerId, setPartnerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 30));
  const [stamp, setStamp] = useState("1.000");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"brouillon" | "validee">("validee");
  const [lines, setLines] = useState<Line[]>([{ label: "", quantity: "1", unitPrice: "", vatRate: 19 }]);

  const partner = partners.data?.find((p) => p.id === partnerId);

  const computed = lines.map((l) => {
    const ht = parseTND(l.unitPrice) * (parseTND(l.quantity) / 1000);
    const htR = Math.round(ht);
    const vatR = Math.round((htR * l.vatRate) / 100);
    return { ht: htR, vat: vatR };
  });
  const totalHt = computed.reduce((s, c) => s + c.ht, 0);
  const totalVat = computed.reduce((s, c) => s + c.vat, 0);
  const stampM = parseTND(stamp);
  const totalTtc = totalHt + totalVat + stampM;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, productId: string) {
    const p = products.data?.find((x) => x.id === productId);
    if (!p) return;
    setLine(i, { productId: p.id, label: p.name, unitPrice: tndInput(p.priceHt), vatRate: p.vatRate });
  }

  function submit() {
    const valid = lines.filter((l) => l.label.trim() && parseTND(l.unitPrice) >= 0);
    if (!partner || valid.length === 0) return;
    create.mutate({
      partnerId: partner.id,
      partnerName: partner.name,
      issueDate,
      dueDate,
      status,
      stampDuty: stampM,
      notes: notes || undefined,
      lines: valid.map((l) => ({
        productId: l.productId ?? null,
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
        title="Nouvelle facture"
        subtitle={nextNum.data ? `Numéro attribué : ${nextNum.data}` : "Rédaction d'une facture de vente"}
        actions={
          <>
            <button className="erp-btn-ghost" onClick={() => navigate("/factures")}>
              Annuler
            </button>
            <button className="erp-btn-gold" onClick={submit} disabled={create.isPending || !partner}>
              {create.isPending ? "Enregistrement…" : "Enregistrer la facture"}
            </button>
          </>
        }
      />

      {create.error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">
          {create.error.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Informations générales" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client">
              <select className="erp-select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— Sélectionner un client —</option>
                {(partners.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.matriculeFiscal ? `· MF ${p.matriculeFiscal}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select className="erp-select" value={status} onChange={(e) => setStatus(e.target.value as "brouillon" | "validee")}>
                <option value="validee">Validée</option>
                <option value="brouillon">Brouillon</option>
              </select>
            </Field>
            <Field label="Date d'émission">
              <input type="date" className="erp-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Date d'échéance">
              <input type="date" className="erp-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          {partner && (
            <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">{partner.name}</p>
              <p>{partner.address || "Adresse non renseignée"}</p>
              <p>
                MF : {partner.matriculeFiscal || "—"} · Tél : {partner.phone || "—"} · Délai {partner.paymentTerms} j
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Récapitulatif">
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total HT</dt>
              <dd><Money value={totalHt} bold /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">TVA</dt>
              <dd><Money value={totalVat} bold /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Timbre fiscal</dt>
              <dd><Money value={stampM} bold /></dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-[12px] font-semibold uppercase tracking-wider">Total TTC</dt>
              <dd className="num text-[19px] font-semibold text-gold">{`${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(totalTtc / 1000)} TND`}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-3">
            <Field label="Timbre fiscal (TND)" hint="1,000 TND par facture — saisir 0 si exonéré">
              <input className="erp-input" value={stamp} onChange={(e) => setStamp(e.target.value)} />
            </Field>
            <Field label="Observations">
              <textarea
                className="erp-input h-20 py-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conditions de règlement, mentions légales…"
              />
            </Field>
          </div>
        </Panel>
      </div>

      <Panel
        title="Lignes de facture"
        className="mt-4"
        noPad
        actions={
          <button
            className="erp-btn-ghost h-8 text-[12px]"
            onClick={() => setLines((p) => [...p, { label: "", quantity: "1", unitPrice: "", vatRate: 19 }])}
          >
            + Ajouter une ligne
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-[34%]">Article</th>
                <th className="w-[22%]">Désignation</th>
                <th className="w-[10%] text-right">Qté</th>
                <th className="w-[14%] text-right">P.U. HT</th>
                <th className="w-[9%]">TVA</th>
                <th className="w-[8%] text-right">Total HT</th>
                <th className="w-[3%]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select className="erp-select h-8" value={l.productId ?? ""} onChange={(e) => pickProduct(i, e.target.value)}>
                      <option value="">— libre —</option>
                      {(products.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.reference} · {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="erp-input h-8"
                      value={l.label}
                      onChange={(e) => setLine(i, { label: e.target.value })}
                      placeholder="Désignation"
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                      placeholder="0.000"
                    />
                  </td>
                  <td>
                    <select
                      className="erp-select h-8"
                      value={l.vatRate}
                      onChange={(e) => setLine(i, { vatRate: Number(e.target.value) })}
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
                      className="text-muted-foreground transition hover:text-destructive disabled:opacity-30"
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                      disabled={lines.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
