// ── AGENT-OWNED: tRPC API surface (Controller) ───────────────────────────────
// Architecture MVC : ce fichier = Controller (validation + orchestration),
// server/services/* = métier, server/db.ts = accès données, pages React = View.
// Toutes les procédures métier sont `protectedProcedure` et scopées par
// ctx.user.id : un compte ne voit jamais les livres d'un autre.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { authProvider, registerLocalUser, AuthError, EmailTakenError } from "./_core/auth";
import { storageCommit, storageDeleteAnonymous, storagePutUrl, StorageError } from "./_core/storage";
import * as q from "./db";
import { computeVat, monthPeriod, quarterPeriod, vatDueDate } from "./services/vat";
import { postSalesInvoice, postPurchaseBill, postPayrollRun, isBalanced } from "./services/accounting";
import { buildBalanceSheet, buildIncomeStatement } from "./services/reports";
import { buildCnssDeclaration, buildAnnualFiling, SOCIAL_RATES, yearPeriod } from "./services/declarations";
import { buildEfatouraXml, validateEfatouraXml } from "./services/efatoura";
import { parseTND as parseAmountToMillimes } from "../shared/fiscal";
import { buildEfatouraPayload, buildTtnPayload, transmit, transmissionStatus } from "./transmission";

/** Mois courant au format YYYY-MM. */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  signup: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const user = await registerLocalUser(input.email, input.password, input.name);
        await authProvider().login(ctx.c, input.email, input.password);
        return user;
      } catch (e: unknown) {
        if (e instanceof EmailTakenError) throw new TRPCError({ code: "CONFLICT", message: e.message });
        throw e;
      }
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await authProvider().login(ctx.c, input.email, input.password);
      } catch (e: unknown) {
        if (e instanceof AuthError) throw new TRPCError({ code: "UNAUTHORIZED", message: e.message });
        throw e;
      }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await authProvider().logout(ctx.c);
    return { ok: true };
  }),
});

// ── Société ──────────────────────────────────────────────────────────────────
const companyRouter = router({
  get: protectedProcedure.query(({ ctx }) => q.getCompany(ctx.user.id)),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        matriculeFiscal: z.string().optional(),
        registreCommerce: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        vatRegime: z.enum(["assujetti", "non_assujetti", "exportateur"]).optional(),
        taxRegime: z.enum(["reel", "forfaitaire"]).optional(),
        isRate: z.union([z.literal(15), z.literal(20)]).optional(),
        fiscalYear: z.number().int().min(2000).max(2100).optional(),
        tclRateBp: z.number().int().min(0).max(1000).optional(),
        cnssNumber: z.string().optional(),
        vatRegime: z.enum(["assujetti", "non_assujetti", "exportateur"]).optional(),
        taxRegime: z.enum(["reel", "forfaitaire"]).optional(),
        isRate: z.number().int().optional(),
        fiscalYear: z.number().int().optional(),
        tclRateBp: z.number().int().optional(),
        vatRateStandard: z.number().int().optional(),
        vatRateIntermediate: z.number().int().optional(),
        vatRateReduced: z.number().int().optional(),
        stampDutyMillimes: z.number().int().optional(),
        cnssEmployeeRateBp: z.number().int().optional(),
        cnssEmployerRateBp: z.number().int().optional(),
        cssRateBp: z.number().int().optional(),
        headOfFamilyDeduction: z.number().int().optional(),
        dependentDeduction: z.number().int().optional(),
        foprolosRateBp: z.number().int().optional(),
        tfpRateBp: z.number().int().optional(),
        currencyCode: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.updateCompany(ctx.user.id, input)),
});

// ── Tiers ────────────────────────────────────────────────────────────────────
const partnerInput = z.object({
  type: z.enum(["client", "fournisseur"]),
  code: z.string().min(1),
  name: z.string().min(1),
  matriculeFiscal: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  paymentTerms: z.number().int().min(0).max(365).optional(),
  notes: z.string().optional(),
});

const partnersRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.string().optional() }).optional())
    .query(({ ctx, input }) => q.listPartners(ctx.user.id, input?.type)),

  create: protectedProcedure.input(partnerInput).mutation(({ ctx, input }) => q.createPartner(ctx.user.id, input)),

  update: protectedProcedure
    .input(partnerInput.partial().extend({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      return q.updatePartner(ctx.user.id, id, patch);
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deletePartner(ctx.user.id, input.id)),
});

// ── Articles ─────────────────────────────────────────────────────────────────
const productInput = z.object({
  reference: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["produit", "service"]).optional(),
  unit: z.string().optional(),
  priceHt: z.number().int().min(0),
  costPrice: z.number().int().min(0).optional(),
  vatRate: z.number().int().refine((v) => [19, 13, 7, 0].includes(v), "Taux de TVA invalide"),
  accountCode: z.string().optional(),
  stockQty: z.number().int().optional(),
  reorderLevel: z.number().int().min(0).optional(),
});

const productsRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listProducts(ctx.user.id)),
  create: protectedProcedure.input(productInput).mutation(({ ctx, input }) => q.createProduct(ctx.user.id, input)),

  update: protectedProcedure
    .input(productInput.partial().extend({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      return q.updateProduct(ctx.user.id, id, patch);
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteProduct(ctx.user.id, input.id)),
});

// ── Stock ────────────────────────────────────────────────────────────────────
const stockRouter = router({
  movements: protectedProcedure
    .input(z.object({ productId: z.string().uuid().optional() }).optional())
    .query(({ ctx, input }) => q.listStockMovements(ctx.user.id, input?.productId)),

  alerts: protectedProcedure.query(({ ctx }) => q.getStockAlerts(ctx.user.id)),

  move: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        moveDate: z.string().min(10),
        kind: z.enum(["entree", "sortie", "inventaire"]),
        quantity: z.number().int().min(0),
        unitCost: z.number().int().min(0).optional(),
        reference: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.createStockMovement(ctx.user.id, input)),
});

// ── Factures ─────────────────────────────────────────────────────────────────
const lineInput = z.object({
  productId: z.string().uuid().nullish(),
  label: z.string().min(1),
  quantity: z.number().int().min(0),
  unitPrice: z.number().int().min(0),
  vatRate: z.number().int().refine((v) => [19, 13, 7, 0].includes(v), "Taux de TVA invalide"),
});

const invoicesRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listInvoices(ctx.user.id)),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => q.getInvoice(ctx.user.id, input.id)),
  nextNumber: protectedProcedure.query(({ ctx }) => q.nextInvoiceNumber(ctx.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        number: z.string().optional(),
        partnerId: z.string().uuid().nullish(),
        partnerName: z.string().min(1),
        issueDate: z.string().min(10),
        dueDate: z.string().min(10),
        status: z.enum(["brouillon", "validee", "payee", "annulee"]).optional(),
        stampDuty: z.number().int().min(0).optional(),
        notes: z.string().optional(),
        lines: z.array(lineInput).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inv = await q.createInvoice(ctx.user.id, input);
      // Une facture validée génère son écriture comptable en partie double.
      if (inv.status !== "brouillon" && inv.status !== "annulee") {
        await postSalesInvoice(ctx.user.id, inv);
      }
      return inv;
    }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(["brouillon", "validee", "payee", "annulee"]) }))
    .mutation(async ({ ctx, input }) => {
      const before = await q.getInvoice(ctx.user.id, input.id);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
      const row = await q.updateInvoiceStatus(ctx.user.id, input.id, input.status);
      // Passage brouillon → validée : on comptabilise maintenant.
      if (before.status === "brouillon" && input.status !== "brouillon" && input.status !== "annulee") {
        await postSalesInvoice(ctx.user.id, before);
      }
      return row;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteInvoice(ctx.user.id, input.id)),

  /** XML e-Fatoura (TEIF) de la facture, prêt à télécharger ou transmettre. */
  efatouraXml: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const inv = await q.getInvoice(ctx.user.id, input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
      const co = await q.getCompany(ctx.user.id);
      const partner = inv.partnerId
        ? (await q.listPartners(ctx.user.id)).find((p) => p.id === inv.partnerId)
        : undefined;
      const xml = buildEfatouraXml(
        { ...inv, partnerMatricule: partner?.matriculeFiscal, partnerAddress: partner?.address },
        co,
      );
      return { xml, validation: validateEfatouraXml(xml), filename: `efatoura_${inv.number}.xml` };
    }),
});

// ── Achats ───────────────────────────────────────────────────────────────────
const billsRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listBills(ctx.user.id)),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => q.getBill(ctx.user.id, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        number: z.string().min(1),
        partnerId: z.string().uuid().nullish(),
        partnerName: z.string().min(1),
        issueDate: z.string().min(10),
        dueDate: z.string().min(10),
        status: z.enum(["brouillon", "validee", "payee"]).optional(),
        withholding: z.number().int().min(0).optional(),
        notes: z.string().optional(),
        lines: z
          .array(
            z.object({
              label: z.string().min(1),
              quantity: z.number().int().min(0),
              unitPrice: z.number().int().min(0),
              vatRate: z.number().int().refine((v) => [19, 13, 7, 0].includes(v), "Taux de TVA invalide"),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const b = await q.createBill(ctx.user.id, input);
      if (b.status !== "brouillon") await postPurchaseBill(ctx.user.id, b);
      return b;
    }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(["brouillon", "validee", "payee"]) }))
    .mutation(async ({ ctx, input }) => {
      const before = await q.getBill(ctx.user.id, input.id);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Achat introuvable." });
      const row = await q.updateBillStatus(ctx.user.id, input.id, input.status);
      if (before.status === "brouillon" && input.status !== "brouillon") {
        await postPurchaseBill(ctx.user.id, before);
      }
      return row;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteBill(ctx.user.id, input.id)),
});

// ── Salariés ─────────────────────────────────────────────────────────────────
const employeeInput = z.object({
  matricule: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  position: z.string().optional(),
  department: z.string().optional(),
  hireDate: z.string().min(10),
  baseSalary: z.number().int().min(0),
  allowances: z.number().int().min(0).optional(),
  maritalStatus: z.enum(["celibataire", "marie"]).optional(),
  children: z.number().int().min(0).max(20).optional(),
  headOfFamily: z.boolean().optional(),
  cnssNumber: z.string().optional(),
        vatRegime: z.enum(["assujetti", "non_assujetti", "exportateur"]).optional(),
        taxRegime: z.enum(["reel", "forfaitaire"]).optional(),
        isRate: z.number().int().optional(),
        fiscalYear: z.number().int().optional(),
        tclRateBp: z.number().int().optional(),
        vatRateStandard: z.number().int().optional(),
        vatRateIntermediate: z.number().int().optional(),
        vatRateReduced: z.number().int().optional(),
        stampDutyMillimes: z.number().int().optional(),
        cnssEmployeeRateBp: z.number().int().optional(),
        cnssEmployerRateBp: z.number().int().optional(),
        cssRateBp: z.number().int().optional(),
        headOfFamilyDeduction: z.number().int().optional(),
        dependentDeduction: z.number().int().optional(),
        foprolosRateBp: z.number().int().optional(),
        tfpRateBp: z.number().int().optional(),
        currencyCode: z.string().optional(),
  status: z.enum(["actif", "sorti"]).optional(),
});

const employeesRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listEmployees(ctx.user.id)),
  create: protectedProcedure.input(employeeInput).mutation(({ ctx, input }) => q.createEmployee(ctx.user.id, input)),

  update: protectedProcedure
    .input(employeeInput.partial().extend({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      return q.updateEmployee(ctx.user.id, id, patch);
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteEmployee(ctx.user.id, input.id)),
});

// ── Paie ─────────────────────────────────────────────────────────────────────
const payrollRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listPayrollRuns(ctx.user.id)),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => q.getPayrollRun(ctx.user.id, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/, "Période attendue AAAA-MM"),
        label: z.string().optional(),
        payslips: z
          .array(
            z.object({
              employeeId: z.string().uuid().nullish(),
              employeeName: z.string().min(1),
              matricule: z.string().min(1),
              baseSalary: z.number().int().min(0),
              allowances: z.number().int().min(0),
              gross: z.number().int().min(0),
              cnssEmployee: z.number().int().min(0),
              cnssEmployer: z.number().int().min(0),
              css: z.number().int().min(0),
              taxableBase: z.number().int().min(0),
              irpp: z.number().int().min(0),
              net: z.number().int().min(0),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await q.createPayrollRun(ctx.user.id, input);
      await postPayrollRun(ctx.user.id, run);
      return run;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deletePayrollRun(ctx.user.id, input.id)),
});

// ── Comptabilité ─────────────────────────────────────────────────────────────
const accountingRouter = router({
  accounts: protectedProcedure.query(({ ctx }) => q.listAccounts(ctx.user.id)),
  entries: protectedProcedure.query(({ ctx }) => q.listJournalEntries(ctx.user.id)),
  entry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => q.getJournalEntry(ctx.user.id, input.id)),
  trialBalance: protectedProcedure.query(({ ctx }) => q.getTrialBalance(ctx.user.id)),

  createAccount: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        classNo: z.number().int().min(1).max(7),
        nature: z.enum(["actif", "passif", "charge", "produit"]),
      }),
    )
    .mutation(({ ctx, input }) => q.createAccount(ctx.user.id, input)),

  createEntry: protectedProcedure
    .input(
      z.object({
        entryDate: z.string().min(10),
        journal: z.enum(["VE", "AC", "BQ", "CA", "OD", "PA"]),
        reference: z.string().optional(),
        label: z.string().min(1),
        lines: z
          .array(
            z.object({
              accountCode: z.string().min(1),
              accountLabel: z.string().optional(),
              debit: z.number().int().min(0),
              credit: z.number().int().min(0),
            }),
          )
          .min(2),
      }),
    )
    .mutation(({ ctx, input }) => {
      if (!isBalanced(input.lines.map((l) => ({ ...l, accountLabel: l.accountLabel ?? "" })))) {
        const d = input.lines.reduce((s, l) => s + l.debit, 0);
        const c = input.lines.reduce((s, l) => s + l.credit, 0);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Écriture déséquilibrée : débit ${d} ≠ crédit ${c} (millimes).`,
        });
      }
      return q.createJournalEntry(ctx.user.id, input);
    }),

  removeEntry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteJournalEntry(ctx.user.id, input.id)),

  /** Bilan comptable sur une période. */
  balanceSheet: protectedProcedure
    .input(z.object({ from: z.string().min(10), to: z.string().min(10) }))
    .query(({ ctx, input }) => buildBalanceSheet(ctx.user.id, input.from, input.to)),

  /** Compte de résultat sur une période. */
  incomeStatement: protectedProcedure
    .input(z.object({ from: z.string().min(10), to: z.string().min(10), isRate: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const co = await q.getCompany(ctx.user.id);
      return buildIncomeStatement(ctx.user.id, input.from, input.to, input.isRate ?? co.isRate);
    }),
});

// ── Immobilisations ──────────────────────────────────────────────────────────
const assetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listAssets(ctx.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        category: z.string().optional(),
        acquisitionDate: z.string().min(10),
        cost: z.number().int().min(0),
        durationYears: z.number().int().min(1).max(50),
        rateBp: z.number().int().min(0).max(10000),
        accumulated: z.number().int().min(0).optional(),
        accountCode: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.createAsset(ctx.user.id, input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteAsset(ctx.user.id, input.id)),
});

// ── Trésorerie ───────────────────────────────────────────────────────────────
const treasuryRouter = router({
  accounts: protectedProcedure.query(({ ctx }) => q.listBankAccounts(ctx.user.id)),
  transactions: protectedProcedure
    .input(z.object({ accountId: z.string().uuid().optional() }).optional())
    .query(({ ctx, input }) => q.listBankTransactions(ctx.user.id, input?.accountId)),

  createAccount: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1),
        kind: z.enum(["banque", "caisse"]).optional(),
        bankName: z.string().optional(),
        rib: z.string().optional(),
        openingBalance: z.number().int().optional(),
        accountCode: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.createBankAccount(ctx.user.id, input)),

  createTransaction: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        txDate: z.string().min(10),
        label: z.string().min(1),
        direction: z.enum(["encaissement", "decaissement"]),
        amount: z.number().int().min(0),
        category: z.string().optional(),
        reference: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.createBankTransaction(ctx.user.id, input)),

  removeTransaction: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteBankTransaction(ctx.user.id, input.id)),
});

// ── Fiscalité ────────────────────────────────────────────────────────────────
const taxRouter = router({
  list: protectedProcedure.query(({ ctx }) => q.listTaxDeclarations(ctx.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["TVA", "TCL", "IS", "ACOMPTE", "IRPP", "RS", "CNSS", "BILAN"]),
        period: z.string().min(1),
        dueDate: z.string().min(10),
        baseAmount: z.number().int().min(0),
        taxAmount: z.number().int().min(0),
        status: z.enum(["a_declarer", "declaree", "payee"]).optional(),
        notes: z.string().optional(),
        detail: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => q.createTaxDeclaration(ctx.user.id, input)),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(["a_declarer", "declaree", "payee"]) }))
    .mutation(({ ctx, input }) => q.updateTaxDeclaration(ctx.user.id, input.id, { status: input.status })),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => q.deleteTaxDeclaration(ctx.user.id, input.id)),

  /** Déclaration CNSS d'un mois, calculée depuis les bulletins réels. */
  cnss: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(({ ctx, input }) => buildCnssDeclaration(ctx.user.id, input.month ?? currentMonth())),

  /** Génère et enregistre la déclaration CNSS du mois. */
  generateCnss: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .mutation(async ({ ctx, input }) => {
      const month = input.month ?? currentMonth();
      const d = await buildCnssDeclaration(ctx.user.id, month);
      if (d.employees === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Aucun bulletin de paie pour ${month}.` });
      }
      return q.createTaxDeclaration(ctx.user.id, {
        kind: "CNSS",
        period: month,
        dueDate: d.dueDate,
        baseAmount: d.grossBase,
        taxAmount: d.total,
        status: "a_declarer",
        detail: {
          employees: d.employees,
          employeeShare: d.employeeShare,
          employerShare: d.employerShare,
          css: d.css,
          rates: SOCIAL_RATES,
        },
      });
    }),

  /** Dépôt du bilan annuel : résultat, IS, acomptes. */
  annualFiling: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const co = await q.getCompany(ctx.user.id);
      const { from, to } = yearPeriod(input.year);
      const pnl = await buildIncomeStatement(ctx.user.id, from, to, co.isRate);
      const decls = await q.listTaxDeclarations(ctx.user.id);
      const paid = decls
        .filter((d) => d.kind === "ACOMPTE" && d.period.startsWith(String(input.year)) && d.status === "payee")
        .reduce((s, d) => s + d.taxAmount, 0);
      return buildAnnualFiling(input.year, co.isRate, pnl.totalRevenue, pnl.totalExpenses, paid);
    }),

  /** Enregistre le dépôt du bilan annuel. */
  generateAnnualFiling: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .mutation(async ({ ctx, input }) => {
      const co = await q.getCompany(ctx.user.id);
      const { from, to } = yearPeriod(input.year);
      const pnl = await buildIncomeStatement(ctx.user.id, from, to, co.isRate);
      const decls = await q.listTaxDeclarations(ctx.user.id);
      const paid = decls
        .filter((d) => d.kind === "ACOMPTE" && d.period.startsWith(String(input.year)) && d.status === "payee")
        .reduce((s, d) => s + d.taxAmount, 0);
      const f = await buildAnnualFiling(input.year, co.isRate, pnl.totalRevenue, pnl.totalExpenses, paid);
      return q.createTaxDeclaration(ctx.user.id, {
        kind: "BILAN",
        period: String(input.year),
        dueDate: f.dueDate,
        baseAmount: Math.max(0, f.result),
        taxAmount: f.isAmount,
        status: "a_declarer",
        detail: {
          revenue: f.revenue,
          expenses: f.expenses,
          result: f.result,
          isRate: f.isRate,
          installmentsPaid: f.installmentsPaid,
          balanceDue: f.balanceDue,
        },
      });
    }),
});

// ── Import en masse (Excel / CSV) ────────────────────────────────────────────
const importRouter = router({
  partners: protectedProcedure
    .input(z.object({ type: z.enum(["client", "fournisseur"]), rows: z.array(z.record(z.string(), z.string())).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      let imported = 0;
      const errors: string[] = [];
      for (const [i, r] of input.rows.entries()) {
        const name = (r["Raison sociale"] ?? r["Nom"] ?? r["name"] ?? "").trim();
        const code = (r["Code"] ?? r["code"] ?? "").trim() || `IMP-${Date.now()}-${i}`;
        if (!name) {
          errors.push(`Ligne ${i + 2} : raison sociale manquante.`);
          continue;
        }
        try {
          await q.createPartner(ctx.user.id, {
            type: input.type,
            code,
            name,
            matriculeFiscal: (r["Matricule fiscal"] ?? "").trim() || undefined,
            address: (r["Adresse"] ?? "").trim() || undefined,
            email: (r["E-mail"] ?? r["Email"] ?? "").trim() || undefined,
            phone: (r["Téléphone"] ?? r["Telephone"] ?? "").trim() || undefined,
            paymentTerms: Number((r["Délai"] ?? "30").replace(/[^\d]/g, "")) || 30,
          });
          imported++;
        } catch (e) {
          errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : "échec"}`);
        }
      }
      return { imported, errors };
    }),

  products: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.string())).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      let imported = 0;
      const errors: string[] = [];
      for (const [i, r] of input.rows.entries()) {
        const name = (r["Désignation"] ?? r["Designation"] ?? r["name"] ?? "").trim();
        const reference = (r["Référence"] ?? r["Reference"] ?? "").trim() || `IMP-${Date.now()}-${i}`;
        if (!name) {
          errors.push(`Ligne ${i + 2} : désignation manquante.`);
          continue;
        }
        try {
          await q.createProduct(ctx.user.id, {
            reference,
            name,
            kind: /service/i.test(r["Type"] ?? "") ? "service" : "produit",
            unit: (r["Unité"] ?? r["Unite"] ?? "U").trim() || "U",
            priceHt: parseAmountToMillimes(r["Prix HT"] ?? r["Prix"] ?? "0"),
            costPrice: parseAmountToMillimes(r["Prix d'achat"] ?? "0"),
            vatRate: Number((r["TVA"] ?? "19").replace(/[^\d]/g, "")) || 19,
            accountCode: (r["Compte"] ?? "701").trim() || "701",
            stockQty: Number((r["Stock"] ?? "0").replace(/[^\d-]/g, "")) || 0,
            reorderLevel: Number((r["Seuil"] ?? "0").replace(/[^\d]/g, "")) || 0,
          });
          imported++;
        } catch (e) {
          errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : "échec"}`);
        }
      }
      return { imported, errors };
    }),

  employees: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.string())).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      let imported = 0;
      const errors: string[] = [];
      for (const [i, r] of input.rows.entries()) {
        const firstName = (r["Prénom"] ?? r["Prenom"] ?? "").trim();
        const lastName = (r["Nom"] ?? "").trim();
        if (!firstName || !lastName) {
          errors.push(`Ligne ${i + 2} : prénom ou nom manquant.`);
          continue;
        }
        try {
          await q.createEmployee(ctx.user.id, {
            matricule: (r["Matricule"] ?? "").trim() || `EMP-${Date.now()}-${i}`,
            firstName,
            lastName,
            position: (r["Poste"] ?? "").trim() || undefined,
            department: (r["Service"] ?? "Administration").trim() || "Administration",
            hireDate: (r["Date d'embauche"] ?? "").trim() || new Date().toISOString().slice(0, 10),
            baseSalary: parseAmountToMillimes(r["Salaire de base"] ?? "0"),
            allowances: parseAmountToMillimes(r["Primes"] ?? "0"),
            maritalStatus: /mari/i.test(r["Situation"] ?? "") ? "marie" : "celibataire",
            children: Number((r["Enfants"] ?? "0").replace(/[^\d]/g, "")) || 0,
            headOfFamily: /oui|true|1/i.test(r["Chef de famille"] ?? ""),
            cnssNumber: (r["N° CNSS"] ?? "").trim() || undefined,
          });
          imported++;
        } catch (e) {
          errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : "échec"}`);
        }
      }
      return { imported, errors };
    }),
});

// ── TVA : collectée / déductible / solde ─────────────────────────────────────
const vatRouter = router({
  summary: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional(), quarter: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const period = input.quarter ? quarterPeriod(input.quarter) : monthPeriod(input.month ?? currentMonth());
      return computeVat(ctx.user.id, period);
    }),

  /** Génère (ou met à jour) la déclaration TVA de la période. */
  generateDeclaration: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional(), quarter: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const period = input.quarter ? quarterPeriod(input.quarter) : monthPeriod(input.month ?? currentMonth());
      const s = await computeVat(ctx.user.id, period);
      const label = input.quarter ?? input.month ?? currentMonth();
      return q.createTaxDeclaration(ctx.user.id, {
        kind: "TVA",
        period: label,
        dueDate: vatDueDate(period),
        baseAmount: s.collected.base,
        taxAmount: s.toPay,
        status: "a_declarer",
        detail: {
          collectedVat: s.collected.vat,
          deductibleVat: s.deductible.vat,
          credit: s.credit,
          balance: s.balance,
        },
      });
    }),
});

// ── Transmissions TTN / e-Fatoura ────────────────────────────────────────────
const transmissionRouter = router({
  status: protectedProcedure.query(async () => transmissionStatus()),
  history: protectedProcedure.query(({ ctx }) => q.listTransmissions(ctx.user.id)),

  /** Transmet une facture à e-Fatoura (XML TEIF + charge utile JSON). */
  sendInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await q.getInvoice(ctx.user.id, input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
      const company = await q.getCompany(ctx.user.id);
      const partner = invoice.partnerId
        ? (await q.listPartners(ctx.user.id)).find((p) => p.id === invoice.partnerId)
        : undefined;

      const xml = buildEfatouraXml(
        { ...invoice, partnerMatricule: partner?.matriculeFiscal, partnerAddress: partner?.address },
        company,
      );
      const payload = { ...buildEfatouraPayload(invoice, company), xml };

      const result = await transmit("efatoura", "/api/v1/invoices", payload);

      await q.logTransmission(ctx.user.id, {
        platform: "efatoura",
        subjectType: "facture",
        subjectId: invoice.id,
        subjectLabel: invoice.number,
        status: result.status,
        httpStatus: result.httpStatus ?? null,
        reference: result.reference ?? null,
        message: result.message,
      });

      return result;
    }),

  /** Transmet une déclaration fiscale à la Télédéclaration TTN. */
  sendDeclaration: protectedProcedure
    .input(z.object({ declarationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const all = await q.listTaxDeclarations(ctx.user.id);
      const decl = all.find((d) => d.id === input.declarationId);
      if (!decl) throw new TRPCError({ code: "NOT_FOUND", message: "Déclaration introuvable." });
      const company = await q.getCompany(ctx.user.id);

      const result = await transmit("ttn", "/api/v1/declarations", buildTtnPayload(decl, company));

      await q.logTransmission(ctx.user.id, {
        platform: "ttn",
        subjectType: "declaration",
        subjectId: decl.id,
        subjectLabel: `${decl.kind} ${decl.period}`,
        status: result.status,
        httpStatus: result.httpStatus ?? null,
        reference: result.reference ?? null,
        message: result.message,
      });

      if (result.ok) await q.updateTaxDeclaration(ctx.user.id, decl.id, { status: "declaree" });
      return result;
    }),
});

// ── Tableau de bord ──────────────────────────────────────────────────────────
const dashboardRouter = router({
  get: protectedProcedure.query(({ ctx }) => q.getDashboard(ctx.user.id)),
});

// ── Données de démonstration ─────────────────────────────────────────────────
const seedRouter = router({
  /** Charge un jeu de démonstration réparti sur les 12 mois de l'année. */
  load: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100).optional(), reset: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { seedDemoData } = await import("./services/seed");
      return seedDemoData(ctx.user.id, input.year ?? new Date().getFullYear(), input.reset ?? false);
    }),

  /** Vide toutes les données métier du compte connecté. */
  clear: protectedProcedure.mutation(({ ctx }) => q.clearAllData(ctx.user.id)),
});

// ── Fichiers ─────────────────────────────────────────────────────────────────
export function sanitizeBasename(name: string): string {
  const last = name.split(/[/\\]/).pop() ?? "";
  const dot = last.lastIndexOf(".");
  const rawStem = dot > 0 ? last.slice(0, dot) : last;
  const rawExt = dot > 0 ? last.slice(dot + 1) : "";
  const stem = rawStem.replace(/[^A-Za-z0-9._-]/g, "").replace(/^\.+/, "") || "upload";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return ext ? `${stem}.${ext}` : stem;
}

const filesRouter = router({
  uploadUrl: protectedProcedure
    .input(z.object({ name: z.string().min(1), contentType: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const key = `${crypto.randomUUID()}-${sanitizeBasename(input.name)}`;
      try {
        const { uploadUrl, publicPath } = await storagePutUrl(key, input.contentType);
        return { key, uploadUrl, publicPath };
      } catch (e) {
        if (e instanceof StorageError && e.code === "failed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Type de fichier non autorisé." });
        }
        throw e;
      }
    }),

  commit: protectedProcedure
    .input(z.object({ key: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await storageCommit(input.key, { name: input.name });
      } catch (e) {
        if (e instanceof StorageError && e.code === "not_found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fichier introuvable." });
        }
        throw e;
      }
    }),

  remove: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await storageDeleteAnonymous(input.key);
      } catch (e) {
        if (e instanceof StorageError && e.code === "forbidden") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Clé invalide." });
        }
        throw e;
      }
    }),
});

export const appRouter = router({
  auth: authRouter,
  company: companyRouter,
  partners: partnersRouter,
  products: productsRouter,
  stock: stockRouter,
  invoices: invoicesRouter,
  bills: billsRouter,
  employees: employeesRouter,
  payroll: payrollRouter,
  accounting: accountingRouter,
  assets: assetsRouter,
  treasury: treasuryRouter,
  tax: taxRouter,
  vat: vatRouter,
  import: importRouter,
  transmission: transmissionRouter,
  dashboard: dashboardRouter,
  seed: seedRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;
