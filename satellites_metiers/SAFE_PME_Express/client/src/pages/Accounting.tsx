import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import { JOURNAL_LABELS, fmtTND, parseTND, todayISO } from "../../../shared/fiscal";

const TABS = [
  { id: "balance", label: "Balance" },
  { id: "journaux", label: "Journaux" },
  { id: "plan", label: "Plan comptable" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Accounting() {
  const [tab, setTab] = useState<Tab>("balance");
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const balance = trpc.accounting.trialBalance.useQuery();
  const entries = trpc.accounting.entries.useQuery();
  const plan = trpc.accounting.accounts.useQuery();
  const createEntry = trpc.accounting.createEntry.useMutation({
    onSuccess: () => {
      utils.accounting.entries.invalidate();
      utils.accounting.trialBalance.invalidate();
      setOpen(false);
      reset();
    },
  });

  const [form, setForm] = useState({
    entryDate: todayISO(),
    journal: "OD",
    reference: "",
    label: "",
  });
  const [lines, setLines] = useState([
    { accountCode: "411", accountLabel: "Clients", debit: "", credit: "" },
    { accountCode: "701", accountLabel: "Ventes", debit: "", credit: "" },
  ]);

  function reset() {
    setForm({ entryDate: todayISO(), journal: "OD", reference: "", label: "" });
    setLines([
      { accountCode: "411", accountLabel: "Clients", debit: "", credit: "" },
      { accountCode: "701", accountLabel: "Ventes", debit: "", credit: "" },
    ]);
  }

  const parsed = lines.map((l) => ({ ...l, debitM: parseTND(l.debit), creditM: parseTND(l.credit) }));
  const totalDebit = parsed.reduce((s, l) => s + l.debitM, 0);
  const totalCredit = parsed.reduce((s, l) => s + l.creditM, 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const tbTotals = useMemo(
    () =>
      (balance.data ?? []).reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }),
    [balance.data],
  );

  function submit() {
    if (!form.label.trim() || !balanced) return;
    createEntry.mutate({
      entryDate: form.entryDate,
      journal: form.journal as "VE" | "AC" | "BQ" | "CA" | "OD" | "PA",
      reference: form.reference || undefined,
      label: form.label,
      lines: parsed
        .filter((l) => l.debitM > 0 || l.creditM > 0)
        .map((l) => ({ accountCode: l.accountCode, accountLabel: l.accountLabel, debit: l.debitM, credit: l.creditM })),
    });
  }

  return (
    <>
      <PageHeader
        title="Comptabilité"
        subtitle="Plan comptable tunisien · journaux · balance générale"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Nouvelle écriture
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total débits" value={fmtTND(tbTotals.d)} hint="Balance générale" />
        <Stat label="Total crédits" value={fmtTND(tbTotals.c)} hint="Balance générale" />
        <Stat
          label="Équilibre"
          value={tbTotals.d === tbTotals.c ? "Équilibrée" : fmtTND(tbTotals.d - tbTotals.c)}
          hint={tbTotals.d === tbTotals.c ? "Débit = Crédit" : "Écart à corriger"}
          tone={tbTotals.d === tbTotals.c ? "success" : "danger"}
        />
      </div>

      <div className="mb-4 flex gap-1 rounded-md border border-border bg-card p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
                : "rounded px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "balance" && (
        <Panel title="Balance générale" subtitle="Cumuls par compte" noPad>
          {balance.isLoading ? (
            <Loading />
          ) : (balance.data ?? []).length === 0 ? (
            <EmptyState
              icon="▦"
              title="Aucun mouvement comptable"
              description="La balance se remplit à mesure que vous saisissez des écritures. Chaque écriture doit être équilibrée (débit = crédit)."
              action={
                <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                  Saisir une écriture
                </button>
              }
            />
          ) : (
            <Table head={["Compte", "Libellé", "Débit", "Crédit", "Solde"]}>
              {(balance.data ?? []).map((r) => {
                const solde = r.debit - r.credit;
                return (
                  <tr key={r.accountCode}>
                    <td className="font-mono text-[12px]">{r.accountCode}</td>
                    <td>{r.accountLabel || "—"}</td>
                    <td className="text-right"><Money value={r.debit} /></td>
                    <td className="text-right"><Money value={r.credit} /></td>
                    <td className="text-right">
                      <Money value={solde} bold />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-secondary/60 font-semibold">
                <td colSpan={2}>Totaux</td>
                <td className="text-right"><Money value={tbTotals.d} bold /></td>
                <td className="text-right"><Money value={tbTotals.c} bold /></td>
                <td className="text-right"><Money value={tbTotals.d - tbTotals.c} bold /></td>
              </tr>
            </Table>
          )}
        </Panel>
      )}

      {tab === "journaux" && (
        <Panel title="Écritures" subtitle="Journal chronologique" noPad>
          {entries.isLoading ? (
            <Loading />
          ) : (entries.data ?? []).length === 0 ? (
            <EmptyState
              icon="▤"
              title="Aucune écriture"
              description="Enregistrez vos opérations : ventes (VE), achats (AC), banque (BQ), caisse (CA), paie (PA) ou opérations diverses (OD)."
              action={
                <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                  Saisir une écriture
                </button>
              }
            />
          ) : (
            <Table head={["Date", "Journal", "Référence", "Libellé"]}>
              {(entries.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="text-muted-foreground">{new Date(e.entryDate).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <span className="erp-chip bg-secondary text-muted-foreground">{e.journal}</span>
                    <span className="ml-2 text-[12px] text-muted-foreground">{JOURNAL_LABELS[e.journal]}</span>
                  </td>
                  <td className="font-mono text-[12px]">{e.reference || "—"}</td>
                  <td>{e.label}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      {tab === "plan" && (
        <Panel title="Plan comptable tunisien" subtitle="Classes 1 à 7" noPad>
          {plan.isLoading ? (
            <Loading />
          ) : (plan.data ?? []).length === 0 ? (
            <EmptyState
              icon="▧"
              title="Plan comptable non initialisé"
              description="Le plan comptable tunisien se charge automatiquement à la première écriture, ou peut être complété depuis le panneau base de données."
            />
          ) : (
            <Table head={["Code", "Intitulé", "Classe", "Nature"]}>
              {(plan.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-[12px]">{a.code}</td>
                  <td>{a.label}</td>
                  <td className="text-muted-foreground">{a.classNo}</td>
                  <td className="capitalize text-muted-foreground">{a.nature}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle écriture comptable" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Date">
            <input type="date" className="erp-input" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
          </Field>
          <Field label="Journal">
            <select className="erp-select" value={form.journal} onChange={(e) => setForm({ ...form, journal: e.target.value })}>
              {Object.entries(JOURNAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} — {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Référence">
            <input className="erp-input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Libellé">
            <input className="erp-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Facture FA-2026-0001" />
          </Field>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-[16%]">Compte</th>
                <th>Libellé</th>
                <th className="w-[20%] text-right">Débit</th>
                <th className="w-[20%] text-right">Crédit</th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="erp-input h-8 font-mono"
                      value={l.accountCode}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, accountCode: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8"
                      value={l.accountLabel}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, accountLabel: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.debit}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, debit: e.target.value } : x)))}
                      placeholder="0.000"
                    />
                  </td>
                  <td>
                    <input
                      className="erp-input h-8 num text-right"
                      value={l.credit}
                      onChange={(e) => setLines((p) => p.map((x, idx) => (idx === i ? { ...x, credit: e.target.value } : x)))}
                      placeholder="0.000"
                    />
                  </td>
                  <td className="text-center">
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                      disabled={lines.length <= 2}
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
            onClick={() => setLines((p) => [...p, { accountCode: "", accountLabel: "", debit: "", credit: "" }])}
          >
            + Ajouter une ligne
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-[12.5px]">
          <span className="text-muted-foreground">
            Débit {fmtTND(totalDebit)} · Crédit {fmtTND(totalCredit)}
          </span>
          <span className={balanced ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {balanced ? "✓ Équilibrée" : `Écart ${fmtTND(Math.abs(totalDebit - totalCredit))}`}
          </span>
        </div>

        {createEntry.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{createEntry.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={submit} disabled={createEntry.isPending || !balanced}>
            {createEntry.isPending ? "Enregistrement…" : "Enregistrer l'écriture"}
          </button>
        </div>
      </Modal>
    </>
  );
}
