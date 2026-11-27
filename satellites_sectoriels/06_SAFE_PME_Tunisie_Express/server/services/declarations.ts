// ── SERVICE : déclarations sociales et fiscales ──────────────────────────────
// Calcule les déclarations à partir des données réelles de l'ERP :
//   · CNSS mensuelle (salarié 9,68 % + employeur 17,07 % + CSS 0,5 %)
//   · TVA mensuelle / trimestrielle (collectée − déductible)
//   · Dépôt du bilan annuel (IS 15 % / 20 % + acomptes)
// Montants en millimes.
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../_core/db";
import { payrollRuns, payslips, taxDeclarations } from "../../drizzle/schema";
import { CNSS_EMPLOYEE_RATE, CNSS_EMPLOYER_RATE, CSS_RATE, IS_INSTALLMENT_RATE } from "../../shared/fiscal";

export type CnssDeclaration = {
  period: string;
  dueDate: string;
  employees: number;
  grossBase: number;
  employeeShare: number;
  employerShare: number;
  css: number;
  total: number;
  lines: { matricule: string; name: string; gross: number; employee: number; employer: number; css: number }[];
};

/** Déclaration CNSS d'un mois (YYYY-MM). Échéance : le 15 du mois suivant. */
export async function buildCnssDeclaration(ownerId: string, period: string): Promise<CnssDeclaration> {
  const [y, m] = period.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const dueDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-15`;

  const rows = await db
    .select({
      matricule: payslips.matricule,
      name: payslips.employeeName,
      gross: payslips.gross,
      cnssEmployee: payslips.cnssEmployee,
      cnssEmployer: payslips.cnssEmployer,
      css: payslips.css,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(and(eq(payslips.ownerId, ownerId), eq(payrollRuns.period, period)));

  const lines = rows.map((r) => ({
    matricule: r.matricule,
    name: r.name,
    gross: r.gross,
    employee: r.cnssEmployee,
    employer: r.cnssEmployer,
    css: r.css,
  }));

  const grossBase = lines.reduce((s, l) => s + l.gross, 0);
  const employeeShare = lines.reduce((s, l) => s + l.employee, 0);
  const employerShare = lines.reduce((s, l) => s + l.employer, 0);
  const css = lines.reduce((s, l) => s + l.css, 0);

  return {
    period,
    dueDate,
    employees: lines.length,
    grossBase,
    employeeShare,
    employerShare,
    css,
    total: employeeShare + employerShare + css,
    lines,
  };
}

/** Taux appliqués, exposés pour l'affichage et le contrôle. */
export const SOCIAL_RATES = {
  cnssEmployee: CNSS_EMPLOYEE_RATE,
  cnssEmployer: CNSS_EMPLOYER_RATE,
  css: CSS_RATE,
};

export type AnnualFiling = {
  fiscalYear: number;
  dueDate: string;
  revenue: number;
  expenses: number;
  result: number;
  isRate: number;
  isAmount: number;
  installmentsPaid: number;
  balanceDue: number;
  /** Acomptes provisionnels : 3 × 30 % de l'IS de référence. */
  installmentAmount: number;
  installmentDates: string[];
};

/**
 * Dépôt du bilan annuel : résultat fiscal, IS dû, acomptes provisionnels.
 * Échéance du dépôt : 31 mars de l'année suivante (déclaration annuelle).
 */
export async function buildAnnualFiling(
  fiscalYear: number,
  isRate: number,
  revenue: number,
  expenses: number,
  installmentsPaid = 0,
): Promise<AnnualFiling> {
  const result = revenue - expenses;
  const isAmount = result > 0 ? Math.round((result * isRate) / 100) : 0;
  const installmentAmount = Math.round((isAmount * IS_INSTALLMENT_RATE) / 100);
  return {
    fiscalYear,
    dueDate: `${fiscalYear + 1}-03-31`,
    revenue,
    expenses,
    result,
    isRate,
    isAmount,
    installmentsPaid,
    balanceDue: Math.max(0, isAmount - installmentsPaid),
    installmentAmount,
    installmentDates: [`${fiscalYear}-06-25`, `${fiscalYear}-09-25`, `${fiscalYear}-12-25`],
  };
}

/** Somme des déclarations d'un type sur une année (acomptes déjà réglés). */
export async function sumDeclarations(ownerId: string, kind: string, year: number): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${taxDeclarations.taxAmount}),0)::int` })
    .from(taxDeclarations)
    .where(
      and(
        eq(taxDeclarations.ownerId, ownerId),
        eq(taxDeclarations.kind, kind),
        eq(taxDeclarations.status, "payee"),
        sql`${taxDeclarations.period} like ${`${year}%`}`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** Bornes d'une année civile. */
export function yearPeriod(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Bornes d'un mois. */
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export { gte, lte };
