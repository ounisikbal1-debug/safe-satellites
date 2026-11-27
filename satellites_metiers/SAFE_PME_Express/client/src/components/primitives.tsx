import * as React from "react";
import { cn } from "@/lib/utils";
import { fmtTND } from "../../../shared/fiscal";

// ── En-tête de page ──────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Carte ────────────────────────────────────────────────────────────────────
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  noPad,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPad?: boolean;
}) {
  return (
    <section className={cn("erp-card overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            {title && <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(noPad ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "gold" | "success" | "danger" | "info";
  icon?: React.ReactNode;
}) {
  const toneRing: Record<string, string> = {
    default: "text-foreground",
    gold: "text-gold",
    success: "text-success",
    danger: "text-destructive",
    info: "text-info",
  };
  return (
    <div className="erp-card relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <p className={cn("num mt-2 text-[22px] font-semibold leading-none tracking-tight", toneRing[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Badge de statut ──────────────────────────────────────────────────────────
const TONES: Record<string, string> = {
  muted: "bg-secondary text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-destructive",
  gold: "bg-gold-soft text-[hsl(38_72%_30%)]",
};

export function Badge({ tone = "muted", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={cn("erp-chip", TONES[tone] ?? TONES.muted)}>{children}</span>;
}

// ── État vide dessiné ────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
        {icon ?? "◇"}
      </div>
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

// ── Champ de formulaire ──────────────────────────────────────────────────────
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="erp-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

// ── Montant TND ──────────────────────────────────────────────────────────────
export function Money({
  value,
  className,
  bold,
  zeroDash,
}: {
  value: number | null | undefined;
  className?: string;
  bold?: boolean;
  zeroDash?: boolean;
}) {
  const v = value ?? 0;
  if (zeroDash && v === 0) return <span className={cn("num text-muted-foreground/60", className)}>—</span>;
  return (
    <span className={cn("num whitespace-nowrap text-right", bold && "font-semibold", v < 0 && "text-destructive", className)}>
      {fmtTND(v)}
    </span>
  );
}

// ── Barre de progression ─────────────────────────────────────────────────────
export function Meter({ value, max, tone = "gold" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full transition-all", tone === "gold" ? "bg-gold" : tone === "success" ? "bg-success" : "bg-info")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Graphique en barres (SVG, sans dépendance) ────────────────────────────────
export function BarChart({
  data,
  height = 180,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="w-full">
      <div className="flex items-end justify-around gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * (height - 30));
          return (
            <div key={i} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="num text-[10px] font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100">
                {fmtTND(d.value, false)}
              </span>
              <div
                className="w-full max-w-[64px] rounded-t-[3px] bg-gradient-to-t from-navy to-[hsl(215_45%_30%)] transition-all group-hover:from-gold group-hover:to-[hsl(45_70%_58%)]"
                style={{ height: h }}
                title={fmtTND(d.value)}
              />
              <span className="truncate text-[10.5px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modale ───────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4 backdrop-blur-sm sm:p-8">
      <div
        className={cn(
          "erp-card my-4 w-full animate-in fade-in-0 zoom-in-95",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Tableau dense ────────────────────────────────────────────────────────────
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="erp-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i > 0 && /Montant|Total|HT|TVA|TTC|Débit|Crédit|Solde|Brut|Net|Salaire|Valeur/i.test(h) ? "text-right" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-muted-foreground">
      <span className="size-3 animate-spin rounded-full border-2 border-border border-t-gold" />
      {label}
    </div>
  );
}
