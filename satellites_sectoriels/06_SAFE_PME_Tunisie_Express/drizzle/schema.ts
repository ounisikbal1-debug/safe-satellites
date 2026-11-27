import { pgTable, uuid, text, timestamp, index, bigint, integer, boolean, date, jsonb } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM TABLES — managed by the scaffold. Do not redefine or drop.
// ─────────────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_owner_idx").on(t.ownerId), index("files_created_idx").on(t.createdAt)],
);

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS TABLES — ERP Tunisien
// All monetary amounts are stored as INTEGER MILLIMES (1 TND = 1000 millimes)
// so that 3-decimal TND arithmetic is exact. Never store money as float.
// Every business row belongs to one user (owner_id) — the company file is
// per-user, so two accounts never see each other's books.
// ─────────────────────────────────────────────────────────────────────────────

/** Société — une ligne par utilisateur. */
export const company = pgTable(
  "company",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Société Tunisienne SARL"),
    matriculeFiscal: text("matricule_fiscal").notNull().default("0000000/A/M/000"),
    registreCommerce: text("registre_commerce").notNull().default("B0000000000"),
    address: text("address").notNull().default("Avenue Habib Bourguiba, Tunis"),
    phone: text("phone").notNull().default("+216 71 000 000"),
    email: text("email").notNull().default("contact@societe.tn"),
    /** 'assujetti' | 'non_assujetti' | 'exportateur' */
    vatRegime: text("vat_regime").notNull().default("assujetti"),
    /** 'reel' | 'forfaitaire' */
    taxRegime: text("tax_regime").notNull().default("reel"),
    /** Taux IS : 15 (services/industries) ou 20 (autres) */
    isRate: integer("is_rate").notNull().default(15),
    fiscalYear: integer("fiscal_year").notNull().default(2026),
    /** Taux TCL appliqué en points de base (10 = 0,1 %) */
    tclRateBp: integer("tcl_rate_bp").notNull().default(10),
    /** Numéro d'affiliation CNSS de l'employeur */
    cnssNumber: text("cnss_number").notNull().default(""),
    // Parametres & Taux avances issus de SAFE ERP
    vatRateStandard: integer("vat_rate_standard").notNull().default(19),
    vatRateIntermediate: integer("vat_rate_intermediate").notNull().default(13),
    vatRateReduced: integer("vat_rate_reduced").notNull().default(7),
    stampDutyMillimes: integer("stamp_duty_millimes").notNull().default(1000),
    cnssEmployeeRateBp: integer("cnss_employee_rate_bp").notNull().default(968), // 9.68%
    cnssEmployerRateBp: integer("cnss_employer_rate_bp").notNull().default(1707), // 17.07%
    cssRateBp: integer("css_rate_bp").notNull().default(50), // 0.5%
    headOfFamilyDeduction: integer("head_of_family_deduction").notNull().default(300),
    dependentDeduction: integer("dependent_deduction").notNull().default(100),
    foprolosRateBp: integer("foprolos_rate_bp").notNull().default(100), // 1.0% SAFE ERP
    tfpRateBp: integer("tfp_rate_bp").notNull().default(100), // 1.0% SAFE ERP
    currencyCode: text("currency_code").notNull().default("TND"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("company_owner_idx").on(t.ownerId)],
);

/** Tiers : clients et fournisseurs. */
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'client' | 'fournisseur' */
    type: text("type").notNull().default("client"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    matriculeFiscal: text("matricule_fiscal"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    /** Délai de paiement en jours */
    paymentTerms: integer("payment_terms").notNull().default(30),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("partners_owner_idx").on(t.ownerId),
    index("partners_type_idx").on(t.type),
    index("partners_name_idx").on(t.name),
  ],
);

/** Articles & services. */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    name: text("name").notNull(),
    /** 'produit' | 'service' */
    kind: text("kind").notNull().default("produit"),
    unit: text("unit").notNull().default("U"),
    priceHt: integer("price_ht").notNull().default(0), // millimes
    /** Prix d'achat / coût de revient (millimes) */
    costPrice: integer("cost_price").notNull().default(0),
    /** 19 | 13 | 7 | 0 */
    vatRate: integer("vat_rate").notNull().default(19),
    /** Compte de vente / achat (plan comptable tunisien) */
    accountCode: text("account_code").notNull().default("701"),
    /** Quantité en stock (millièmes d'unité) */
    stockQty: integer("stock_qty").notNull().default(0),
    /** Seuil d'alerte de réapprovisionnement (millièmes d'unité) */
    reorderLevel: integer("reorder_level").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_owner_idx").on(t.ownerId), index("products_ref_idx").on(t.reference)],
);

/** Mouvements de stock — chaque entrée/sortie explique la quantité courante. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    moveDate: date("move_date").notNull(),
    /** 'entree' | 'sortie' | 'inventaire' */
    kind: text("kind").notNull().default("entree"),
    /** Quantité en millièmes d'unité (toujours positive) */
    quantity: integer("quantity").notNull().default(0),
    /** Coût unitaire du mouvement (millimes) */
    unitCost: integer("unit_cost").notNull().default(0),
    reference: text("reference"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_moves_owner_idx").on(t.ownerId),
    index("stock_moves_product_idx").on(t.productId),
    index("stock_moves_date_idx").on(t.moveDate),
  ],
);

/** Factures de vente. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    partnerName: text("partner_name").notNull().default(""),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** 'brouillon' | 'validee' | 'payee' | 'annulee' */
    status: text("status").notNull().default("brouillon"),
    totalHt: integer("total_ht").notNull().default(0),
    totalVat: integer("total_vat").notNull().default(0),
    /** Timbre fiscal (1000 millimes = 1,000 TND) */
    stampDuty: integer("stamp_duty").notNull().default(0),
    totalTtc: integer("total_ttc").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_owner_idx").on(t.ownerId),
    index("invoices_date_idx").on(t.issueDate),
    index("invoices_status_idx").on(t.status),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1000), // millièmes d'unité
    unitPrice: integer("unit_price").notNull().default(0), // millimes
    vatRate: integer("vat_rate").notNull().default(19),
    lineHt: integer("line_ht").notNull().default(0),
    lineVat: integer("line_vat").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("invoice_lines_owner_idx").on(t.ownerId), index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

/** Factures d'achat (fournisseurs). */
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    partnerName: text("partner_name").notNull().default(""),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** 'brouillon' | 'validee' | 'payee' */
    status: text("status").notNull().default("brouillon"),
    totalHt: integer("total_ht").notNull().default(0),
    totalVat: integer("total_vat").notNull().default(0),
    totalTtc: integer("total_ttc").notNull().default(0),
    /** Retenue à la source (1 % ou 3 %) en millimes */
    withholding: integer("withholding").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bills_owner_idx").on(t.ownerId), index("bills_date_idx").on(t.issueDate)],
);

export const billLines = pgTable(
  "bill_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1000),
    unitPrice: integer("unit_price").notNull().default(0),
    vatRate: integer("vat_rate").notNull().default(19),
    lineHt: integer("line_ht").notNull().default(0),
    lineVat: integer("line_vat").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("bill_lines_owner_idx").on(t.ownerId), index("bill_lines_bill_idx").on(t.billId)],
);

/** Salariés. */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matricule: text("matricule").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    position: text("position").notNull().default(""),
    department: text("department").notNull().default("Administration"),
    hireDate: date("hire_date").notNull(),
    /** Salaire de base mensuel en millimes */
    baseSalary: integer("base_salary").notNull().default(0),
    /** Primes mensuelles (transport, rendement…) en millimes */
    allowances: integer("allowances").notNull().default(0),
    /** 'celibataire' | 'marie' */
    maritalStatus: text("marital_status").notNull().default("celibataire"),
    children: integer("children").notNull().default(0),
    /** Chef de famille → abattement IRPP */
    headOfFamily: boolean("head_of_family").notNull().default(false),
    /** 'actif' | 'sorti' */
    status: text("status").notNull().default("actif"),
    cnssNumber: text("cnss_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("employees_owner_idx").on(t.ownerId), index("employees_mat_idx").on(t.matricule)],
);

/** Cycles de paie. */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'YYYY-MM' */
    period: text("period").notNull(),
    label: text("label").notNull().default(""),
    status: text("status").notNull().default("brouillon"),
    totalGross: integer("total_gross").notNull().default(0),
    totalCnssEmployee: integer("total_cnss_employee").notNull().default(0),
    totalCnssEmployer: integer("total_cnss_employer").notNull().default(0),
    totalCss: integer("total_css").notNull().default(0),
    totalIrpp: integer("total_irpp").notNull().default(0),
    totalNet: integer("total_net").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payroll_runs_owner_idx").on(t.ownerId)],
);

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    employeeName: text("employee_name").notNull().default(""),
    matricule: text("matricule").notNull().default(""),
    baseSalary: integer("base_salary").notNull().default(0),
    allowances: integer("allowances").notNull().default(0),
    gross: integer("gross").notNull().default(0),
    cnssEmployee: integer("cnss_employee").notNull().default(0),
    cnssEmployer: integer("cnss_employer").notNull().default(0),
    css: integer("css").notNull().default(0),
    taxableBase: integer("taxable_base").notNull().default(0),
    irpp: integer("irpp").notNull().default(0),
    net: integer("net").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payslips_owner_idx").on(t.ownerId), index("payslips_run_idx").on(t.runId)],
);

/** Plan comptable tunisien. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    /** Classe 1..7 */
    classNo: integer("class_no").notNull().default(1),
    /** 'actif' | 'passif' | 'charge' | 'produit' */
    nature: text("nature").notNull().default("actif"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_owner_idx").on(t.ownerId), index("accounts_code_idx").on(t.code)],
);

/** Écritures comptables (en-tête). */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    /** 'VE' ventes | 'AC' achats | 'BQ' banque | 'CA' caisse | 'OD' opérations diverses | 'PA' paie */
    journal: text("journal").notNull().default("OD"),
    reference: text("reference").notNull().default(""),
    label: text("label").notNull(),
    /** Origine automatique : 'facture' | 'achat' | 'paie' | 'manuel' */
    source: text("source").notNull().default("manuel"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("journal_entries_owner_idx").on(t.ownerId), index("journal_entries_date_idx").on(t.entryDate)],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountCode: text("account_code").notNull(),
    accountLabel: text("account_label").notNull().default(""),
    debit: integer("debit").notNull().default(0),
    credit: integer("credit").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("journal_lines_owner_idx").on(t.ownerId), index("journal_lines_entry_idx").on(t.entryId)],
);

/** Immobilisations. */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull().default("Matériel"),
    acquisitionDate: date("acquisition_date").notNull(),
    /** Valeur d'acquisition en millimes */
    cost: integer("cost").notNull().default(0),
    /** Durée d'amortissement en années */
    durationYears: integer("duration_years").notNull().default(5),
    /** Taux linéaire en points de base (2000 = 20 %) */
    rateBp: integer("rate_bp").notNull().default(2000),
    /** Amortissement cumulé en millimes */
    accumulated: integer("accumulated").notNull().default(0),
    accountCode: text("account_code").notNull().default("2231"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assets_owner_idx").on(t.ownerId)],
);

/** Comptes de trésorerie. */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** 'banque' | 'caisse' */
    kind: text("kind").notNull().default("banque"),
    bankName: text("bank_name"),
    rib: text("rib"),
    /** Solde initial en millimes */
    openingBalance: integer("opening_balance").notNull().default(0),
    accountCode: text("account_code").notNull().default("532"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bank_accounts_owner_idx").on(t.ownerId)],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    txDate: date("tx_date").notNull(),
    label: text("label").notNull(),
    /** 'encaissement' | 'decaissement' */
    direction: text("direction").notNull().default("encaissement"),
    amount: integer("amount").notNull().default(0),
    category: text("category").notNull().default("Divers"),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bank_tx_owner_idx").on(t.ownerId),
    index("bank_tx_account_idx").on(t.accountId),
    index("bank_tx_date_idx").on(t.txDate),
  ],
);

/** Déclarations fiscales et sociales générées. */
export const taxDeclarations = pgTable(
  "tax_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'TVA' | 'TCL' | 'IS' | 'ACOMPTE' | 'IRPP' | 'RS' | 'CNSS' | 'BILAN' */
    kind: text("kind").notNull(),
    period: text("period").notNull(),
    dueDate: date("due_date").notNull(),
    baseAmount: integer("base_amount").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    status: text("status").notNull().default("a_declarer"),
    notes: text("notes"),
    /** Détail chiffré de la liquidation (TVA collectée, déductible, crédit…). */
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tax_decl_owner_idx").on(t.ownerId)],
);

/** Journal des transmissions vers la TTN et e-Fatoura. */
export const transmissions = pgTable(
  "transmissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'ttn' | 'efatoura' */
    platform: text("platform").notNull(),
    /** 'declaration' | 'facture' */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    subjectLabel: text("subject_label").notNull().default(""),
    /** 'envoye' | 'non_configure' | 'refuse' | 'erreur_reseau' */
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    reference: text("reference"),
    message: text("message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transmissions_owner_idx").on(t.ownerId), index("transmissions_created_idx").on(t.createdAt)],
);
