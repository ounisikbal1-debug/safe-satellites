import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import {
  CNSS_EMPLOYEE_RATE,
  CNSS_EMPLOYER_RATE,
  CSS_RATE,
  IRPP_BRACKETS,
  computePayslip,
  computeIrppAnnual,
  currentPeriod,
  fmtTND,
  periodLabel,
} from "../../../shared/fiscal";

export default function Payroll() {
  const utils = trpc.useUtils();
  const runs = trpc.payroll.list.useQuery();
  const employees = trpc.employees.list.useQuery();
  const create = trpc.payroll.create.useMutation({
    onSuccess: () => {
      utils.payroll.list.invalidate();
      utils.dashboard.get.invalidate();
      setOpen(false);
      setSelected(null);
    },
  });

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());

  const active = useMemo(() => (employees.data ?? []).filter((e) => e.status === "actif"), [employees.data]);

  const preview = useMemo(
    () =>
      active.map((e) => {
        const p = computePayslip({
          baseSalary: e.baseSalary,
          allowances: e.allowances,
          headOfFamily: e.headOfFamily,
          children: e.children,
        });
        return { emp: e, ...p };
      }),
    [active],
  );

  const totals = preview.reduce(
    (a, p) => ({
      gross: a.gross + p.gross,
      cnssE: a.cnssE + p.cnssEmployee,
      cnssR: a.cnssR + p.cnssEmployer,
      css: a.css + p.css,
      irpp: a.irpp + p.irpp,
      net: a.net + p.net,
    }),
    { gross: 0, cnssE: 0, cnssR: 0, css: 0, irpp: 0, net: 0 },
  );

  function generate() {
    if (preview.length === 0) return;
    create.mutate({
      period,
      label: `Paie ${periodLabel(period)}`,
      payslips: preview.map((p) => ({
        employeeId: p.emp.id,
        employeeName: `${p.emp.firstName} ${p.emp.lastName}`,
        matricule: p.emp.matricule,
        baseSalary: p.emp.baseSalary,
        allowances: p.emp.allowances,
        gross: p.gross,
        cnssEmployee: p.cnssEmployee,
        cnssEmployer: p.cnssEmployer,
        css: p.css,
        taxableBase: p.taxableBase,
        irpp: p.irpp,
        net: p.net,
      })),
    });
  }

  const detail = trpc.payroll.get.useQuery({ id: selected ?? "00000000-0000-0000-0000-000000000000" }, { enabled: !!selected });

  return (
    <>
      <PageHeader
        title="Paie & bulletins"
        subtitle="IRPP 8 tranches (0 % → 40 %) · CNSS 9,68 % / 17,07 % · CSS 0,5 %"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
            + Lancer un cycle de paie
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Salariés actifs" value={String(active.length)} hint="Base de calcul du prochain cycle" />
        <Stat label="Brut soumis" value={fmtTND(totals.gross)} hint={`CNSS salarié ${CNSS_EMPLOYEE_RATE} %`} />
        <Stat label="IRPP à retenir" value={fmtTND(totals.irpp)} hint="Barème progressif annuel ÷ 12" tone="gold" />
        <Stat label="Net à payer" value={fmtTND(totals.net)} hint={`CSS ${CSS_RATE} % déduite`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Cycles de paie" subtitle="Historique des bulletins générés" className="xl:col-span-2" noPad>
          {runs.isLoading ? (
            <Loading />
          ) : (runs.data ?? []).length === 0 ? (
            <EmptyState
              icon="◫"
              title="Aucun cycle de paie"
              description="Lancez votre premier cycle : l'ERP calcule automatiquement la CNSS salarié (9,68 %), employeur (17,07 %), la CSS (0,5 %) et l'IRPP selon le barème tunisien à 8 tranches."
              action={
                <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
                  {active.length === 0 ? "Créez d'abord des salariés" : "Lancer un cycle"}
                </button>
              }
            />
          ) : (
            <Table head={["Période", "Statut", "Brut", "CNSS salarié", "IRPP", "Net à payer"]}>
              {(runs.data ?? []).map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                  <td className="font-medium">{periodLabel(r.period)}</td>
                  <td>
                    <Badge tone="success">Validée</Badge>
                  </td>
                  <td className="text-right"><Money value={r.totalGross} /></td>
                  <td className="text-right"><Money value={r.totalCnssEmployee} /></td>
                  <td className="text-right"><Money value={r.totalIrpp} /></td>
                  <td className="text-right"><Money value={r.totalNet} bold /></td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Barème IRPP" subtitle="8 tranches annuelles — 0 % à 40 %">
          <div className="space-y-1.5">
            {IRPP_BRACKETS.map((b, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-secondary/50 px-2.5 py-1.5 text-[12px]">
                <span className="text-muted-foreground">
                  {b.from.toLocaleString("fr-FR")} – {b.to === null ? "∞" : b.to.toLocaleString("fr-FR")}
                </span>
                <span className="num font-semibold">{b.rate} %</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Abattement chef de famille : 300 TND/an · 100 TND par personne à charge.
          </p>
        </Panel>
      </div>

      {/* Bulletins du cycle sélectionné */}
      {selected && detail.data && (
        <Panel
          title={`Bulletins — ${periodLabel(detail.data.period)}`}
          className="mt-4"
          noPad
          actions={
            <button className="erp-btn-ghost h-8 text-[12px] no-print" onClick={() => window.print()}>
              Imprimer
            </button>
          }
        >
          <Table
            head={[
              "Salarié",
              "Matricule",
              "Brut",
              "CNSS 9,68 %",
              "CSS 0,5 %",
              "Base imposable",
              "IRPP",
              "Net à payer",
              "CNSS employeur",
            ]}
          >
            {detail.data.payslips.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.employeeName}</td>
                <td className="font-mono text-[12px] text-muted-foreground">{p.matricule}</td>
                <td className="text-right"><Money value={p.gross} /></td>
                <td className="text-right"><Money value={p.cnssEmployee} /></td>
                <td className="text-right"><Money value={p.css} /></td>
                <td className="text-right"><Money value={p.taxableBase} /></td>
                <td className="text-right"><Money value={p.irpp} /></td>
                <td className="text-right"><Money value={p.net} bold /></td>
                <td className="text-right text-muted-foreground"><Money value={p.cnssEmployer} /></td>
              </tr>
            ))}
            <tr className="bg-gold-soft/40 font-semibold">
              <td colSpan={2}>Totaux</td>
              <td className="text-right"><Money value={detail.data.totalGross} bold /></td>
              <td className="text-right"><Money value={detail.data.totalCnssEmployee} bold /></td>
              <td className="text-right"><Money value={detail.data.totalCss} bold /></td>
              <td />
              <td className="text-right"><Money value={detail.data.totalIrpp} bold /></td>
              <td className="text-right"><Money value={detail.data.totalNet} bold /></td>
              <td className="text-right"><Money value={detail.data.totalCnssEmployer} bold /></td>
            </tr>
          </Table>
        </Panel>
      )}

      {/* Modale de lancement */}
      <Modal open={open} onClose={() => setOpen(false)} title="Lancer un cycle de paie" wide>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Période">
            <input type="month" className="erp-input" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <div className="rounded-lg bg-gold-soft/50 p-3 text-[12px] leading-relaxed">
            <p className="font-semibold text-[hsl(38_72%_30%)]">Taux appliqués</p>
            <p className="mt-1 text-muted-foreground">
              CNSS salarié {CNSS_EMPLOYEE_RATE} % · CNSS employeur {CNSS_EMPLOYER_RATE} % · CSS {CSS_RATE} % ·
              IRPP 8 tranches
            </p>
          </div>
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-lg border border-border">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Salarié</th>
                <th className="text-right">Brut</th>
                <th className="text-right">CNSS</th>
                <th className="text-right">CSS</th>
                <th className="text-right">IRPP</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.emp.id}>
                  <td className="font-medium">
                    {p.emp.firstName} {p.emp.lastName}
                    {p.emp.headOfFamily && <span className="ml-1.5 text-[10px] text-gold">CF</span>}
                  </td>
                  <td className="text-right"><Money value={p.gross} /></td>
                  <td className="text-right"><Money value={p.cnssEmployee} /></td>
                  <td className="text-right"><Money value={p.css} /></td>
                  <td className="text-right"><Money value={p.irpp} /></td>
                  <td className="text-right"><Money value={p.net} bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total brut</span>
            <Money value={totals.gross} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net à payer</span>
            <Money value={totals.net} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Charges patronales (CNSS 17,07 %)</span>
            <Money value={totals.cnssR} bold />
          </div>
        </div>

        {create.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{create.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={generate} disabled={create.isPending || preview.length === 0}>
            {create.isPending ? "Calcul…" : `Générer ${preview.length} bulletin(s)`}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Page simplifiée de démonstration du calcul IRPP annuel. */
export function IrppSimulator() {
  const [annual, setAnnual] = useState("48000");
  const taxable = Math.round(Number(annual.replace(/\s/g, "").replace(",", ".")) * 1000) || 0;
  const { total, detail } = computeIrppAnnual(taxable);
  const net = Math.max(0, taxable - total);
  const effective = taxable > 0 ? (total / taxable) * 100 : 0;

  return (
    <Panel title="Simulateur IRPP annuel" subtitle="Revenu net imposable → impôt dû">
      <Field label="Revenu net imposable annuel (TND)">
        <input className="erp-input" value={annual} onChange={(e) => setAnnual(e.target.value)} />
      </Field>
      <div className="mt-3 space-y-1">
        {detail.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-muted-foreground">
            Revenu inférieur au seuil imposable — aucun IRPP dû.
          </p>
        ) : (
          detail.map((d, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-secondary/50 px-2.5 py-1.5 text-[12px]">
              <span className="text-muted-foreground">
                {d.from.toLocaleString("fr-FR")} – {d.to === null ? "∞" : d.to.toLocaleString("fr-FR")} · {d.rate} %
              </span>
              <span className="num">
                <Money value={d.base} className="mr-3 text-muted-foreground" />
                <span className="font-semibold">{fmtTND(d.tax)}</span>
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 space-y-1.5 rounded-lg bg-gold-soft/60 p-3 text-[12.5px]">
        <div className="flex justify-between">
          <span>IRPP annuel</span>
          <span className="num font-semibold">{fmtTND(total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Taux effectif</span>
          <span className="num font-semibold">{effective.toFixed(2)} %</span>
        </div>
        <div className="flex justify-between border-t border-gold/30 pt-1.5">
          <span>Revenu net après impôt</span>
          <span className="num font-semibold">{fmtTND(net)}</span>
        </div>
      </div>
    </Panel>
  );
}
