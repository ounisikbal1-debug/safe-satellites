// ── Graphiques interactifs (SVG natif, aucune dépendance) ────────────────────
// Chaque graphique est piloté par les données réelles de l'ERP et réagit au
// survol : infobulle, mise en évidence, valeurs au millime.
import { useMemo, useState } from "react";
import { fmtTND } from "../../../shared/fiscal";

const GOLD = "hsl(43 65% 47%)";
const NAVY = "hsl(215 55% 18%)";
const INFO = "hsl(205 70% 45%)";
const DANGER = "hsl(0 65% 50%)";
const SUCCESS = "hsl(152 55% 36%)";

/** Largeur de référence du viewBox : assez large pour que le SVG ne soit pas
 *  écrasé quand il est étiré sur toute la largeur d'un panneau. */
const VBW = 620;

/** Montant compact pour les axes : 1,2 M / 340 k / 850. */
function axisMoney(millimes: number): string {
  const v = millimes / 1000;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} k`;
  return String(Math.round(v));
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

// ── Barres groupées (ventes vs achats par mois) ──────────────────────────────
export function GroupedBars({
  data,
  height = 220,
  series = [
    { key: "a", label: "Ventes", color: GOLD },
    { key: "b", label: "Achats", color: INFO },
  ],
}: {
  data: { label: string; a: number; b: number }[];
  height?: number;
  series?: { key: string; label: string; color: string }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.a, d.b])));
  const padL = 62;
  const padB = 26;
  const padT = 10;
  const w = VBW - padL;
  const innerH = height - padB - padT;
  const slot = data.length > 0 ? w / data.length : w;
  const barW = Math.min(slot * 0.3, 26);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${VBW} ${height}`} className="w-full" style={{ height }} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} x2={w + padL} y1={y} y2={y} stroke="hsl(215 25% 90%)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="hsl(215 15% 50%)">
                {axisMoney(Math.round(max * f))}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x0 = padL + i * slot;
          const ha = (d.a / max) * innerH;
          const hb = (d.b / max) * innerH;
          const active = hover === i;
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={x0} y={padT} width={slot} height={innerH} fill={active ? "hsl(215 40% 96%)" : "transparent"} />
              <rect
                x={x0 + slot / 2 - barW - 2}
                y={padT + innerH - ha}
                width={barW}
                height={Math.max(ha, 2)}
                rx="2"
                fill={GOLD}
                opacity={hover === null || active ? 1 : 0.45}
              />
              <rect
                x={x0 + slot / 2 + 2}
                y={padT + innerH - hb}
                width={barW}
                height={Math.max(hb, 2)}
                rx="2"
                fill={INFO}
                opacity={hover === null || active ? 1 : 0.45}
              />
              <text x={x0 + slot / 2} y={height - 7} textAnchor="middle" fontSize="11" fill="hsl(215 15% 45%)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="mb-0.5 font-semibold text-navy">{data[hover].label}</p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: GOLD }} />
            Ventes <span className="num ml-auto font-medium">{fmtTND(data[hover].a)}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: INFO }} />
            Achats <span className="num ml-auto font-medium">{fmtTND(data[hover].b)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Donut interactif (répartition) ───────────────────────────────────────────
export function Donut({
  data,
  size = 168,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const palette = [GOLD, INFO, NAVY, SUCCESS, DANGER, "hsl(280 45% 55%)", "hsl(20 70% 55%)"];

  const arcs = useMemo(() => {
    let acc = 0;
    const r = 42;
    const c = 2 * Math.PI * r;
    return data.map((d, i) => {
      const frac = total > 0 ? d.value / total : 0;
      const arc = { ...d, frac, offset: acc, color: d.color ?? palette[i % palette.length] };
      acc += frac;
      return { ...arc, c, r };
    });
  }, [data, total]);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(215 25% 93%)" strokeWidth="13" />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={a.color}
              strokeWidth={hover === i ? 16 : 13}
              strokeDasharray={`${a.frac * a.c} ${a.c}`}
              strokeDashoffset={-a.offset * a.c}
              style={{ transition: "stroke-width 120ms", cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {hover !== null ? data[hover].label : centerLabel}
          </span>
          <span className="num text-[15px] font-semibold text-navy">
            {hover !== null ? axisMoney(data[hover].value) : centerValue}
          </span>
        </div>
      </div>
      <ul className="min-w-[130px] flex-1 space-y-1.5">
        {arcs.map((a, i) => (
          <li
            key={i}
            className="flex items-center gap-2 text-[11.5px]"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: a.color }} />
            <span className="truncate text-muted-foreground">{a.label}</span>
            <span className="num ml-auto font-medium">{(a.frac * 100).toFixed(1)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Courbe (évolution) ───────────────────────────────────────────────────────
export function LineChart({
  data,
  height = 200,
  color = GOLD,
  label = "Montant",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const padL = 62;
  const padB = 24;
  const padT = 12;
  const w = VBW - padL;
  const innerH = height - padB - padT;
  const step = data.length > 1 ? w / (data.length - 1) : w;

  const pts = data.map((d, i) => ({
    x: padL + i * step,
    y: padT + innerH - (d.value / max) * innerH,
    ...d,
  }));

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = pts.length > 0 ? `${path} L${pts[pts.length - 1].x},${padT + innerH} L${pts[0].x},${padT + innerH} Z` : "";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VBW} ${height}`} className="w-full" style={{ height }} role="img">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = padT + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} x2={w + padL} y1={y} y2={y} stroke="hsl(215 25% 90%)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="hsl(215 15% 50%)">
                {axisMoney(Math.round(max * f))}
              </text>
            </g>
          );
        })}
        {area && <path d={area} fill="url(#lineFill)" />}
        {path && <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            <rect x={p.x - step / 2} y={padT} width={step} height={innerH} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill="#fff" stroke={color} strokeWidth="2" />
            <text x={p.x} y={height - 7} textAnchor="middle" fontSize="11" fill="hsl(215 15% 45%)">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      {hover !== null && pts[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold text-navy">{pts[hover].label}</p>
          <p className="text-muted-foreground">
            {label} <span className="num font-medium text-foreground">{fmtTND(pts[hover].value)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Barres horizontales (classement) ─────────────────────────────────────────
export function HBars({
  data,
  color = GOLD,
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="num shrink-0 font-medium">{fmtTND(d.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-300 group-hover:opacity-80"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
