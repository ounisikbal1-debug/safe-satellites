import { Link, useLocation } from "wouter";
import { trpc } from "@/_core/trpc";
import { cn } from "@/lib/utils";
import { fmtTND } from "../../../shared/fiscal";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import * as React from "react";

const NAV = [
  { group: "Pilotage", items: [{ href: "/", label: "Tableau de bord", icon: "◈" }] },
  {
    group: "Commerce",
    items: [
      { href: "/factures", label: "Factures clients", icon: "▤" },
      { href: "/achats", label: "Achats fournisseurs", icon: "▥" },
      { href: "/tiers", label: "Tiers", icon: "◍" },
      { href: "/articles", label: "Articles & services", icon: "▢" },
    ],
  },
  {
    group: "Ressources humaines",
    items: [
      { href: "/paie", label: "Paie & bulletins", icon: "◫" },
      { href: "/salaries", label: "Salariés", icon: "◔" },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/comptabilite", label: "Comptabilité", icon: "▦" },
      { href: "/tva", label: "TVA", icon: "◈" },
      { href: "/fiscalite", label: "Fiscalité", icon: "◈" },
      { href: "/immobilisations", label: "Immobilisations", icon: "▧" },
      { href: "/tresorerie", label: "Trésorerie", icon: "◉" },
    ],
  },
  { group: "Configuration", items: [{ href: "/parametres", label: "Paramètres", icon: "⚙" }] },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const company = trpc.company.get.useQuery();
  const dash = trpc.dashboard.get.useQuery();
  const { canInstall, installed, install } = useInstallPrompt();

  const sidebar = (
    <div className="flex h-full flex-col bg-navy text-[hsl(40_25%_88%)]">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-gold text-[15px] font-bold text-navy">
          ت
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">ERP Tunisie</p>
          <p className="truncate text-[10.5px] tracking-wide text-white/50">Gestion & Fiscalité</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              {g.group}
            </p>
            {g.items.map((it) => {
              const active = location === it.href || (it.href !== "/" && location.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition",
                    active
                      ? "bg-gold/15 font-semibold text-gold"
                      : "text-white/70 hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  <span className={cn("w-3.5 text-center text-[11px]", active ? "text-gold" : "text-white/40")}>
                    {it.icon}
                  </span>
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <p className="text-[10px] uppercase tracking-widest text-white/35">Trésorerie</p>
        <p className="num mt-1 text-[14px] font-semibold text-gold">
          {dash.data ? fmtTND(dash.data.cash) : "—"}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-white/40">{company.data?.name ?? "…"}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="no-print sticky top-0 hidden h-screen w-[232px] shrink-0 lg:block">{sidebar}</aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[250px]">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-md lg:px-6">
          <button
            className="flex size-8 items-center justify-center rounded-md border border-border lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-foreground">{company.data?.name ?? "…"}</p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              MF {company.data?.matriculeFiscal ?? "—"} · Exercice {company.data?.fiscalYear ?? "—"}
            </p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="erp-chip bg-gold-soft text-[hsl(38_72%_30%)]">
              TVA {dash.data ? fmtTND(dash.data.vatDue) : "—"}
            </span>
            <span className="erp-chip bg-secondary text-muted-foreground">TND</span>
            {canInstall && (
              <button
                onClick={install}
                className="erp-btn-ghost h-8 gap-1.5 px-2.5 text-[11.5px]"
                title="Installer l'ERP sur cet ordinateur"
              >
                ⤓ Installer
              </button>
            )}
            {installed && (
              <span className="erp-chip bg-success-soft text-success" title="Application installée">
                Installée
              </span>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-6">{children}</main>

        <footer className="no-print border-t border-border px-4 py-3 text-[11px] text-muted-foreground lg:px-6">
          ERP Tunisie — barème IRPP 8 tranches (0 % → 40 %) · CNSS 9,68 % / 17,07 % · CSS 0,5 % · TVA 19/13/7/0 %
        </footer>
      </div>
    </div>
  );
}
