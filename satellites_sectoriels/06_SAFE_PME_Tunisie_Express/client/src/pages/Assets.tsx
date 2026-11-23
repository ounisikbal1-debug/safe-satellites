import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import { fmtTND, parseTND, todayISO } from "../../../shared/fiscal";

const CATEGORIES = [
  { label: "Constructions", rate: 5, account: "2221" },
  { label: "Matériel & outillage", rate: 10, account: "2231" },
  { label: "Matériel de transport", rate: 20, account: "2241" },
  { label: "Mobilier de bureau", rate: 10, account: "2251" },
  { label: "Matériel informatique", rate: 33.33, account: "2281" },
  { label: "Logiciels & licences", rate: 33.33, account: "2261" },
];

export default function Assets() {
  const utils = trpc.useUtils();
  const list = trpc.assets.list.useQuery();
  const [open, setOpen] = useState(false);

  const create = trpc.assets.create.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      utils.dashboard.get.invalidate();
      setOpen(false);
    },
  });

  const [form, setForm] = useState({
    code: "",
    label: "",
    category: "Matériel & outillage",
    acquisitionDate: todayISO(),
    cost: "",
    duration: 10,
    rate: 10,
    accountCode: "2231",
  });

  function applyCategory(cat: string) {
    const c = CATEGORIES.find((x) => x.label === cat);
    if (!c) return;
    setForm((f) => ({
      ...f,
      category: cat,
      rate: c.rate,
      duration: Math.round(100 / c.rate),
      accountCode: c.account,
    }));
  }

  const totals = useMemo(
    () =>
      (list.data ?? []).reduce(
        (a, r) => ({
          cost: a.cost + r.cost,
          acc: a.acc + r.accumulated,
          annual: a.annual + Math.round((r.cost * r.rateBp) / 10000),
        }),
        { cost: 0, acc: 0, annual: 0 },
      ),
    [list.data],
  );

  function submit() {
    if (!form.label.trim() || !form.code.trim()) return;
    create.mutate({
      code: form.code,
      label: form.label,
      category: form.category,
      acquisitionDate: form.acquisitionDate,
      cost: parseTND(form.cost),
      durationYears: Number(form.duration),
      rateBp: Math.round(Number(form.rate) * 100),
      accountCode: form.accountCode,
    });
  }

  return (
    <>
      <PageHeader
        title="Immobilisations"
        subtitle="Registre des immobilisations et amortissements linéaires"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Nouvelle immobilisation
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valeur brute" value={fmtTND(totals.cost)} hint="Coût d'acquisition" />
        <Stat label="Amortissements cumulés" value={fmtTND(totals.acc)} hint="Dotations passées" tone="danger" />
        <Stat label="Valeur nette comptable" value={fmtTND(totals.cost - totals.acc)} hint="VNC" tone="gold" />
        <Stat label="Dotation annuelle" value={fmtTND(totals.annual)} hint="Charge de l'exercice" />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon="▧"
            title="Aucune immobilisation"
            description="Enregistrez vos immobilisations pour calculer automatiquement les amortissements linéaires selon les durées fiscales tunisiennes (5 à 10 ans selon la catégorie)."
            action={
              <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                Ajouter une immobilisation
              </button>
            }
          />
        ) : (
          <Table
            head={[
              "Code",
              "Désignation",
              "Catégorie",
              "Acquisition",
              "Valeur brute",
              "Taux",
              "Durée",
              "Amort. cumulé",
              "VNC",
              "Dotation",
            ]}
          >
            {(list.data ?? []).map((a) => {
              const annual = Math.round((a.cost * a.rateBp) / 10000);
              return (
                <tr key={a.id}>
                  <td className="font-mono text-[12px]">{a.code}</td>
                  <td className="font-medium">{a.label}</td>
                  <td>
                    <span className="erp-chip bg-secondary text-muted-foreground">{a.category}</span>
                  </td>
                  <td className="text-muted-foreground">{new Date(a.acquisitionDate).toLocaleDateString("fr-FR")}</td>
                  <td className="text-right"><Money value={a.cost} /></td>
                  <td className="text-right">{(a.rateBp / 100).toFixed(2)} %</td>
                  <td className="text-right">{a.durationYears} ans</td>
                  <td className="text-right"><Money value={a.accumulated} /></td>
                  <td className="text-right"><Money value={a.cost - a.accumulated} bold /></td>
                  <td className="text-right"><Money value={annual} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Panel title="Barème d'amortissement" subtitle="Durées et taux usuels en Tunisie" className="mt-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div key={c.label} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-[12.5px]">
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">Compte {c.account}</p>
              </div>
              <div className="text-right">
                <p className="num font-semibold">{c.rate} %</p>
                <p className="text-[11px] text-muted-foreground">{Math.round(100 / c.rate)} ans</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle immobilisation" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code">
            <input className="erp-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="IMM-001" />
          </Field>
          <Field label="Désignation">
            <input className="erp-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Camion de livraison" />
          </Field>
          <Field label="Catégorie">
            <select className="erp-select" value={form.category} onChange={(e) => applyCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.label} value={c.label}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date d'acquisition">
            <input type="date" className="erp-input" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
          </Field>
          <Field label="Valeur d'acquisition (TND)">
            <input className="erp-input" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Taux linéaire (%)">
            <input
              type="number"
              step="0.01"
              className="erp-input"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: Number(e.target.value), duration: Math.round(100 / Number(e.target.value)) })}
            />
          </Field>
          <Field label="Durée (années)">
            <input type="number" className="erp-input" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
          </Field>
          <Field label="Compte d'immobilisation">
            <input className="erp-input" value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dotation annuelle</span>
            <span className="num font-semibold">
              {fmtTND(Math.round((parseTND(form.cost) * Number(form.rate) * 100) / 10000))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dotation mensuelle</span>
            <span className="num font-semibold">
              {fmtTND(Math.round((parseTND(form.cost) * Number(form.rate) * 100) / 120000))}
            </span>
          </div>
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
