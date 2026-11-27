import { useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Loading, Money, PageHeader, Panel, Stat, Table } from "@/components/primitives";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuarter() {
  const d = new Date();
  return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
}

export default function Vat() {
  const [mode, setMode] = useState<"mois" | "trimestre">("mois");
  const [month, setMonth] = useState(currentMonth());
  const [quarter, setQuarter] = useState(currentQuarter());

  const utils = trpc.useUtils();
  const summary = trpc.vat.summary.useQuery(
    mode === "mois" ? { month } : { quarter },
  );
  const generate = trpc.vat.generateDeclaration.useMutation({
    onSuccess: () => {
      utils.tax.list.invalidate();
      utils.vat.summary.invalidate();
    },
  });

  const s = summary.data;

  return (
    <>
      <PageHeader
        title="TVA — collectée & déductible"
        subtitle="Suivi séparé, solde à payer ou crédit reportable, déclaration prête à transmettre"
        actions={
          <button
            className="erp-btn-gold"
            onClick={() => generate.mutate(mode === "mois" ? { month } : { quarter })}
            disabled={generate.isPending || !s}
          >
            {generate.isPending ? "Génération…" : "Générer la déclaration"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {(["mois", "trimestre"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
                  : "rounded px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              }
            >
              {m === "mois" ? "Mensuelle" : "Trimestrielle"}
            </button>
          ))}
        </div>
        {mode === "mois" ? (
          <input type="month" className="erp-input max-w-[180px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        ) : (
          <select className="erp-select max-w-[180px]" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={`${new Date().getFullYear()}-T${q}`}>
                T{q} {new Date().getFullYear()}
              </option>
            ))}
          </select>
        )}
        {s && (
          <span className="text-[12px] text-muted-foreground">
            Période du {new Date(s.period.from).toLocaleDateString("fr-FR")} au{" "}
            {new Date(s.period.to).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      {generate.data && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-[12.5px] text-success">
          Déclaration TVA générée pour {generate.data.period} — échéance le{" "}
          {new Date(generate.data.dueDate).toLocaleDateString("fr-FR")}. Elle est disponible dans Fiscalité et prête à
          être transmise à la TTN.
        </div>
      )}

      {summary.isLoading ? (
        <Loading />
      ) : !s ? (
        <Panel>
          <EmptyState icon="◈" title="Aucune donnée" description="Choisissez une période pour calculer la TVA." />
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="TVA collectée" value={<Money value={s.collected.vat} />} hint={`${s.collected.documents} facture(s) de vente`} tone="info" />
            <Stat label="TVA déductible" value={<Money value={s.deductible.vat} />} hint={`${s.deductible.documents} facture(s) d'achat`} tone="gold" />
            <Stat
              label={s.toPay > 0 ? "TVA à payer" : "Crédit de TVA"}
              value={<Money value={s.toPay > 0 ? s.toPay : s.credit} />}
              hint={s.toPay > 0 ? "À verser au Trésor" : "Reportable sur la période suivante"}
              tone={s.toPay > 0 ? "danger" : "success"}
            />
            <Stat label="Taux effectif" value={`${s.effectiveRate.toFixed(2)} %`} hint="TVA / base imposable des ventes" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="TVA collectée" subtitle="Facturée à vos clients" noPad>
              {s.collected.byRate.length === 0 ? (
                <EmptyState
                  icon="↑"
                  title="Aucune vente sur la période"
                  description="La TVA collectée apparaîtra ici dès qu'une facture de vente sera émise sur cette période."
                />
              ) : (
                <Table head={["Taux", "Base HT", "TVA", "Part"]}>
                  {s.collected.byRate.map((r) => (
                    <tr key={r.rate}>
                      <td>
                        <Badge tone={r.rate === 19 ? "info" : "muted"}>{r.rate} %</Badge>
                      </td>
                      <td className="text-right"><Money value={r.base} /></td>
                      <td className="text-right"><Money value={r.vat} bold /></td>
                      <td className="text-right text-muted-foreground">
                        {s.collected.vat > 0 ? ((r.vat / s.collected.vat) * 100).toFixed(1) : "0.0"} %
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-secondary/50 font-semibold">
                    <td>Total</td>
                    <td className="text-right"><Money value={s.collected.base} bold /></td>
                    <td className="text-right"><Money value={s.collected.vat} bold /></td>
                    <td className="text-right">100 %</td>
                  </tr>
                </Table>
              )}
            </Panel>

            <Panel title="TVA déductible" subtitle="Payée à vos fournisseurs" noPad>
              {s.deductible.byRate.length === 0 ? (
                <EmptyState
                  icon="↓"
                  title="Aucun achat sur la période"
                  description="La TVA déductible apparaîtra ici dès qu'une facture d'achat sera saisie sur cette période."
                />
              ) : (
                <Table head={["Taux", "Base HT", "TVA", "Part"]}>
                  {s.deductible.byRate.map((r) => (
                    <tr key={r.rate}>
                      <td>
                        <Badge tone={r.rate === 19 ? "gold" : "muted"}>{r.rate} %</Badge>
                      </td>
                      <td className="text-right"><Money value={r.base} /></td>
                      <td className="text-right"><Money value={r.vat} bold /></td>
                      <td className="text-right text-muted-foreground">
                        {s.deductible.vat > 0 ? ((r.vat / s.deductible.vat) * 100).toFixed(1) : "0.0"} %
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-secondary/50 font-semibold">
                    <td>Total</td>
                    <td className="text-right"><Money value={s.deductible.base} bold /></td>
                    <td className="text-right"><Money value={s.deductible.vat} bold /></td>
                    <td className="text-right">100 %</td>
                  </tr>
                </Table>
              )}
            </Panel>
          </div>

          <Panel title="Liquidation de la TVA" subtitle="Solde de la période" className="mt-4">
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between border-b border-border pb-1.5">
                <span className="text-muted-foreground">TVA collectée sur ventes</span>
                <Money value={s.collected.vat} bold />
              </div>
              <div className="flex justify-between border-b border-border pb-1.5">
                <span className="text-muted-foreground">TVA déductible sur achats</span>
                <span className="num font-medium">− <Money value={s.deductible.vat} /></span>
              </div>
              <div className="flex justify-between pt-1 text-[15px] font-semibold">
                <span>{s.balance >= 0 ? "TVA à payer" : "Crédit de TVA reportable"}</span>
                <Money value={Math.abs(s.balance)} bold />
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-secondary/50 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
              La déclaration est due le 15 du mois suivant la période. Un crédit de TVA se reporte sur les périodes
              suivantes ; il n'est remboursé que sur demande expresse. Les factures en brouillon sont exclues du calcul.
            </p>
          </Panel>
        </>
      )}
    </>
  );
}
