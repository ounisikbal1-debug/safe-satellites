import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { makeCaller } from "./_core/test-caller";
import type { SessionUser } from "../shared/types";

// Full rationale for what gets mocked below (and why ./_core/trpc doesn't
// need to be) lives on server/_core/test-caller.ts, next to makeCaller —
// mock every _core module routers.ts touches.
vi.mock("./_core/auth", () => {
  class AuthError extends Error {}
  return {
    authProvider: () => ({ login: vi.fn(), logout: vi.fn(), getSession: vi.fn() }),
    registerLocalUser: vi.fn(),
    AuthError,
    EmailTakenError: class EmailTakenError extends AuthError {},
  };
});

vi.mock("./_core/storage", () => ({
  storageCommit: vi.fn(),
  storageDeleteAnonymous: vi.fn(),
  storagePutUrl: vi.fn(),
  StorageError: class StorageError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("./services/vat", () => ({
  computeVat: vi.fn(async () => ({
    period: { from: "2026-11-01", to: "2026-11-30" },
    collected: { base: 0, vat: 0, byRate: [], documents: 0 },
    deductible: { base: 0, vat: 0, byRate: [], documents: 0 },
    balance: 0,
    toPay: 0,
    credit: 0,
    effectiveRate: 0,
  })),
  monthPeriod: vi.fn(() => ({ from: "2026-11-01", to: "2026-11-30" })),
  quarterPeriod: vi.fn(() => ({ from: "2026-10-01", to: "2026-12-31" })),
  vatDueDate: vi.fn(() => "2026-12-15"),
}));

// Les services métier importent ./db (donc DATABASE_URL) : on les mocke pour
// que la suite tourne sans base de données.
vi.mock("./services/accounting", () => ({
  postSalesInvoice: vi.fn(),
  postPurchaseBill: vi.fn(),
  postPayrollRun: vi.fn(),
  postReceipt: vi.fn(),
  postPayment: vi.fn(),
  isBalanced: vi.fn(() => true),
  ACCOUNT_LABELS: {},
  label: vi.fn(() => ""),
}));

vi.mock("./services/reports", () => ({
  buildBalanceSheet: vi.fn(),
  buildIncomeStatement: vi.fn(),
}));

vi.mock("./services/declarations", () => ({
  buildCnssDeclaration: vi.fn(),
  buildAnnualFiling: vi.fn(),
  SOCIAL_RATES: { cnssEmployee: 9.68, cnssEmployer: 17.07, css: 0.5 },
  yearPeriod: vi.fn(() => ({ from: "2026-01-01", to: "2026-12-31" })),
  monthBounds: vi.fn(() => ({ from: "2026-11-01", to: "2026-11-30" })),
  sumDeclarations: vi.fn(),
}));

vi.mock("./services/efatoura", () => ({
  buildEfatouraXml: vi.fn(() => "<TEIF/>"),
  validateEfatouraXml: vi.fn(() => ({ ok: true, errors: [] })),
}));

vi.mock("./transmission", () => ({
  transmit: vi.fn(),
  transmissionStatus: vi.fn(() => []),
  buildEfatouraPayload: vi.fn(() => ({})),
  buildTtnPayload: vi.fn(() => ({})),
}));

vi.mock("./db", () => ({
  getCompany: vi.fn(),
  listPartners: vi.fn(),
  createPartner: vi.fn(),
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  nextInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  listBills: vi.fn(),
  getBill: vi.fn(),
  createBill: vi.fn(),
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  listPayrollRuns: vi.fn(),
  getPayrollRun: vi.fn(),
  createPayrollRun: vi.fn(),
  listAccounts: vi.fn(),
  listJournalEntries: vi.fn(),
  getJournalEntry: vi.fn(),
  createJournalEntry: vi.fn(),
  getTrialBalance: vi.fn(),
  listAssets: vi.fn(),
  createAsset: vi.fn(),
  listBankAccounts: vi.fn(),
  listBankTransactions: vi.fn(),
  createBankAccount: vi.fn(),
  createBankTransaction: vi.fn(),
  listTaxDeclarations: vi.fn(),
  createTaxDeclaration: vi.fn(),
  getDashboard: vi.fn(),
  listTransmissions: vi.fn(),
  logTransmission: vi.fn(),
}));

const { sanitizeBasename, appRouter } = await import("./routers");
const { storageDeleteAnonymous, storagePutUrl, StorageError } = await import("./_core/storage");
const q = await import("./db");
const { registerLocalUser, EmailTakenError } = await import("./_core/auth");

// C1c: uploadUrl's key is `${uuid}-${sanitizeBasename(name)}`. The uuid prefix
// only makes the key unguessable if the REST of the key isn't
// attacker-controlled — sanitizeBasename is what stops a caller-supplied
// `name` like "/../report.pdf" from steering path segments into someone
// else's key (which canonicalKey in storage.ts would then reject outright,
// but the point of sanitizing here is to never construct that key at all).
describe("sanitizeBasename", () => {
  it("passes a normal filename through unchanged", () => {
    expect(sanitizeBasename("report.pdf")).toBe("report.pdf");
  });

  it("takes only the last path segment, dropping any directory traversal", () => {
    expect(sanitizeBasename("/../report.pdf")).toBe("report.pdf");
    expect(sanitizeBasename("a/b/../evil.png")).toBe("evil.png");
    expect(sanitizeBasename("../../etc/passwd")).toBe("passwd");
  });

  it("strips characters outside [A-Za-z0-9._-]", () => {
    expect(sanitizeBasename("my file (final)!.png")).toBe("myfilefinal.png");
    expect(sanitizeBasename("héllo.png")).toBe("hllo.png");
  });

  it("collapses leading dots so a bare '.' or '..' basename can't survive", () => {
    expect(sanitizeBasename("..")).toBe("upload");
    expect(sanitizeBasename(".")).toBe("upload");
    // "upload.hidden", not "hidden": the leading dots are still gone (that is
    // the security property), but the last dot is now read as the extension
    // separator rather than deleted along with them.
    expect(sanitizeBasename("...hidden")).toBe("upload.hidden");
  });

  // Regression (observed 2026-08, published app gallery-app-gpkd51ak): a file
  // named 风景.png landed in storage as "<uuid>-png" — no dot, no extension.
  // Two rules compounded. The allowlist is ASCII-only, so a stem written
  // entirely in CJK is deleted, leaving ".png"; the leading-dot strip that
  // follows then ate the dot, because by that point the only dot left in the
  // string is the extension separator, not a dotfile prefix.
  //
  // The trigger is a stem with NO surviving ASCII, which is the common case for
  // Chinese/Japanese/Korean filenames — "微信图片_2026.png" was always fine,
  // because "_2026" survives and keeps a stem in front of the dot. That is why
  // this went unnoticed.
  it("keeps the extension when the stem is entirely non-ASCII", () => {
    expect(sanitizeBasename("风景.png")).toBe("upload.png");
    expect(sanitizeBasename("日本語.jpeg")).toBe("upload.jpeg");
    expect(sanitizeBasename("한글.png")).toBe("upload.png");
    expect(sanitizeBasename("相册/风景.png")).toBe("upload.png");
  });

  it("keeps the extension on names that already sanitized cleanly", () => {
    expect(sanitizeBasename("微信图片_2026.png")).toBe("_2026.png");
    expect(sanitizeBasename("IMG_1234.PNG")).toBe("IMG_1234.PNG");
    expect(sanitizeBasename("archive.tar.gz")).toBe("archive.tar.gz");
  });

  // A dotfile has no extension to preserve — the whole name is the stem.
  it("treats a leading-dot name as a stem, not as a bare extension", () => {
    expect(sanitizeBasename(".png")).toBe("png");
    expect(sanitizeBasename(".gitignore")).toBe("gitignore");
  });

  // The key is `${uuid}-${basename}`, so a "/" or "\\" surviving here would
  // steer path segments; an over-long extension would pad the key for no gain.
  it("never emits a path separator, and caps the extension", () => {
    expect(sanitizeBasename("C:\\photos\\风景.png")).toBe("upload.png");
    expect(sanitizeBasename("x." + "a".repeat(40))).toBe("x." + "a".repeat(10));
  });

  it("falls back to a constant when nothing survives sanitization", () => {
    expect(sanitizeBasename("???")).toBe("upload");
    expect(sanitizeBasename("")).toBe("upload");
    expect(sanitizeBasename("///")).toBe("upload");
  });
});

// C1d (regression): storageDeleteOwned runs the key through canonicalKey,
// which throws StorageError("forbidden") for a malformed key (e.g. a
// "../"-traversal segment) BEFORE any db/network access. files.remove had no
// try/catch, so that throw used to escape as a raw StorageError, which tRPC
// wraps as an opaque INTERNAL_SERVER_ERROR (500) for what is plainly bad
// client input. Exercise the real router (only auth/storage/db are mocked —
// ./_core/trpc is real) via makeCaller so this asserts the actual error the
// client would receive, not a re-implementation of the mapping.
describe("files.remove", () => {
  it("maps a malformed key (StorageError forbidden) to TRPCError BAD_REQUEST, not a raw throw", async () => {
    vi.mocked(storageDeleteAnonymous).mockRejectedValueOnce(
      new StorageError("unsafe storage key (diverges from platform normalization): ../evil.pdf", "forbidden"),
    );
    const caller = makeCaller({
      c: {} as never,
      db: {} as never,
      user: { id: "u1", email: "a@b.tn", name: "Test", role: "user" },
    });

    const err = await caller.files.remove({ key: "../evil.pdf" }).catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
  });
});

// Regression (observed 2026-08-26, published app): signing up twice with the
// same email answered 500 INTERNAL_SERVER_ERROR whose message was the raw
// Drizzle failure — the INSERT statement plus every bound param, bcrypt hash
// included — which the signup form then printed at the user. The mapping now
// hangs off a type (EmailTakenError from _core/auth), not a regex over a
// driver-specific message.
describe("auth.signup", () => {
  const anonymous = { c: {} as never, db: {} as never, user: null };

  it("maps an already-registered email to TRPCError CONFLICT, not a 500", async () => {
    vi.mocked(registerLocalUser).mockRejectedValueOnce(
      new EmailTakenError("That email is already registered — try logging in instead."),
    );
    const caller = makeCaller(anonymous);

    const err = await caller.auth
      .signup({ email: "asce1885@gmail.com", password: "hunter2hunter2", name: "asce" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("CONFLICT");
    expect((err as TRPCError).message).toMatch(/already registered/i);
    expect((err as TRPCError).message).not.toMatch(/insert into|Failed query|params:|\$2b\$/);
  });
});

// L'ERP fonctionne AVEC comptes : chaque procédure métier est protégée et
// scopée par l'utilisateur connecté. Un appelant anonyme est refusé.
describe("accounts ERP shape", () => {
  const anonymous = { c: {} as never, db: {} as never, user: null };
  const signedIn = {
    c: {} as never,
    db: {} as never,
    user: { id: "u1", email: "a@b.tn", name: "Test", role: "user" } as SessionUser,
  };

  it("refuse un appelant anonyme sur les procédures métier", async () => {
    const caller = makeCaller(anonymous);
    await expect(caller.partners.list({ type: "client" })).rejects.toThrow(/UNAUTHORIZED/i);
    await expect(caller.invoices.list()).rejects.toThrow(/UNAUTHORIZED/i);
  });

  it("scopes partners.list to the signed-in user", async () => {
    vi.mocked(q.listPartners).mockResolvedValueOnce([]);
    const caller = makeCaller(signedIn);
    await expect(caller.partners.list({ type: "client" })).resolves.toEqual([]);
    expect(q.listPartners).toHaveBeenCalledWith("u1", "client");
  });

  it("rejects an unbalanced journal entry", async () => {
    // isBalanced est mocké à true pour les autres tests : on rétablit ici la
    // vraie vérification d'équilibre.
    const { isBalanced } = await import("./services/accounting");
    vi.mocked(isBalanced).mockImplementationOnce((lines) => {
      const d = lines.reduce((s, l) => s + l.debit, 0);
      const c = lines.reduce((s, l) => s + l.credit, 0);
      return d === c && d > 0;
    });
    const caller = makeCaller(signedIn);
    await expect(
      caller.accounting.createEntry({
        entryDate: "2026-11-22",
        journal: "OD",
        label: "Test déséquilibré",
        lines: [
          { accountCode: "411", debit: 1000, credit: 0 },
          { accountCode: "701", debit: 0, credit: 900 },
        ],
      }),
    ).rejects.toThrow(/déséquilibrée/i);
  });

  it("exposes the full ERP surface and no files.list", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("invoices.list");
    expect(procedures).toContain("payroll.create");
    expect(procedures).toContain("accounting.balanceSheet");
    expect(procedures).toContain("accounting.incomeStatement");
    expect(procedures).toContain("tax.cnss");
    expect(procedures).toContain("tax.annualFiling");
    expect(procedures).toContain("stock.alerts");
    expect(procedures).toContain("files.remove");
    expect(procedures).not.toContain("files.list");
  });

  it("files.uploadUrl requires a session and passes no ownerId to storagePutUrl", async () => {
    vi.mocked(storagePutUrl).mockResolvedValueOnce({ uploadUrl: "https://u", publicPath: "/app-storage/k" });
    const caller = makeCaller(signedIn);

    await caller.files.uploadUrl({ name: "a.png", contentType: "image/png" });

    const third = vi.mocked(storagePutUrl).mock.calls.at(-1)?.[2];
    expect(third === undefined || !("ownerId" in third)).toBe(true);
  });
});
