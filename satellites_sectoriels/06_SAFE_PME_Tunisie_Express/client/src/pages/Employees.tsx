import { useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Table } from "@/components/primitives";
import { computePayslip, fmtTND, parseTND, todayISO } from "../../../shared/fiscal";
import { ExportBar } from "@/components/ExportBar";
import type { Column } from "@/lib/io";

type Employee = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  hireDate: string;
  baseSalary: number;
  allowances: number;
  maritalStatus: string;
  children: number;
  headOfFamily: boolean;
  status: string;
  cnssNumber: string | null;
};

const employeeColumns: Column<Employee>[] = [
  { key: "mat", label: "Matricule", value: (e) => e.matricule },
  { key: "first", label: "Prénom", value: (e) => e.firstName },
  { key: "last", label: "Nom", value: (e) => e.lastName },
  { key: "pos", label: "Poste", value: (e) => e.position },
  { key: "dep", label: "Service", value: (e) => e.department },
  { key: "hire", label: "Date d'embauche", value: (e) => e.hireDate },
  { key: "base", label: "Salaire de base", value: (e) => e.baseSalary / 1000, display: (e) => (e.baseSalary / 1000).toFixed(3) },
  { key: "allow", label: "Primes", value: (e) => e.allowances / 1000, display: (e) => (e.allowances / 1000).toFixed(3) },
  { key: "sit", label: "Situation", value: (e) => (e.maritalStatus === "marie" ? "Marié(e)" : "Célibataire") },
  { key: "kids", label: "Enfants", value: (e) => e.children },
  { key: "head", label: "Chef de famille", value: (e) => (e.headOfFamily ? "Oui" : "Non") },
  { key: "cnss", label: "N° CNSS", value: (e) => e.cnssNumber ?? "" },
];

export default function Employees() {
  const utils = trpc.useUtils();
  const list = trpc.employees.list.useQuery();
  const importEmployees = trpc.import.employees.useMutation();
  const [open, setOpen] = useState(false);

  const create = trpc.employees.create.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      utils.payroll.list.invalidate();
      setOpen(false);
    },
  });

  const [form, setForm] = useState({
    matricule: "",
    firstName: "",
    lastName: "",
    position: "",
    department: "Administration",
    hireDate: todayISO(),
    base: "",
    allowances: "",
    maritalStatus: "celibataire",
    children: 0,
    headOfFamily: false,
    cnssNumber: "",
  });

  const preview = computePayslip({
    baseSalary: parseTND(form.base),
    allowances: parseTND(form.allowances),
    headOfFamily: form.headOfFamily,
    children: Number(form.children),
  });

  function submit() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.matricule.trim()) return;
    create.mutate({
      matricule: form.matricule,
      firstName: form.firstName,
      lastName: form.lastName,
      position: form.position,
      department: form.department,
      hireDate: form.hireDate,
      baseSalary: parseTND(form.base),
      allowances: parseTND(form.allowances),
      maritalStatus: form.maritalStatus as "celibataire" | "marie",
      children: Number(form.children),
      headOfFamily: form.headOfFamily,
      cnssNumber: form.cnssNumber || undefined,
    });
    setForm({
      matricule: "",
      firstName: "",
      lastName: "",
      position: "",
      department: "Administration",
      hireDate: todayISO(),
      base: "",
      allowances: "",
      maritalStatus: "celibataire",
      children: 0,
      headOfFamily: false,
      cnssNumber: "",
    });
  }

  return (
    <>
      <PageHeader
        title="Salariés"
        subtitle="Dossiers du personnel, situation familiale et salaires de base"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Nouveau salarié
          </button>
        }
      />

      <div className="mb-3">
        <ExportBar
          rows={list.data ?? []}
          basename="salaries"
          title="Dossiers du personnel"
          subtitle="ERP Tunisie — Salariés"
          columns={employeeColumns}
          templateHeaders={["Matricule", "Prénom", "Nom", "Poste", "Service", "Date d'embauche", "Salaire de base", "Primes", "Situation", "Enfants", "Chef de famille", "N° CNSS"]}
          onImport={async (r) => {
            const res = await importEmployees.mutateAsync({ rows: r });
            utils.employees.list.invalidate();
            return res;
          }}
        />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon="◔"
            title="Aucun salarié enregistré"
            description="Créez les dossiers de vos salariés : le salaire de base, les primes et la situation de famille servent au calcul de la CNSS, de la CSS et de l'IRPP."
            action={
              <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                Créer un dossier
              </button>
            }
          />
        ) : (
          <Table head={["Matricule", "Nom & prénom", "Poste", "Service", "Embauche", "Salaire de base", "Primes", "Situation", "Statut"]}>
            {(list.data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="font-mono text-[12px]">{e.matricule}</td>
                <td className="font-medium">
                  {e.lastName.toUpperCase()} {e.firstName}
                </td>
                <td className="text-muted-foreground">{e.position || "—"}</td>
                <td className="text-muted-foreground">{e.department}</td>
                <td className="text-muted-foreground">{new Date(e.hireDate).toLocaleDateString("fr-FR")}</td>
                <td className="text-right"><Money value={e.baseSalary} /></td>
                <td className="text-right"><Money value={e.allowances} zeroDash /></td>
                <td className="text-[12px] text-muted-foreground">
                  {e.maritalStatus === "marie" ? "Marié(e)" : "Célibataire"}
                  {e.children > 0 ? ` · ${e.children} enf.` : ""}
                  {e.headOfFamily ? " · CF" : ""}
                </td>
                <td>
                  <Badge tone={e.status === "actif" ? "success" : "muted"}>{e.status === "actif" ? "Actif" : "Sorti"}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau salarié" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Matricule">
            <input className="erp-input" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder="EMP-001" />
          </Field>
          <Field label="N° CNSS">
            <input className="erp-input" value={form.cnssNumber} onChange={(e) => setForm({ ...form, cnssNumber: e.target.value })} placeholder="0000000000" />
          </Field>
          <Field label="Prénom">
            <input className="erp-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className="erp-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
          <Field label="Poste">
            <input className="erp-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Comptable" />
          </Field>
          <Field label="Service">
            <input className="erp-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </Field>
          <Field label="Date d'embauche">
            <input type="date" className="erp-input" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
          </Field>
          <Field label="Situation familiale">
            <select className="erp-select" value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
              <option value="celibataire">Célibataire</option>
              <option value="marie">Marié(e)</option>
            </select>
          </Field>
          <Field label="Salaire de base mensuel (TND)">
            <input className="erp-input" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Primes mensuelles (TND)">
            <input className="erp-input" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Personnes à charge">
            <input
              type="number"
              className="erp-input"
              value={form.children}
              onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.headOfFamily}
              onChange={(e) => setForm({ ...form, headOfFamily: e.target.checked })}
              className="size-4 accent-[hsl(45_65%_47%)]"
            />
            Chef de famille (abattement 300 TND/an)
          </label>
        </div>

        <div className="mt-4 rounded-lg bg-secondary/60 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Simulation du bulletin
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-3">
            {[
              ["Brut", preview.gross],
              ["CNSS 9,68 %", preview.cnssEmployee],
              ["CSS 0,5 %", preview.css],
              ["Base imposable", preview.taxableBase],
              ["IRPP", preview.irpp],
              ["Net à payer", preview.net],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="num font-medium">{fmtTND(value as number)}</span>
              </div>
            ))}
          </div>
        </div>

        {create.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{create.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </Modal>
    </>
  );
}
