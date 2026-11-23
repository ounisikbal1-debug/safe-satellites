import { trpc } from "@/_core/trpc";
import { EmptyState, Loading, Money, PageHeader, Panel, Stat, Badge, Table } from "@/components/primitives";
import { Donut, GroupedBars, HBars, LineChart } from "@/components/charts";
import { fmtTND, INVOICE_STATUS } from "../../../shared/fiscal";
import { Link } from "wouter";

export default function Dashboard() {
  const dash = trpc.dashboard.get.useQuery();
  const d = dash.data;

  if (dash.isLoading) {
    return (
      <>
        <PageHeader title="Tableau de bord" subtitle="Vue consolidée de l'activité" />
        <Panel>
          <Loading />
        </Panel>
      </>
    );
  }

  const months = (d?.monthly ?? []).slice(-8);
  const chartData = months.map((m) => ({
    label: m.month.slice(5) + "/" + m.month.slice(2, 4),
    a: m.ht,
    b: m.purchases ?? 0,
  }));
  const trendData = months.map((m) => ({
    label: m.month.slice(5) + "/" + m.month.slice(2, 4),
    value: m.ht,
  }));

  const marge = (d?.revenueHt ?? 0) - (d?.purchaseHt ?? 0);
  const margePct = d && d.revenueHt > 0 ? (marge / d.revenueHt) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue consolidée de l'activité, de la fiscalité et de la trésorerie"
        actions={
          <Link href="/factures/nouvelle" className="erp-btn-gold">
            + Nouvelle facture
          </Link>
        }
      />

      {/* KPI principaux */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Chiffre d'affaires HT" value={fmtTND(d?.revenueHt ?? 0)} hint={`${d?.invoiceCount ?? 0} facture(s) émise(s)`} tone="gold" />
        <Stat label="Marge brute" value={fmtTND(marge)} hint={`${margePct.toFixed(1)} % du CA`} tone={marge >= 0 ? "success" : "danger"} />
        <Stat label="Trésorerie" value={fmtTND(d?.cash ?? 0)} hint="Banque + caisse" />
        <Stat label="TVA à payer" value={fmtTND(d?.vatDue ?? 0)} hint="Collectée − déductible" tone={d && d.vatDue > 0 ? "danger" : "success"} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Achats HT" value={fmtTND(d?.purchaseHt ?? 0)} hint="Factures fournisseurs" />
        <Stat label="Effectif actif" value={String(d?.employees ?? 0)} hint="Salariés déclarés CNSS" />
        <Stat label="Masse salariale brute" value={fmtTND(d?.payrollGross ?? 0)} hint={`Net payé ${fmtTND(d?.payrollNet ?? 0)}`} />
        <Stat label="Immobilisations nettes" value={fmtTND((d?.assetsCost ?? 0) - (d?.assetsAccumulated ?? 0))} hint={`Valeur brute ${fmtTND(d?.assetsCost ?? 0)}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Ventes et achats par mois"
          subtitle="Montants hors taxes, 8 derniers mois — survolez une colonne"
          className="xl:col-span-2"
        >
          {chartData.length === 0 ? (
            <EmptyState
              title="Aucune facture enregistrée"
              description="Le graphique s'alimentera dès la première facture de vente validée."
              action={
                <Link href="/factures/nouvelle" className="erp-btn-gold">
                  Créer une facture
                </Link>
              }
            />
          ) : (
            <GroupedBars data={chartData} height={210} />
          )}
        </Panel>

        <Panel title="Situation fiscale" subtitle="Ce que l'entreprise doit au Trésor">
          <div className="space-y-3">
            {[
              { label: "TVA nette due", value: Math.max(0, d?.vatDue ?? 0) },
              { label: "IRPP retenu sur salaires", value: d?.payrollIrpp ?? 0 },
              { label: "CNSS salarié retenue", value: d?.payrollCnss ?? 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-border/60 pb-2.5 last:border-0">
                <span className="text-[12.5px] text-muted-foreground">{r.label}</span>
                <Money value={r.value} bold />
              </div>
            ))}
            <div className="rounded-lg bg-gold-soft/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(38_72%_30%)]">
                Total à décaisser
              </p>
              <p className="num mt-1 text-[18px] font-semibold text-[hsl(38_72%_28%)]">
                {fmtTND(Math.max(0, d?.vatDue ?? 0) + (d?.payrollIrpp ?? 0) + (d?.payrollCnss ?? 0))}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Évolution du chiffre d'affaires" subtitle="Courbe des ventes HT — survolez un point" className="xl:col-span-2">
          {trendData.length === 0 ? (
            <EmptyState title="Pas encore d'historique" description="La courbe apparaîtra dès la première facture." />
          ) : (
            <LineChart data={trendData} height={200} label="CA HT" />
          )}
        </Panel>

        <Panel title="Répartition des charges" subtitle="Structure des décaissements">
          <Donut
            data={[
              { label: "Achats HT", value: d?.purchaseHt ?? 0 },
              { label: "Masse salariale", value: d?.payrollGross ?? 0 },
              { label: "TVA due", value: Math.max(0, d?.vatDue ?? 0) },
            ]}
            centerLabel="Total"
            centerValue={fmtTND((d?.purchaseHt ?? 0) + (d?.payrollGross ?? 0) + Math.max(0, d?.vatDue ?? 0))}
          />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Top clients" subtitle="Chiffre d'affaires HT par client">
          {(d?.topClients ?? []).length === 0 ? (
            <EmptyState title="Aucun client facturé" description="Le classement se remplira avec vos premières factures." />
          ) : (
            <HBars data={(d?.topClients ?? []).map((c) => ({ label: c.name, value: c.total }))} />
          )}
        </Panel>

        <Panel title="Masse salariale" subtitle="Coût employeur et net versé">
          <div className="space-y-3">
            {[
              { label: "Salaire brut cumulé", value: d?.payrollGross ?? 0 },
              { label: "Net payé aux salariés", value: d?.payrollNet ?? 0 },
              { label: "CNSS salarié retenue (9,68 %)", value: d?.payrollCnss ?? 0 },
              { label: "IRPP retenu à la source", value: d?.payrollIrpp ?? 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-border/60 pb-2.5 last:border-0">
                <span className="text-[12.5px] text-muted-foreground">{r.label}</span>
                <Money value={r.value} bold />
              </div>
            ))}
            <div className="rounded-lg bg-secondary/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Charges patronales CNSS (17,07 %)
              </p>
              <p className="num mt-1 text-[16px] font-semibold text-navy">
                {fmtTND(Math.round((d?.payrollGross ?? 0) * 0.1707))}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Dernières factures" subtitle="Mouvements récents" className="mt-4" noPad>
        {(d?.recentInvoices ?? []).length === 0 ? (
          <EmptyState
            icon="▤"
            title="Aucune facture pour le moment"
            description="Créez votre première facture client : la TVA, le timbre fiscal et les totaux sont calculés automatiquement."
            action={
              <Link href="/factures/nouvelle" className="erp-btn-gold">
                Créer une facture
              </Link>
            }
          />
        ) : (
          <Table head={["N°", "Client", "Date", "Statut", "Total TTC"]}>
            {d!.recentInvoices.map((inv) => {
              const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.brouillon;
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-[12px]">
                    <Link href={`/factures/${inv.id}`} className="text-info hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="font-medium">{inv.partnerName}</td>
                  <td className="text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="text-right">
                    <Money value={inv.totalTtc} bold />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
