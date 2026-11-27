// ── SERVICE: TVA ─────────────────────────────────────────────────────────────
// Couche métier distincte (architecture MVC : ce fichier = Model/Service, les
// routeurs = Controller, les pages React = View).
//
// Règle tunisienne appliquée :
//   TVA collectée  = TVA facturée aux clients (factures de vente non brouillon)
//   TVA déductible = TVA payée aux fournisseurs (factures d'achat non brouillon)
//   TVA à payer    = collectée − déductible   (si > 0)
//   Crédit de TVA  = déductible − collectée   (si > 0, reportable)
//
// Le calcul se fait par ligne de document, car une facture peut mélanger
// plusieurs taux (19 %, 13 %, 7 %, 0 %). Montants en millimes (entiers).
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../_core/db";
import { billLines, bills, invoiceLines, invoices } from "../../drizzle/schema";

export type VatPeriod = { from: string; to: string };

export type VatLine = { rate: number; base: number; vat: number };

export type VatSide = {
  base: number;
  vat: number;
  byRate: VatLine[];
  documents: number;
};

export type VatSummary = {
  period: VatPeriod;
  collected: VatSide;
  deductible: VatSide;
  /** Solde : positif = à payer, négatif = crédit reportable. */
  balance: number;
  toPay: number;
  credit: number;
  /** Taux effectif de TVA sur les ventes (%). */
  effectiveRate: number;
};

function groupByRate(rows: { rate: number; base: number; vat: number }[]): VatLine[] {
  const map = new Map<number, VatLine>();
  for (const r of rows) {
    const cur = map.get(r.rate) ?? { rate: r.rate, base: 0, vat: 0 };
    cur.base += r.base;
    cur.vat += r.vat;
    map.set(r.rate, cur);
  }
  return [...map.values()].sort((a, b) => b.rate - a.rate);
}

function side(rows: { rate: number; base: number; vat: number }[], documents: number): VatSide {
  return {
    base: rows.reduce((s, r) => s + r.base, 0),
    vat: rows.reduce((s, r) => s + r.vat, 0),
    byRate: groupByRate(rows),
    documents,
  };
}

/**
 * Calcule la situation TVA d'une période à partir des documents validés.
 * Les brouillons sont exclus : une TVA n'est due qu'une fois la facture émise.
 */
export async function computeVat(ownerId: string, period: VatPeriod): Promise<VatSummary> {
  const [sales, purchases] = await Promise.all([
    db
      .select({
        rate: invoiceLines.vatRate,
        base: sql<number>`coalesce(sum(${invoiceLines.lineHt}), 0)::int`,
        vat: sql<number>`coalesce(sum(${invoiceLines.lineVat}), 0)::int`,
        docs: sql<number>`count(distinct ${invoices.id})::int`,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.ownerId, ownerId),
          gte(invoices.issueDate, period.from),
          lte(invoices.issueDate, period.to),
          sql`${invoices.status} <> 'brouillon'`,
        ),
      )
      .groupBy(invoiceLines.vatRate),
    db
      .select({
        rate: billLines.vatRate,
        base: sql<number>`coalesce(sum(${billLines.lineHt}), 0)::int`,
        vat: sql<number>`coalesce(sum(${billLines.lineVat}), 0)::int`,
        docs: sql<number>`count(distinct ${bills.id})::int`,
      })
      .from(billLines)
      .innerJoin(bills, eq(billLines.billId, bills.id))
      .where(
        and(
          eq(bills.ownerId, ownerId),
          gte(bills.issueDate, period.from),
          lte(bills.issueDate, period.to),
          sql`${bills.status} <> 'brouillon'`,
        ),
      )
      .groupBy(billLines.vatRate),
  ]);

  const collected = side(
    sales.map((r: { rate: number; base: unknown; vat: unknown }) => ({
      rate: r.rate,
      base: Number(r.base),
      vat: Number(r.vat),
    })),
    sales.reduce((s: number, r: { docs: unknown }) => s + Number(r.docs), 0),
  );
  const deductible = side(
    purchases.map((r: { rate: number; base: unknown; vat: unknown }) => ({
      rate: r.rate,
      base: Number(r.base),
      vat: Number(r.vat),
    })),
    purchases.reduce((s: number, r: { docs: unknown }) => s + Number(r.docs), 0),
  );

  const balance = collected.vat - deductible.vat;

  return {
    period,
    collected,
    deductible,
    balance,
    toPay: balance > 0 ? balance : 0,
    credit: balance < 0 ? -balance : 0,
    effectiveRate: collected.base > 0 ? Math.round((collected.vat / collected.base) * 10000) / 100 : 0,
  };
}

/** Bornes d'un mois (YYYY-MM) en dates ISO. */
export function monthPeriod(month: string): VatPeriod {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Bornes d'un trimestre (YYYY-T1..T4). */
export function quarterPeriod(quarter: string): VatPeriod {
  const [yStr, qStr] = quarter.split("-T");
  const y = Number(yStr);
  const q = Number(qStr);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return {
    from: `${y}-${String(startMonth).padStart(2, "0")}-01`,
    to: `${y}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}

/** Échéance légale de la déclaration : le 15 du mois suivant la période. */
export function vatDueDate(period: VatPeriod): string {
  const d = new Date(`${period.to}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-15`;
}
