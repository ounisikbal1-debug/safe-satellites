// Génère un dump SQL (INSERT) de toutes les tables métier, pour livraison.
// Usage : node scripts/dump-sql.mjs > seed-data.sql
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TABLES = [
  "users",
  "company",
  "partners",
  "products",
  "stock_movements",
  "invoices",
  "invoice_lines",
  "bills",
  "bill_lines",
  "employees",
  "payroll_runs",
  "payslips",
  "accounts",
  "journal_entries",
  "journal_lines",
  "assets",
  "bank_accounts",
  "bank_transactions",
  "tax_declarations",
  "transmissions",
];

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  await client.connect();
  const out = [];
  out.push("-- ERP Tunisie — jeu de données de démonstration (900 enregistrements)");
  out.push("-- Généré automatiquement. À exécuter APRÈS les migrations Drizzle.");
  out.push("-- psql \"$DATABASE_URL\" -f seed-data.sql");
  out.push("");
  out.push("BEGIN;");
  out.push("");

  for (const t of TABLES) {
    const { rows } = await client.query(`SELECT * FROM "${t}"`);
    if (!rows.length) {
      out.push(`-- ${t} : 0 ligne`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    out.push(`-- ${t} : ${rows.length} ligne(s)`);
    for (const r of rows) {
      const vals = cols.map((c) => lit(r[c])).join(", ");
      out.push(
        `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals}) ON CONFLICT DO NOTHING;`
      );
    }
    out.push("");
  }

  out.push("COMMIT;");
  console.log(out.join("\n"));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
