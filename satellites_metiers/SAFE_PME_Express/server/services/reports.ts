// ── SERVICE : rapports financiers (Bilan & Compte de Résultat) ───────────────
// Construit les deux états à partir des soldes du grand livre, par classe de
// comptes du plan comptable tunisien. Montants en millimes.
import { getAccountBalances } from "../db";

export type ReportLine = { code: string; label: string; amount: number };
export type ReportSection = { title: string; lines: ReportLine[]; total: number };

export type BalanceSheet = {
  from: string;
  to: string;
  assets: ReportSection[];
  liabilities: ReportSection[];
  totalAssets: number;
  totalLiabilities: number;
  /** Résultat de l'exercice (produits − charges) intégré aux capitaux propres. */
  result: number;
  balanced: boolean;
};

export type IncomeStatement = {
  from: string;
  to: string;
  revenue: ReportSection;
  expenses: ReportSection[];
  totalRevenue: number;
  totalExpenses: number;
  grossResult: number;
  /** Résultat net après IS estimé. */
  netResult: number;
  isRate: number;
  isAmount: number;
};

type Bal = { accountCode: string; accountLabel: string; debit: number; credit: number };

function firstDigit(code: string): string {
  return code.trim().charAt(0);
}

function sum(rows: Bal[], pred: (c: string) => boolean, side: "debit" | "credit"): number {
  return rows.filter((r) => pred(r.accountCode)).reduce((s, r) => s + (side === "debit" ? r.debit : r.credit), 0);
}

function lines(rows: Bal[], pred: (c: string) => boolean, side: "debit" | "credit"): ReportLine[] {
  return rows
    .filter((r) => pred(r.accountCode))
    .map((r) => ({
      code: r.accountCode,
      label: r.accountLabel || r.accountCode,
      amount: side === "debit" ? r.debit - r.credit : r.credit - r.debit,
    }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Bilan : actif = classes 2, 3, 4 (débiteurs), 5 ; passif = classes 1, 4
 * (créditeurs) + résultat de l'exercice.
 */
export async function buildBalanceSheet(ownerId: string, from: string, to: string): Promise<BalanceSheet> {
  const rows = (await getAccountBalances(ownerId, from, to)) as Bal[];

  // Actif immobilisé (classe 2, net des amortissements)
  const immobilisations = lines(rows, (c) => firstDigit(c) === "2" && !c.startsWith("28"), "debit");
  const amortissements = lines(rows, (c) => c.startsWith("28"), "credit");
  const netImmobilisations = immobilisations.reduce((s, l) => s + l.amount, 0) - amortissements.reduce((s, l) => s + l.amount, 0);

  // Stocks (classe 3)
  const stocks = lines(rows, (c) => firstDigit(c) === "3", "debit");

  // Créances (classe 4, solde débiteur)
  const creances = rows
    .filter((r) => firstDigit(r.accountCode) === "4" && r.debit - r.credit > 0)
    .map((r) => ({ code: r.accountCode, label: r.accountLabel || r.accountCode, amount: r.debit - r.credit }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Trésorerie (classe 5)
  const tresorerie = lines(rows, (c) => firstDigit(c) === "5", "debit");

  const assets: ReportSection[] = [
    { title: "Actif immobilisé net", lines: [...immobilisations, ...amortissements.map((a) => ({ ...a, amount: -a.amount }))], total: netImmobilisations },
    { title: "Stocks", lines: stocks, total: stocks.reduce((s, l) => s + l.amount, 0) },
    { title: "Créances et comptes rattachés", lines: creances, total: creances.reduce((s, l) => s + l.amount, 0) },
    { title: "Trésorerie — actif", lines: tresorerie, total: tresorerie.reduce((s, l) => s + l.amount, 0) },
  ];

  // Passif : capitaux propres (classe 1)
  const capitaux = lines(rows, (c) => firstDigit(c) === "1", "credit");

  // Dettes (classe 4, solde créditeur)
  const dettes = rows
    .filter((r) => firstDigit(r.accountCode) === "4" && r.credit - r.debit > 0)
    .map((r) => ({ code: r.accountCode, label: r.accountLabel || r.accountCode, amount: r.credit - r.debit }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Résultat = produits (7) − charges (6)
  const produits = sum(rows, (c) => firstDigit(c) === "7", "credit");
  const charges = sum(rows, (c) => firstDigit(c) === "6", "debit");
  const result = produits - charges;

  const liabilities: ReportSection[] = [
    { title: "Capitaux propres", lines: capitaux, total: capitaux.reduce((s, l) => s + l.amount, 0) },
    { title: "Résultat de l'exercice", lines: [{ code: "12", label: result >= 0 ? "Bénéfice" : "Perte", amount: result }], total: result },
    { title: "Dettes", lines: dettes, total: dettes.reduce((s, l) => s + l.amount, 0) },
  ];

  const totalAssets = assets.reduce((s, x) => s + x.total, 0);
  const totalLiabilities = liabilities.reduce((s, x) => s + x.total, 0);

  return {
    from,
    to,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    result,
    balanced: totalAssets === totalLiabilities,
  };
}

/** Compte de résultat : produits (classe 7) − charges (classe 6), puis IS. */
export async function buildIncomeStatement(
  ownerId: string,
  from: string,
  to: string,
  isRate = 15,
): Promise<IncomeStatement> {
  const rows = (await getAccountBalances(ownerId, from, to)) as Bal[];

  const revenueLines = lines(rows, (c) => firstDigit(c) === "7", "credit");
  const revenue: ReportSection = {
    title: "Produits d'exploitation",
    lines: revenueLines,
    total: revenueLines.reduce((s, l) => s + l.amount, 0),
  };

  const chargeGroups: { title: string; pred: (c: string) => boolean }[] = [
    { title: "Achats consommés", pred: (c) => c.startsWith("60") || c.startsWith("61") },
    { title: "Charges de personnel", pred: (c) => c.startsWith("64") },
    { title: "Impôts et taxes", pred: (c) => c.startsWith("63") },
    { title: "Dotations aux amortissements", pred: (c) => c.startsWith("68") },
    { title: "Autres charges", pred: (c) => firstDigit(c) === "6" && !/^(60|61|63|64|68)/.test(c) },
  ];

  const expenses: ReportSection[] = chargeGroups
    .map((g) => {
      const ls = lines(rows, g.pred, "debit");
      return { title: g.title, lines: ls, total: ls.reduce((s, l) => s + l.amount, 0) };
    })
    .filter((s) => s.lines.length > 0);

  const totalRevenue = revenue.total;
  const totalExpenses = expenses.reduce((s, x) => s + x.total, 0);
  const grossResult = totalRevenue - totalExpenses;
  const isAmount = grossResult > 0 ? Math.round((grossResult * isRate) / 100) : 0;
  const netResult = grossResult - isAmount;

  return {
    from,
    to,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    grossResult,
    netResult,
    isRate,
    isAmount,
  };
}
