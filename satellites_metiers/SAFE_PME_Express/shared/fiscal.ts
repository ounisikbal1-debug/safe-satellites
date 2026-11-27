// ─────────────────────────────────────────────────────────────────────────────
// Moteur de calcul fiscal & social tunisien — partagé client ↔ serveur.
// Tous les montants sont en MILLIMES (1 TND = 1000 millimes), entiers.
// ─────────────────────────────────────────────────────────────────────────────

export const MILLIMES = 1000;

/** Formate un montant en millimes vers "1 234,567 TND". */
export function fmtTND(millimes: number, withCurrency = true): string {
  const v = (millimes ?? 0) / MILLIMES;
  const s = v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return withCurrency ? `${s} TND` : s;
}

/** Formate un montant en millimes sans séparateur de milliers (pour inputs). */
export function tndInput(millimes: number): string {
  return ((millimes ?? 0) / MILLIMES).toFixed(3);
}

/** Convertit une saisie "1 234,567" ou "1234.567" en millimes. */
export function parseTND(input: string | number): number {
  if (typeof input === "number") return Math.round(input * MILLIMES);
  const cleaned = String(input).replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * MILLIMES) : 0;
}

// ── IRPP : barème 8 tranches, 0 % → 40 % (annuel) ────────────────────────────
export type IrppBracket = { from: number; to: number | null; rate: number };

/** Bornes annuelles en TND (converties en millimes à l'usage). */
export const IRPP_BRACKETS: IrppBracket[] = [
  { from: 0, to: 5000, rate: 0 },
  { from: 5000, to: 10000, rate: 15 },
  { from: 10000, to: 20000, rate: 25 },
  { from: 20000, to: 30000, rate: 30 },
  { from: 30000, to: 40000, rate: 33 },
  { from: 40000, to: 50000, rate: 36 },
  { from: 50000, to: 70000, rate: 38 },
  { from: 70000, to: null, rate: 40 },
];

/** Abattement chef de famille (TND/an) et par personne à charge. */
export const IRPP_HEAD_OF_FAMILY_DEDUCTION = 300; // TND
export const IRPP_DEPENDENT_DEDUCTION = 100; // TND par personne à charge

/**
 * IRPP annuel sur un revenu net imposable (millimes).
 * Applique le barème progressif par tranches.
 */
export function computeIrppAnnual(taxableMillimes: number): {
  total: number;
  detail: { from: number; to: number | null; rate: number; base: number; tax: number }[];
} {
  const taxable = Math.max(0, taxableMillimes);
  let remaining = taxable;
  let total = 0;
  const detail: { from: number; to: number | null; rate: number; base: number; tax: number }[] = [];

  for (const b of IRPP_BRACKETS) {
    const fromM = b.from * MILLIMES;
    const toM = b.to === null ? Infinity : b.to * MILLIMES;
    const width = toM - fromM;
    const base = Math.max(0, Math.min(remaining, width));
    const tax = Math.round((base * b.rate) / 100);
    if (base > 0) {
      detail.push({ from: b.from, to: b.to, rate: b.rate, base, tax });
      total += tax;
      remaining -= base;
    }
    if (remaining <= 0) break;
  }
  return { total, detail };
}

/**
 * IRPP mensuel retenu à la source : barème annuel appliqué au salaire mensuel
 * annualisé, puis divisé par 12 (méthode de la retenue mensuelle tunisienne).
 */
export function computeIrppMonthly(
  monthlyTaxableMillimes: number,
  opts: { headOfFamily?: boolean; children?: number } = {},
): { monthly: number; annual: number; annualTaxable: number; detail: ReturnType<typeof computeIrppAnnual>["detail"] } {
  const annualTaxable = Math.max(0, monthlyTaxableMillimes) * 12;
  const { total, detail } = computeIrppAnnual(annualTaxable);
  // Abattements chef de famille / personnes à charge (en millimes)
  let deduction = 0;
  if (opts.headOfFamily) deduction += IRPP_HEAD_OF_FAMILY_DEDUCTION * MILLIMES;
  deduction += Math.max(0, opts.children ?? 0) * IRPP_DEPENDENT_DEDUCTION * MILLIMES;
  const annual = Math.max(0, total - deduction);
  return { monthly: Math.round(annual / 12), annual, annualTaxable, detail };
}

// ── Cotisations sociales & Assurances patronales modulables ───────────────────
export const CNSS_EMPLOYEE_RATE = 9.68; // %
export const CNSS_EMPLOYER_RATE = 17.07; // % (CNSS patronale 16.57% + Accident du travail 0.5%)
export const CSS_RATE = 0.5; // % contribution sociale de solidarité (0,5 %)
export const FOPROLOS_RATE = 1.0; // %
// 3 Assurances modulables exclusivement patronales
export const ASSURANCE_DECES_PATRONALE_RATE = 0.5; // % Total brut (Charge patronale)
export const ASSURANCE_INVALIDITE_PATRONALE_RATE = 0.78400752510838; // % Total brut (Charge patronale)
export const ASSURANCE_MALADIE_PATRONALE_RATE = 0.48212520380679; // % Total brut (0,0048212520380679 × Brut) (Charge patronale)
export const TOTAL_ASSURANCES_PATRONALES_RATE = 1.76613272891517; // % Total brut

/** Calcule un bulletin de paie complet à partir du brut (millimes). */
export function computePayslip(input: {
  baseSalary: number;
  allowances: number;
  headOfFamily?: boolean;
  children?: number;
}) {
  const gross = Math.max(0, input.baseSalary) + Math.max(0, input.allowances);
  const cnssEmployee = Math.round((gross * CNSS_EMPLOYEE_RATE) / 100);
  const cnssEmployer = Math.round((gross * CNSS_EMPLOYER_RATE) / 100);
  const css = Math.round((gross * CSS_RATE) / 100);
  // 3 assurances modulables exclusivement patronales
  const assuranceDecesPatronale = Math.round((gross * ASSURANCE_DECES_PATRONALE_RATE) / 100);
  const assuranceInvaliditePatronale = Math.round((gross * ASSURANCE_INVALIDITE_PATRONALE_RATE) / 100);
  const assuranceMaladiePatronale = Math.round((gross * ASSURANCE_MALADIE_PATRONALE_RATE) / 100);
  const totalAssurancesPatronales = assuranceDecesPatronale + assuranceInvaliditePatronale + assuranceMaladiePatronale;
  const totalEmployerCharges = cnssEmployer + totalAssurancesPatronales;

  // Base imposable = brut − CNSS salarié
  const taxableBase = Math.max(0, gross - cnssEmployee);
  const { monthly: irpp } = computeIrppMonthly(taxableBase, {
    headOfFamily: input.headOfFamily,
    children: input.children,
  });
  // Net à payer au salarié (non déduit des assurances car 100% patronales)
  const net = Math.max(0, gross - cnssEmployee - css - irpp);
  return {
    gross,
    cnssEmployee,
    cnssEmployer,
    assuranceDecesPatronale,
    assuranceInvaliditePatronale,
    assuranceMaladiePatronale,
    totalAssurancesPatronales,
    totalEmployerCharges,
    css,
    taxableBase,
    irpp,
    net,
  };
}

// ── TVA ──────────────────────────────────────────────────────────────────────
export const VAT_RATES = [19, 13, 7, 0] as const;

/** Timbre fiscal sur facture : 1,000 TND. */
export const STAMP_DUTY = 1000; // millimes

/** Calcule une ligne de facture. quantity en millièmes d'unité. */
export function computeLine(quantity: number, unitPrice: number, vatRate: number) {
  const lineHt = Math.round((quantity * unitPrice) / MILLIMES);
  const lineVat = Math.round((lineHt * vatRate) / 100);
  return { lineHt, lineVat };
}

// ── IS : impôt sur les sociétés ──────────────────────────────────────────────
export const IS_RATES = [15, 20] as const;

/** Acomptes provisionnels : 3 acomptes de 30 % de l'IS de référence. */
export const IS_INSTALLMENT_RATE = 30;

// ── TCL : taxe sur les locaux ────────────────────────────────────────────────
/** Taux TCL en points de base : 10 = 0,1 % (général), 20 = 0,2 % (hôtellerie). */
export const TCL_RATES_BP = [10, 20] as const;

// ── Retenue à la source ──────────────────────────────────────────────────────
export const WITHHOLDING_RATES = [1, 3] as const;

// ── Utilitaires de dates / périodes ──────────────────────────────────────────
export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${y}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Statuts de facture avec libellé + couleur. */
export const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  brouillon: { label: "Brouillon", tone: "muted" },
  validee: { label: "Validée", tone: "info" },
  payee: { label: "Payée", tone: "success" },
  annulee: { label: "Annulée", tone: "danger" },
};

export const JOURNAL_LABELS: Record<string, string> = {
  VE: "Ventes",
  AC: "Achats",
  BQ: "Banque",
  CA: "Caisse",
  OD: "Opérations diverses",
  PA: "Paie",
};
