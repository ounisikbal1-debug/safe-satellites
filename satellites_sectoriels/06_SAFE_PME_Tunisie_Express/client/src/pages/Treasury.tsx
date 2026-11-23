import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import { fmtTND, parseTND, todayISO } from "../../../shared/fiscal";

export default function Treasury() {
  const utils = trpc.useUtils();
  const accounts = trpc.treasury.accounts.useQuery();
  const tx = trpc.treasury.transactions.useQuery({});
  const [openAcc, setOpenAcc] = useState(false);
  const [openTx, setOpenTx] = useState(false);

  const createAcc = trpc.treasury.createAccount.useMutation({
    onSuccess: () => {
      utils.treasury.accounts.invalidate();
      utils.dashboard.get.invalidate();
      setOpenAcc(false);
    },
  });
  const createTx = trpc.treasury.createTransaction.useMutation({
    onSuccess: () => {
      utils.treasury.transactions.invalidate();
      utils.dashboard.get.invalidate();
      setOpenTx(false);
    },
  });

  const [accForm, setAccForm] = useState({
    label: "",
    kind: "banque",
    bankName: "",
    rib: "",
    opening: "",
    accountCode: "532",
  });

  const [txForm, setTxForm] = useState({
    accountId: "",
    txDate: todayISO(),
    label: "",
    direction: "encaissement",
    amount: "",
    category: "Ventes",
    reference: "",
  });

  const balances = useMemo(() => {
    const all = accounts.data ?? [];
    const txs = tx.data ?? [];
    return all.map((a) => {
      const related = txs.filter((t) => t.accountId === a.id);
      const inflow = related.filter((t) => t.direction === "encaissement").reduce((s, t) => s + t.amount, 0);
      const outflow = related.filter((t) => t.direction === "decaissement").reduce((s, t) => s + t.amount, 0);
      return { acc: a, inflow, outflow, balance: a.openingBalance + inflow - outflow };
    });
  }, [accounts.data, tx.data]);

  const totals = balances.reduce(
    (a, b) => ({ inflow: a.inflow + b.inflow, outflow: a.outflow + b.outflow, balance: a.balance + b.balance }),
    { inflow: 0, outflow: 0, balance: 0 },
  );

  const accName = (id: string) => (accounts.data ?? []).find((a) => a.id === id)?.label ?? "—";

  return (
    <>
      <PageHeader
        title="Trésorerie"
        subtitle="Comptes bancaires, caisse et mouvements"
        actions={
          <>
            <button className="erp-btn-ghost" onClick={() => setOpenAcc(true)}>
              + Compte
            </button>
            <button className="erp-btn-gold" onClick={() => setOpenTx(true)} disabled={(accounts.data ?? []).length === 0}>
              + Mouvement
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Solde total" value={fmtTND(totals.balance)} hint="Banque + caisse" tone="gold" />
        <Stat label="Encaissements" value={fmtTND(totals.inflow)} hint="Cumul des entrées" tone="success" />
        <Stat label="Décaissements" value={fmtTND(totals.outflow)} hint="Cumul des sorties" tone="danger" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Comptes" subtitle="Soldes calculés" noPad>
          {accounts.isLoading ? (
            <Loading />
          ) : balances.length === 0 ? (
            <EmptyState
              icon="◉"
              title="Aucun compte de trésorerie"
              description="Ouvrez un compte bancaire ou une caisse pour suivre les encaissements et décaissements."
              action={
                <button className="erp-btn-gold" onClick={() => setOpenAcc(true)}>
                  Ouvrir un compte
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {balances.map((b) => (
                <li key={b.acc.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-[12.5px] font-medium">{b.acc.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {b.acc.kind === "banque" ? b.acc.bankName || "Banque" : "Caisse"} · {b.acc.accountCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[13px] font-semibold">{fmtTND(b.balance)}</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      +{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(b.inflow / 1000)} / −
                      {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(b.outflow / 1000)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Mouvements" subtitle="Journal de trésorerie" className="xl:col-span-2" noPad>
          {tx.isLoading ? (
            <Loading />
          ) : (tx.data ?? []).length === 0 ? (
            <EmptyState
              icon="◫"
              title="Aucun mouvement"
              description="Enregistrez vos encaissements clients et décaissements fournisseurs pour suivre votre position de trésorerie."
              action={
                <button className="erp-btn-gold" onClick={() => setOpenTx(true)} disabled={(accounts.data ?? []).length === 0}>
                  Saisir un mouvement
                </button>
              }
            />
          ) : (
            <Table head={["Date", "Compte", "Libellé", "Catégorie", "Sens", "Montant"]}>
              {(tx.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="text-muted-foreground">{new Date(t.txDate).toLocaleDateString("fr-FR")}</td>
                  <td className="text-[12px]">{accName(t.accountId)}</td>
                  <td>{t.label}</td>
                  <td>
                    <span className="erp-chip bg-secondary text-muted-foreground">{t.category}</span>
                  </td>
                  <td>
                    <Badge tone={t.direction === "encaissement" ? "success" : "danger"}>
                      {t.direction === "encaissement" ? "Entrée" : "Sortie"}
                    </Badge>
                  </td>
                  <td
                    className={
                      t.direction === "encaissement"
                        ? "num text-right font-semibold text-success"
                        : "num text-right font-semibold text-destructive"
                    }
                  >
                    {t.direction === "encaissement" ? "+" : "−"}
                    {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3 }).format(t.amount / 1000)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      {/* Nouveau compte */}
      <Modal open={openAcc} onClose={() => setOpenAcc(false)} title="Nouveau compte de trésorerie">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Libellé">
            <input className="erp-input" value={accForm.label} onChange={(e) => setAccForm({ ...accForm, label: e.target.value })} placeholder="Compte courant BIAT" />
          </Field>
          <Field label="Type">
            <select className="erp-select" value={accForm.kind} onChange={(e) => setAccForm({ ...accForm, kind: e.target.value, accountCode: e.target.value === "caisse" ? "531" : "532" })}>
              <option value="banque">Banque</option>
              <option value="caisse">Caisse</option>
            </select>
          </Field>
          <Field label="Banque">
            <input className="erp-input" value={accForm.bankName} onChange={(e) => setAccForm({ ...accForm, bankName: e.target.value })} placeholder="BIAT, BNA, Attijari…" />
          </Field>
          <Field label="RIB">
            <input className="erp-input" value={accForm.rib} onChange={(e) => setAccForm({ ...accForm, rib: e.target.value })} placeholder="08 123 0001234567890 12" />
          </Field>
          <Field label="Solde initial (TND)">
            <input className="erp-input" value={accForm.opening} onChange={(e) => setAccForm({ ...accForm, opening: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Compte comptable">
            <input className="erp-input" value={accForm.accountCode} onChange={(e) => setAccForm({ ...accForm, accountCode: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpenAcc(false)}>
            Annuler
          </button>
          <button
            className="erp-btn-gold"
            disabled={createAcc.isPending || !accForm.label.trim()}
            onClick={() =>
              createAcc.mutate({
                label: accForm.label,
                kind: accForm.kind as "banque" | "caisse",
                bankName: accForm.bankName || undefined,
                rib: accForm.rib || undefined,
                openingBalance: parseTND(accForm.opening),
                accountCode: accForm.accountCode,
              })
            }
          >
            {createAcc.isPending ? "Enregistrement…" : "Créer le compte"}
          </button>
        </div>
      </Modal>

      {/* Nouveau mouvement */}
      <Modal open={openTx} onClose={() => setOpenTx(false)} title="Nouveau mouvement de trésorerie">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Compte">
            <select className="erp-select" value={txForm.accountId} onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}>
              <option value="">— Sélectionner —</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className="erp-input" value={txForm.txDate} onChange={(e) => setTxForm({ ...txForm, txDate: e.target.value })} />
          </Field>
          <Field label="Libellé">
            <input className="erp-input" value={txForm.label} onChange={(e) => setTxForm({ ...txForm, label: e.target.value })} placeholder="Règlement facture FA-2026-0001" />
          </Field>
          <Field label="Sens">
            <select className="erp-select" value={txForm.direction} onChange={(e) => setTxForm({ ...txForm, direction: e.target.value })}>
              <option value="encaissement">Encaissement</option>
              <option value="decaissement">Décaissement</option>
            </select>
          </Field>
          <Field label="Montant (TND)">
            <input className="erp-input" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Catégorie">
            <input className="erp-input" value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpenTx(false)}>
            Annuler
          </button>
          <button
            className="erp-btn-gold"
            disabled={createTx.isPending || !txForm.accountId || !txForm.label.trim()}
            onClick={() =>
              createTx.mutate({
                accountId: txForm.accountId,
                txDate: txForm.txDate,
                label: txForm.label,
                direction: txForm.direction as "encaissement" | "decaissement",
                amount: parseTND(txForm.amount),
                category: txForm.category,
                reference: txForm.reference || undefined,
              })
            }
          >
            {createTx.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </Modal>
    </>
  );
}
