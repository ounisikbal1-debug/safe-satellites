import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, Panel, Table } from "@/components/primitives";
import { ExportBar } from "@/components/ExportBar";
import type { Column } from "@/lib/io";

type Partner = {
  id: string;
  code: string;
  name: string;
  matriculeFiscal: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  paymentTerms: number;
  type: string;
};

const partnerColumns: Column<Partner>[] = [
  { key: "code", label: "Code", value: (p) => p.code },
  { key: "name", label: "Raison sociale", value: (p) => p.name },
  { key: "mf", label: "Matricule fiscal", value: (p) => p.matriculeFiscal ?? "" },
  { key: "address", label: "Adresse", value: (p) => p.address ?? "" },
  { key: "email", label: "E-mail", value: (p) => p.email ?? "" },
  { key: "phone", label: "Téléphone", value: (p) => p.phone ?? "" },
  { key: "terms", label: "Délai (jours)", value: (p) => p.paymentTerms },
  { key: "type", label: "Type", value: (p) => (p.type === "client" ? "Client" : "Fournisseur") },
];

export default function Partners() {
  const utils = trpc.useUtils();
  const importPartners = trpc.import.partners.useMutation();
  const [type, setType] = useState<"client" | "fournisseur">("client");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = trpc.partners.list.useQuery({ type });
  const create = trpc.partners.create.useMutation({
    onSuccess: () => {
      utils.partners.list.invalidate();
      setOpen(false);
    },
  });

  const [form, setForm] = useState({
    code: "",
    name: "",
    matriculeFiscal: "",
    address: "",
    email: "",
    phone: "",
    paymentTerms: 30,
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()),
    );
  }, [list.data, q]);

  function submit() {
    if (!form.name.trim() || !form.code.trim()) return;
    create.mutate({ ...form, type, paymentTerms: Number(form.paymentTerms) });
    setForm({ code: "", name: "", matriculeFiscal: "", address: "", email: "", phone: "", paymentTerms: 30 });
  }

  return (
    <>
      <PageHeader
        title="Tiers"
        subtitle="Répertoire des clients et fournisseurs"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Nouveau {type}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {(["client", "fournisseur"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={
                type === t
                  ? "rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
                  : "rounded px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              }
            >
              {t === "client" ? "Clients" : "Fournisseurs"}
            </button>
          ))}
        </div>
        <input
          className="erp-input max-w-xs"
          placeholder="Rechercher par nom ou code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="ml-auto text-[12px] text-muted-foreground">{rows.length} fiche(s)</span>
      </div>

      <div className="mb-3">
        <ExportBar
          rows={rows}
          basename={type === "client" ? "clients" : "fournisseurs"}
          title={type === "client" ? "Répertoire clients" : "Répertoire fournisseurs"}
          subtitle="ERP Tunisie — Tiers"
          columns={partnerColumns}
          templateHeaders={["Code", "Raison sociale", "Matricule fiscal", "Adresse", "E-mail", "Téléphone", "Délai"]}
          onImport={async (r) => {
            const res = await importPartners.mutateAsync({ type, rows: r });
            utils.partners.list.invalidate();
            return res;
          }}
        />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="◍"
            title={type === "client" ? "Aucun client enregistré" : "Aucun fournisseur enregistré"}
            description={
              type === "client"
                ? "Créez vos clients avec leur matricule fiscal : il apparaîtra sur les factures et les déclarations."
                : "Créez vos fournisseurs pour saisir les factures d'achat et suivre la TVA déductible."
            }
            action={
              <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                Créer une fiche
              </button>
            }
          />
        ) : (
          <Table head={["Code", "Raison sociale", "Matricule fiscal", "Contact", "Délai", "Statut"]}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12px]">{p.code}</td>
                <td className="font-medium">{p.name}</td>
                <td className="font-mono text-[12px] text-muted-foreground">{p.matriculeFiscal || "—"}</td>
                <td className="text-[12px] text-muted-foreground">
                  {p.phone || "—"}
                  {p.email ? ` · ${p.email}` : ""}
                </td>
                <td className="text-right">{p.paymentTerms} j</td>
                <td>
                  <Badge tone={p.type === "client" ? "info" : "gold"}>
                    {p.type === "client" ? "Client" : "Fournisseur"}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={`Nouveau ${type}`} wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code">
            <input className="erp-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CLI-001" />
          </Field>
          <Field label="Raison sociale">
            <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Société Exemple SARL" />
          </Field>
          <Field label="Matricule fiscal">
            <input className="erp-input" value={form.matriculeFiscal} onChange={(e) => setForm({ ...form, matriculeFiscal: e.target.value })} placeholder="1234567/A/M/000" />
          </Field>
          <Field label="Téléphone">
            <input className="erp-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+216 71 000 000" />
          </Field>
          <Field label="E-mail">
            <input className="erp-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@exemple.tn" />
          </Field>
          <Field label="Délai de paiement (jours)">
            <input
              type="number"
              className="erp-input"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: Number(e.target.value) })}
            />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <input className="erp-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rue, ville, code postal" />
          </Field>
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
