// Script de développement : crée un compte de démonstration et charge les
// 900 enregistrements répartis sur les 12 mois. Exécution : pnpm tsx scripts/seed-demo.ts
import { db } from "../server/_core/db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { registerLocalUser } from "../server/_core/auth";
import { seedDemoData } from "../server/services/seed";

const EMAIL = "demo@erp-tunisie.tn";
const PASSWORD = "Demo2026!";

async function main() {
  let [user] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!user) {
    const created = await registerLocalUser(EMAIL, PASSWORD, "Compte de démonstration");
    [user] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
    console.log("Compte créé :", created?.email ?? EMAIL);
  } else {
    console.log("Compte existant :", user.email);
  }

  const year = new Date().getFullYear();
  const result = await seedDemoData(user.id, year, true);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
