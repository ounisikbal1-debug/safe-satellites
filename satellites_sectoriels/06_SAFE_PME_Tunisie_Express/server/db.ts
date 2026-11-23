// ── AGENT-OWNED: business data-access ─────────────────────────────────────────
// Architecture MVC : ce fichier est la couche d'accès aux données (Model).
// Chaque requête est scopée par `ownerId` — deux comptes ne voient jamais les
// livres de l'autre. Les montants sont en millimes (entiers).
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./_core/db";
import {
  accounts,
  assets,
  bankAccounts,
  bankTransactions,
  billLines,
  bills,
  company,
  employees,
  invoiceLines,
  invoices,
  journalEntries,
  journalLines,
  partners,
  payrollRuns,
  payslips,
  products,
  stockMovements,
  taxDeclarations,
  transmissions,
} from "../drizzle/schema";

// ── Société ──────────────────────────────────────────────────────────────────
export async function getCompany(ownerId: string) {
  const rows = await db.select().from(company).where(eq(company.ownerId, ownerId)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(company).values({ id: ownerId, ownerId }).returning();
  return created;
}

export async function updateCompany(ownerId: string, patch: Record<string, unknown>) {
  await getCompany(ownerId);
  const [row] = await db
    .update(company)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(company.ownerId, ownerId))
    .returning();
  return row;
}

// ── Tiers ────────────────────────────────────────────────────────────────────
export async function listPartners(ownerId: string, type?: string) {
  const base = db.select().from(partners).where(eq(partners.ownerId, ownerId)).orderBy(asc(partners.name));
  if (type) return db.select().from(partners).where(and(eq(partners.ownerId, ownerId), eq(partners.type, type))).orderBy(asc(partners.name));
  return base;
}

export async function createPartner(
  ownerId: string,
  input: {
    type: string;
    code: string;
    name: string;
    matriculeFiscal?: string;
    address?: string;
    email?: string;
    phone?: string;
    paymentTerms?: number;
    notes?: string;
  },
) {
  const [row] = await db
    .insert(partners)
    .values({
      ownerId,
      type: input.type,
      code: input.code,
      name: input.name,
      matriculeFiscal: input.matriculeFiscal ?? null,
      address: input.address ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      paymentTerms: input.paymentTerms ?? 30,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export async function updatePartner(ownerId: string, id: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(partners)
    .set(patch)
    .where(and(eq(partners.ownerId, ownerId), eq(partners.id, id)))
    .returning();
  return row ?? null;
}

export async function deletePartner(ownerId: string, id: string) {
  await db.delete(partners).where(and(eq(partners.ownerId, ownerId), eq(partners.id, id)));
  return { ok: true };
}

// ── Articles ─────────────────────────────────────────────────────────────────
export async function listProducts(ownerId: string) {
  return db.select().from(products).where(eq(products.ownerId, ownerId)).orderBy(asc(products.reference));
}

export async function createProduct(
  ownerId: string,
  input: {
    reference: string;
    name: string;
    kind?: string;
    unit?: string;
    priceHt: number;
    costPrice?: number;
    vatRate: number;
    accountCode?: string;
    stockQty?: number;
    reorderLevel?: number;
  },
) {
  const [row] = await db
    .insert(products)
    .values({
      ownerId,
      reference: input.reference,
      name: input.name,
      kind: input.kind ?? "produit",
      unit: input.unit ?? "U",
      priceHt: input.priceHt,
      costPrice: input.costPrice ?? 0,
      vatRate: input.vatRate,
      accountCode: input.accountCode ?? "701",
      stockQty: input.stockQty ?? 0,
      reorderLevel: input.reorderLevel ?? 0,
    })
    .returning();
  return row;
}

export async function updateProduct(ownerId: string, id: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(products)
    .set(patch)
    .where(and(eq(products.ownerId, ownerId), eq(products.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteProduct(ownerId: string, id: string) {
  await db.delete(products).where(and(eq(products.ownerId, ownerId), eq(products.id, id)));
  return { ok: true };
}

// ── Stock ────────────────────────────────────────────────────────────────────
export async function listStockMovements(ownerId: string, productId?: string, limit = 300) {
  const where = productId
    ? and(eq(stockMovements.ownerId, ownerId), eq(stockMovements.productId, productId))
    : eq(stockMovements.ownerId, ownerId);
  return db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      moveDate: stockMovements.moveDate,
      kind: stockMovements.kind,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      reference: stockMovements.reference,
      note: stockMovements.note,
      productName: products.name,
      productRef: products.reference,
      unit: products.unit,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(where)
    .orderBy(desc(stockMovements.moveDate), desc(stockMovements.createdAt))
    .limit(limit);
}

/** Enregistre un mouvement et met à jour la quantité de l'article. */
export async function createStockMovement(
  ownerId: string,
  input: {
    productId: string;
    moveDate: string;
    kind: "entree" | "sortie" | "inventaire";
    quantity: number;
    unitCost?: number;
    reference?: string;
    note?: string;
  },
) {
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.ownerId, ownerId), eq(products.id, input.productId)))
    .limit(1);
  if (!prod) throw new Error("Article introuvable.");

  const [row] = await db
    .insert(stockMovements)
    .values({
      ownerId,
      productId: input.productId,
      moveDate: input.moveDate,
      kind: input.kind,
      quantity: input.quantity,
      unitCost: input.unitCost ?? prod.costPrice,
      reference: input.reference ?? null,
      note: input.note ?? null,
    })
    .returning();

  const delta =
    input.kind === "entree" ? input.quantity : input.kind === "sortie" ? -input.quantity : input.quantity - prod.stockQty;
  await db
    .update(products)
    .set({ stockQty: Math.max(0, prod.stockQty + delta) })
    .where(and(eq(products.ownerId, ownerId), eq(products.id, input.productId)));

  return row;
}

/** Articles sous le seuil d'alerte (ou en rupture). */
export async function getStockAlerts(ownerId: string) {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.ownerId, ownerId), eq(products.kind, "produit")))
    .orderBy(asc(products.name));
  return rows
    .filter((p) => p.reorderLevel > 0 && p.stockQty <= p.reorderLevel)
    .map((p) => ({
      id: p.id,
      reference: p.reference,
      name: p.name,
      unit: p.unit,
      stockQty: p.stockQty,
      reorderLevel: p.reorderLevel,
      /** Quantité à commander pour revenir au double du seuil. */
      toOrder: Math.max(0, p.reorderLevel * 2 - p.stockQty),
      costPrice: p.costPrice,
      /** Valeur du réapprovisionnement proposé (millimes). */
      orderValue: Math.max(0, p.reorderLevel * 2 - p.stockQty) * p.costPrice / 1000,
      severity: p.stockQty === 0 ? "rupture" : "alerte",
    }));
}

// ── Factures de vente ────────────────────────────────────────────────────────
export async function listInvoices(ownerId: string) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.ownerId, ownerId))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));
}

export async function getInvoice(ownerId: string, id: string) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), eq(invoices.id, id)))
    .limit(1);
  if (!inv) return null;
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, id))
    .orderBy(asc(invoiceLines.position));
  return { ...inv, lines };
}

export async function nextInvoiceNumber(ownerId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), sql`${invoices.number} like ${`FA-${year}-%`}`));
  const count = rows[0]?.n ?? 0;
  return `FA-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createInvoice(
  ownerId: string,
  input: {
    number?: string;
    partnerId?: string | null;
    partnerName: string;
    issueDate: string;
    dueDate: string;
    status?: string;
    stampDuty?: number;
    notes?: string;
    lines: { productId?: string | null; label: string; quantity: number; unitPrice: number; vatRate: number }[];
  },
) {
  const number = input.number || (await nextInvoiceNumber(ownerId));
  let totalHt = 0;
  let totalVat = 0;
  const computed = input.lines.map((l, i) => {
    const lineHt = Math.round((l.quantity * l.unitPrice) / 1000);
    const lineVat = Math.round((lineHt * l.vatRate) / 100);
    totalHt += lineHt;
    totalVat += lineVat;
    return { ...l, lineHt, lineVat, position: i };
  });
  const stampDuty = input.stampDuty ?? 0;
  const totalTtc = totalHt + totalVat + stampDuty;

  const [inv] = await db
    .insert(invoices)
    .values({
      ownerId,
      number,
      partnerId: input.partnerId ?? null,
      partnerName: input.partnerName,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      status: input.status ?? "brouillon",
      totalHt,
      totalVat,
      stampDuty,
      totalTtc,
      notes: input.notes ?? null,
    })
    .returning();

  if (computed.length) {
    await db.insert(invoiceLines).values(
      computed.map((l) => ({
        ownerId,
        invoiceId: inv.id,
        productId: l.productId ?? null,
        label: l.label,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        lineHt: l.lineHt,
        lineVat: l.lineVat,
        position: l.position,
      })),
    );
  }
  return inv;
}

export async function updateInvoiceStatus(ownerId: string, id: string, status: string) {
  const [row] = await db
    .update(invoices)
    .set({ status })
    .where(and(eq(invoices.ownerId, ownerId), eq(invoices.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteInvoice(ownerId: string, id: string) {
  await db.delete(invoices).where(and(eq(invoices.ownerId, ownerId), eq(invoices.id, id)));
  return { ok: true };
}

// ── Achats ───────────────────────────────────────────────────────────────────
export async function listBills(ownerId: string) {
  return db
    .select()
    .from(bills)
    .where(eq(bills.ownerId, ownerId))
    .orderBy(desc(bills.issueDate), desc(bills.createdAt));
}

export async function getBill(ownerId: string, id: string) {
  const [b] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.ownerId, ownerId), eq(bills.id, id)))
    .limit(1);
  if (!b) return null;
  const lines = await db
    .select()
    .from(billLines)
    .where(eq(billLines.billId, id))
    .orderBy(asc(billLines.position));
  return { ...b, lines };
}

export async function createBill(
  ownerId: string,
  input: {
    number: string;
    partnerId?: string | null;
    partnerName: string;
    issueDate: string;
    dueDate: string;
    status?: string;
    withholding?: number;
    notes?: string;
    lines: { label: string; quantity: number; unitPrice: number; vatRate: number }[];
  },
) {
  let totalHt = 0;
  let totalVat = 0;
  const computed = input.lines.map((l, i) => {
    const lineHt = Math.round((l.quantity * l.unitPrice) / 1000);
    const lineVat = Math.round((lineHt * l.vatRate) / 100);
    totalHt += lineHt;
    totalVat += lineVat;
    return { ...l, lineHt, lineVat, position: i };
  });
  const [b] = await db
    .insert(bills)
    .values({
      ownerId,
      number: input.number,
      partnerId: input.partnerId ?? null,
      partnerName: input.partnerName,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      status: input.status ?? "brouillon",
      totalHt,
      totalVat,
      totalTtc: totalHt + totalVat,
      withholding: input.withholding ?? 0,
      notes: input.notes ?? null,
    })
    .returning();
  if (computed.length) {
    await db.insert(billLines).values(
      computed.map((l) => ({
        ownerId,
        billId: b.id,
        label: l.label,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        lineHt: l.lineHt,
        lineVat: l.lineVat,
        position: l.position,
      })),
    );
  }
  return b;
}

export async function updateBillStatus(ownerId: string, id: string, status: string) {
  const [row] = await db
    .update(bills)
    .set({ status })
    .where(and(eq(bills.ownerId, ownerId), eq(bills.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteBill(ownerId: string, id: string) {
  await db.delete(bills).where(and(eq(bills.ownerId, ownerId), eq(bills.id, id)));
  return { ok: true };
}

// ── Salariés ─────────────────────────────────────────────────────────────────
export async function listEmployees(ownerId: string) {
  return db.select().from(employees).where(eq(employees.ownerId, ownerId)).orderBy(asc(employees.lastName));
}

export async function createEmployee(
  ownerId: string,
  input: {
    matricule: string;
    firstName: string;
    lastName: string;
    position?: string;
    department?: string;
    hireDate: string;
    baseSalary: number;
    allowances?: number;
    maritalStatus?: string;
    children?: number;
    headOfFamily?: boolean;
    cnssNumber?: string;
  },
) {
  const [row] = await db
    .insert(employees)
    .values({
      ownerId,
      matricule: input.matricule,
      firstName: input.firstName,
      lastName: input.lastName,
      position: input.position ?? "",
      department: input.department ?? "Administration",
      hireDate: input.hireDate,
      baseSalary: input.baseSalary,
      allowances: input.allowances ?? 0,
      maritalStatus: input.maritalStatus ?? "celibataire",
      children: input.children ?? 0,
      headOfFamily: input.headOfFamily ?? false,
      cnssNumber: input.cnssNumber ?? null,
    })
    .returning();
  return row;
}

export async function updateEmployee(ownerId: string, id: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(employees)
    .set(patch)
    .where(and(eq(employees.ownerId, ownerId), eq(employees.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteEmployee(ownerId: string, id: string) {
  await db.delete(employees).where(and(eq(employees.ownerId, ownerId), eq(employees.id, id)));
  return { ok: true };
}

// ── Paie ─────────────────────────────────────────────────────────────────────
export async function listPayrollRuns(ownerId: string) {
  return db.select().from(payrollRuns).where(eq(payrollRuns.ownerId, ownerId)).orderBy(desc(payrollRuns.period));
}

export async function getPayrollRun(ownerId: string, id: string) {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.ownerId, ownerId), eq(payrollRuns.id, id)))
    .limit(1);
  if (!run) return null;
  const slips = await db
    .select()
    .from(payslips)
    .where(eq(payslips.runId, id))
    .orderBy(asc(payslips.employeeName));
  return { ...run, payslips: slips };
}

export async function createPayrollRun(
  ownerId: string,
  input: {
    period: string;
    label?: string;
    payslips: {
      employeeId?: string | null;
      employeeName: string;
      matricule: string;
      baseSalary: number;
      allowances: number;
      gross: number;
      cnssEmployee: number;
      cnssEmployer: number;
      css: number;
      taxableBase: number;
      irpp: number;
      net: number;
    }[];
  },
) {
  const totals = input.payslips.reduce(
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
  const [run] = await db
    .insert(payrollRuns)
    .values({
      ownerId,
      period: input.period,
      label: input.label ?? `Paie ${input.period}`,
      status: "validee",
      totalGross: totals.gross,
      totalCnssEmployee: totals.cnssE,
      totalCnssEmployer: totals.cnssR,
      totalCss: totals.css,
      totalIrpp: totals.irpp,
      totalNet: totals.net,
    })
    .returning();
  if (input.payslips.length) {
    await db.insert(payslips).values(
      input.payslips.map((p) => ({
        ownerId,
        runId: run.id,
        employeeId: p.employeeId ?? null,
        employeeName: p.employeeName,
        matricule: p.matricule,
        baseSalary: p.baseSalary,
        allowances: p.allowances,
        gross: p.gross,
        cnssEmployee: p.cnssEmployee,
        cnssEmployer: p.cnssEmployer,
        css: p.css,
        taxableBase: p.taxableBase,
        irpp: p.irpp,
        net: p.net,
      })),
    );
  }
  return run;
}

export async function deletePayrollRun(ownerId: string, id: string) {
  await db.delete(payrollRuns).where(and(eq(payrollRuns.ownerId, ownerId), eq(payrollRuns.id, id)));
  return { ok: true };
}

// ── Comptabilité ─────────────────────────────────────────────────────────────
export async function listAccounts(ownerId: string) {
  return db.select().from(accounts).where(eq(accounts.ownerId, ownerId)).orderBy(asc(accounts.code));
}

export async function createAccount(ownerId: string, input: { code: string; label: string; classNo: number; nature: string }) {
  const [row] = await db.insert(accounts).values({ ownerId, ...input }).returning();
  return row;
}

export async function listJournalEntries(ownerId: string, limit = 300) {
  return db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.ownerId, ownerId))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(limit);
}

export async function getJournalEntry(ownerId: string, id: string) {
  const [e] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.ownerId, ownerId), eq(journalEntries.id, id)))
    .limit(1);
  if (!e) return null;
  const lines = await db
    .select()
    .from(journalLines)
    .where(eq(journalLines.entryId, id))
    .orderBy(asc(journalLines.position));
  return { ...e, lines };
}

export async function createJournalEntry(
  ownerId: string,
  input: {
    entryDate: string;
    journal: string;
    reference?: string;
    label: string;
    source?: string;
    sourceId?: string | null;
    lines: { accountCode: string; accountLabel?: string; debit: number; credit: number }[];
  },
) {
  const [entry] = await db
    .insert(journalEntries)
    .values({
      ownerId,
      entryDate: input.entryDate,
      journal: input.journal,
      reference: input.reference ?? "",
      label: input.label,
      source: input.source ?? "manuel",
      sourceId: input.sourceId ?? null,
    })
    .returning();
  if (input.lines.length) {
    await db.insert(journalLines).values(
      input.lines.map((l, i) => ({
        ownerId,
        entryId: entry.id,
        accountCode: l.accountCode,
        accountLabel: l.accountLabel ?? "",
        debit: l.debit,
        credit: l.credit,
        position: i,
      })),
    );
  }
  return entry;
}

export async function deleteJournalEntry(ownerId: string, id: string) {
  await db.delete(journalEntries).where(and(eq(journalEntries.ownerId, ownerId), eq(journalEntries.id, id)));
  return { ok: true };
}

/** Balance générale : totaux débit/crédit par compte. */
export async function getTrialBalance(ownerId: string) {
  return db
    .select({
      accountCode: journalLines.accountCode,
      accountLabel: sql<string>`max(${journalLines.accountLabel})`,
      debit: sql<number>`coalesce(sum(${journalLines.debit}),0)::int`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}),0)::int`,
    })
    .from(journalLines)
    .where(eq(journalLines.ownerId, ownerId))
    .groupBy(journalLines.accountCode)
    .orderBy(asc(journalLines.accountCode));
}

/** Soldes par compte sur une plage de dates (pour Bilan / Résultat). */
export async function getAccountBalances(ownerId: string, from?: string, to?: string) {
  const conds = [eq(journalLines.ownerId, ownerId)];
  if (from) conds.push(gte(journalEntries.entryDate, from));
  if (to) conds.push(lte(journalEntries.entryDate, to));
  return db
    .select({
      accountCode: journalLines.accountCode,
      accountLabel: sql<string>`max(${journalLines.accountLabel})`,
      debit: sql<number>`coalesce(sum(${journalLines.debit}),0)::int`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}),0)::int`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(...conds))
    .groupBy(journalLines.accountCode)
    .orderBy(asc(journalLines.accountCode));
}

// ── Immobilisations ──────────────────────────────────────────────────────────
export async function listAssets(ownerId: string) {
  return db.select().from(assets).where(eq(assets.ownerId, ownerId)).orderBy(asc(assets.code));
}

export async function createAsset(
  ownerId: string,
  input: {
    code: string;
    label: string;
    category?: string;
    acquisitionDate: string;
    cost: number;
    durationYears: number;
    rateBp: number;
    accumulated?: number;
    accountCode?: string;
  },
) {
  const [row] = await db
    .insert(assets)
    .values({
      ownerId,
      code: input.code,
      label: input.label,
      category: input.category ?? "Matériel",
      acquisitionDate: input.acquisitionDate,
      cost: input.cost,
      durationYears: input.durationYears,
      rateBp: input.rateBp,
      accumulated: input.accumulated ?? 0,
      accountCode: input.accountCode ?? "2231",
    })
    .returning();
  return row;
}

export async function deleteAsset(ownerId: string, id: string) {
  await db.delete(assets).where(and(eq(assets.ownerId, ownerId), eq(assets.id, id)));
  return { ok: true };
}

// ── Trésorerie ───────────────────────────────────────────────────────────────
export async function listBankAccounts(ownerId: string) {
  return db.select().from(bankAccounts).where(eq(bankAccounts.ownerId, ownerId)).orderBy(asc(bankAccounts.label));
}

export async function listBankTransactions(ownerId: string, accountId?: string) {
  const where = accountId
    ? and(eq(bankTransactions.ownerId, ownerId), eq(bankTransactions.accountId, accountId))
    : eq(bankTransactions.ownerId, ownerId);
  return db.select().from(bankTransactions).where(where).orderBy(desc(bankTransactions.txDate));
}

export async function createBankAccount(
  ownerId: string,
  input: { label: string; kind?: string; bankName?: string; rib?: string; openingBalance?: number; accountCode?: string },
) {
  const [row] = await db
    .insert(bankAccounts)
    .values({
      ownerId,
      label: input.label,
      kind: input.kind ?? "banque",
      bankName: input.bankName ?? null,
      rib: input.rib ?? null,
      openingBalance: input.openingBalance ?? 0,
      accountCode: input.accountCode ?? "532",
    })
    .returning();
  return row;
}

export async function createBankTransaction(
  ownerId: string,
  input: {
    accountId: string;
    txDate: string;
    label: string;
    direction: string;
    amount: number;
    category?: string;
    reference?: string;
  },
) {
  const [row] = await db
    .insert(bankTransactions)
    .values({
      ownerId,
      accountId: input.accountId,
      txDate: input.txDate,
      label: input.label,
      direction: input.direction,
      amount: input.amount,
      category: input.category ?? "Divers",
      reference: input.reference ?? null,
    })
    .returning();
  return row;
}

export async function deleteBankTransaction(ownerId: string, id: string) {
  await db.delete(bankTransactions).where(and(eq(bankTransactions.ownerId, ownerId), eq(bankTransactions.id, id)));
  return { ok: true };
}

// ── Fiscalité ────────────────────────────────────────────────────────────────
export async function listTaxDeclarations(ownerId: string) {
  return db
    .select()
    .from(taxDeclarations)
    .where(eq(taxDeclarations.ownerId, ownerId))
    .orderBy(desc(taxDeclarations.dueDate));
}

export async function createTaxDeclaration(
  ownerId: string,
  input: {
    kind: string;
    period: string;
    dueDate: string;
    baseAmount: number;
    taxAmount: number;
    status?: string;
    notes?: string;
    detail?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(taxDeclarations)
    .values({
      ownerId,
      kind: input.kind,
      period: input.period,
      dueDate: input.dueDate,
      baseAmount: input.baseAmount,
      taxAmount: input.taxAmount,
      status: input.status ?? "a_declarer",
      notes: input.notes ?? null,
      detail: input.detail ?? null,
    })
    .returning();
  return row;
}

export async function updateTaxDeclaration(ownerId: string, id: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(taxDeclarations)
    .set(patch)
    .where(and(eq(taxDeclarations.ownerId, ownerId), eq(taxDeclarations.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteTaxDeclaration(ownerId: string, id: string) {
  await db.delete(taxDeclarations).where(and(eq(taxDeclarations.ownerId, ownerId), eq(taxDeclarations.id, id)));
  return { ok: true };
}

// ── Transmissions TTN / e-Fatoura ────────────────────────────────────────────
export async function listTransmissions(ownerId: string, limit = 100) {
  return db
    .select()
    .from(transmissions)
    .where(eq(transmissions.ownerId, ownerId))
    .orderBy(desc(transmissions.createdAt))
    .limit(limit);
}

export async function logTransmission(
  ownerId: string,
  input: {
    platform: string;
    subjectType: string;
    subjectId: string;
    subjectLabel: string;
    status: string;
    httpStatus?: number | null;
    reference?: string | null;
    message: string;
  },
) {
  const [row] = await db
    .insert(transmissions)
    .values({
      ownerId,
      platform: input.platform,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: input.subjectLabel,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      reference: input.reference ?? null,
      message: input.message,
    })
    .returning();
  return row;
}

// ── Tableau de bord ──────────────────────────────────────────────────────────
export async function getDashboard(ownerId: string) {
  const [invAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      ht: sql<number>`coalesce(sum(${invoices.totalHt}),0)::int`,
      vat: sql<number>`coalesce(sum(${invoices.totalVat}),0)::int`,
      ttc: sql<number>`coalesce(sum(${invoices.totalTtc}),0)::int`,
    })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), sql`${invoices.status} <> 'annulee'`));

  const [billAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      ht: sql<number>`coalesce(sum(${bills.totalHt}),0)::int`,
      vat: sql<number>`coalesce(sum(${bills.totalVat}),0)::int`,
    })
    .from(bills)
    .where(eq(bills.ownerId, ownerId));

  const [empAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.ownerId, ownerId), eq(employees.status, "actif")));

  const [payAgg] = await db
    .select({
      gross: sql<number>`coalesce(sum(${payrollRuns.totalGross}),0)::int`,
      net: sql<number>`coalesce(sum(${payrollRuns.totalNet}),0)::int`,
      irpp: sql<number>`coalesce(sum(${payrollRuns.totalIrpp}),0)::int`,
      cnss: sql<number>`coalesce(sum(${payrollRuns.totalCnssEmployee}),0)::int`,
      cnssEmployer: sql<number>`coalesce(sum(${payrollRuns.totalCnssEmployer}),0)::int`,
      css: sql<number>`coalesce(sum(${payrollRuns.totalCss}),0)::int`,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.ownerId, ownerId));

  const [assetAgg] = await db
    .select({
      cost: sql<number>`coalesce(sum(${assets.cost}),0)::int`,
      acc: sql<number>`coalesce(sum(${assets.accumulated}),0)::int`,
    })
    .from(assets)
    .where(eq(assets.ownerId, ownerId));

  const [cashAgg] = await db
    .select({ opening: sql<number>`coalesce(sum(${bankAccounts.openingBalance}),0)::int` })
    .from(bankAccounts)
    .where(eq(bankAccounts.ownerId, ownerId));

  const [txAgg] = await db
    .select({
      inflow: sql<number>`coalesce(sum(case when ${bankTransactions.direction} = 'encaissement' then ${bankTransactions.amount} else 0 end),0)::int`,
      outflow: sql<number>`coalesce(sum(case when ${bankTransactions.direction} = 'decaissement' then ${bankTransactions.amount} else 0 end),0)::int`,
    })
    .from(bankTransactions)
    .where(eq(bankTransactions.ownerId, ownerId));

  const monthly = await db
    .select({
      month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`,
      ht: sql<number>`coalesce(sum(${invoices.totalHt}),0)::int`,
    })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), sql`${invoices.status} <> 'annulee'`))
    .groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`);

  const monthlyBills = await db
    .select({
      month: sql<string>`to_char(${bills.issueDate}, 'YYYY-MM')`,
      ht: sql<number>`coalesce(sum(${bills.totalHt}),0)::int`,
    })
    .from(bills)
    .where(eq(bills.ownerId, ownerId))
    .groupBy(sql`to_char(${bills.issueDate}, 'YYYY-MM')`);

  const billByMonth = new Map(monthlyBills.map((b) => [b.month, Number(b.ht)]));
  const monthlyWithPurchases = monthly.map((m) => ({
    month: m.month,
    ht: Number(m.ht),
    purchases: billByMonth.get(m.month) ?? 0,
  }));

  const topClients = await db
    .select({
      name: sql<string>`coalesce(nullif(${invoices.partnerName}, ''), 'Client non nommé')`,
      total: sql<number>`coalesce(sum(${invoices.totalHt}),0)::int`,
    })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), sql`${invoices.status} <> 'annulee'`))
    .groupBy(sql`coalesce(nullif(${invoices.partnerName}, ''), 'Client non nommé')`)
    .orderBy(sql`coalesce(sum(${invoices.totalHt}),0) desc`)
    .limit(6);

  const recentInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.ownerId, ownerId))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(6);

  const cash = (cashAgg?.opening ?? 0) + (txAgg?.inflow ?? 0) - (txAgg?.outflow ?? 0);

  return {
    revenueHt: invAgg?.ht ?? 0,
    revenueVat: invAgg?.vat ?? 0,
    revenueTtc: invAgg?.ttc ?? 0,
    invoiceCount: invAgg?.count ?? 0,
    purchaseHt: billAgg?.ht ?? 0,
    purchaseVat: billAgg?.vat ?? 0,
    purchaseCount: billAgg?.count ?? 0,
    vatDue: (invAgg?.vat ?? 0) - (billAgg?.vat ?? 0),
    employees: empAgg?.count ?? 0,
    payrollGross: payAgg?.gross ?? 0,
    payrollNet: payAgg?.net ?? 0,
    payrollIrpp: payAgg?.irpp ?? 0,
    payrollCnss: payAgg?.cnss ?? 0,
    payrollCnssEmployer: payAgg?.cnssEmployer ?? 0,
    payrollCss: payAgg?.css ?? 0,
    assetsCost: assetAgg?.cost ?? 0,
    assetsAccumulated: assetAgg?.acc ?? 0,
    cash,
    monthly: monthlyWithPurchases,
    topClients: topClients.map((c) => ({ name: c.name, total: Number(c.total) })),
    recentInvoices,
  };
}

/** Vide toutes les données métier d'un utilisateur (garde le compte). */
export async function clearAllData(ownerId: string) {
  await db.delete(transmissions).where(eq(transmissions.ownerId, ownerId));
  await db.delete(taxDeclarations).where(eq(taxDeclarations.ownerId, ownerId));
  await db.delete(bankTransactions).where(eq(bankTransactions.ownerId, ownerId));
  await db.delete(bankAccounts).where(eq(bankAccounts.ownerId, ownerId));
  await db.delete(assets).where(eq(assets.ownerId, ownerId));
  await db.delete(journalLines).where(eq(journalLines.ownerId, ownerId));
  await db.delete(journalEntries).where(eq(journalEntries.ownerId, ownerId));
  await db.delete(accounts).where(eq(accounts.ownerId, ownerId));
  await db.delete(payslips).where(eq(payslips.ownerId, ownerId));
  await db.delete(payrollRuns).where(eq(payrollRuns.ownerId, ownerId));
  await db.delete(employees).where(eq(employees.ownerId, ownerId));
  await db.delete(stockMovements).where(eq(stockMovements.ownerId, ownerId));
  await db.delete(billLines).where(eq(billLines.ownerId, ownerId));
  await db.delete(bills).where(eq(bills.ownerId, ownerId));
  await db.delete(invoiceLines).where(eq(invoiceLines.ownerId, ownerId));
  await db.delete(invoices).where(eq(invoices.ownerId, ownerId));
  await db.delete(products).where(eq(products.ownerId, ownerId));
  await db.delete(partners).where(eq(partners.ownerId, ownerId));
  return { ok: true };
}
