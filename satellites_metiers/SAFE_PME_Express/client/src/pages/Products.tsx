import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Table } from "@/components/primitives";
import { parseTND } from "../../../shared/fiscal";
import { ExportBar } from "@/components/ExportBar";
import type { Column } from "@/lib/io";

type Product = {
  id: string;
  reference: string;
  name: string;
  kind: string;
  unit: string;
  priceHt: number;
  vatRate: number;
  accountCode: string;
  stockQty: number;
};

const productColumns: Column<Product>[] = [
  { key: "ref", label: "Référence", value: (p) => p.reference },
  { key: "name", label: "Désignation", value: (p) => p.name },
  { key: "kind", label: "Type", value: (p) => (p.kind === "service" ? "Service" : "Produit") },
  { key: "unit", label: "Unité", value: (p) => p.unit },
  { key: "price", label: "Prix HT", value: (p) => p.priceHt / 1000, display: (p) => (p.priceHt / 1000).toFixed(3) },
  { key: "vat", label: "TVA", value: (p) => p.vatRate },
  { key: "account", label: "Compte", value: (p) => p.accountCode },
  { key: "stock", label: "Stock", value: (p) => p.stockQty },
];

export default function Products() {
  const utils = trpc.useUtils();
  const list = trpc.products.list.useQuery();
  const importProducts = trpc.import.products.useMutation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const create = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setOpen(false);
    },
  });

  const [form, setForm] = useState({
    reference: "",
    name: "",
    kind: "produit",
    unit: "U",
    price: "",
    vatRate: 19,
    accountCode: "701",
    stockQty: 0,
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.reference.toLowerCase().includes(q.toLowerCase()),
    );
  }, [list.data, q]);

  function submit() {
    if (!form.name.trim() || !form.reference.trim()) return;
    create.mutate({
      reference: form.reference,
      name: form.name,
      kind: form.kind as "produit" | "service",
      unit: form.unit,
      priceHt: parseTND(form.price),
      vatRate: form.vatRate,
      accountCode: form.accountCode,
      stockQty: form.stockQty,
    });
    setForm({ reference: "", name: "", kind: "produit", unit: "U", price: "", vatRate: 19, accountCode: "701", stockQty: 0 });
  }

  return (
    <>
      <PageHeader
        title="Articles & services"
        subtitle="Catalogue, prix HT et taux de TVA"
        actions={
          <button className="erp-btn-gold" onClick={() => setOpen(true)}>
            + Nouvel article
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="erp-input max-w-xs"
          placeholder="Rechercher une référence ou une désignation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="ml-auto text-[12px] text-muted-foreground">{rows.length} article(s)</span>
      </div>

      <div className="mb-3">
        <ExportBar
          rows={rows}
          basename="articles"
          title="Catalogue articles & services"
          subtitle="ERP Tunisie — Articles"
          columns={productColumns}
          templateHeaders={["Référence", "Désignation", "Type", "Unité", "Prix HT", "TVA", "Compte", "Stock"]}
          onImport={async (r) => {
            const res = await importProducts.mutateAsync({ rows: r });
            utils.products.list.invalidate();
            return res;
          }}
        />
      </div>

      <Panel noPad>
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="▢"
            title="Catalogue vide"
            description="Ajoutez vos produits et services avec leur prix HT et leur taux de TVA (19 %, 13 %, 7 % ou 0 %) pour les retrouver dans vos factures."
            action={
              <button className="erp-btn-gold" onClick={() => setOpen(true)}>
                Créer un article
              </button>
            }
          />
        ) : (
          <Table head={["Référence", "Désignation", "Type", "Unité", "Prix HT", "TVA", "Compte", "Stock"]}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12px]">{p.reference}</td>
                <td className="font-medium">{p.name}</td>
                <td>
                  <Badge tone={p.kind === "service" ? "info" : "muted"}>
                    {p.kind === "service" ? "Service" : "Produit"}
                  </Badge>
                </td>
                <td className="text-muted-foreground">{p.unit}</td>
                <td className="text-right"><Money value={p.priceHt} /></td>
                <td className="text-right">{p.vatRate} %</td>
                <td className="font-mono text-[12px] text-muted-foreground">{p.accountCode}</td>
                <td className="text-right">{p.stockQty}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvel article" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Référence">
            <input className="erp-input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="ART-001" />
          </Field>
          <Field label="Désignation">
            <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prestation de conseil" />
          </Field>
          <Field label="Type">
            <select className="erp-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="produit">Produit</option>
              <option value="service">Service</option>
            </select>
          </Field>
          <Field label="Unité">
            <input className="erp-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="U, kg, h…" />
          </Field>
          <Field label="Prix HT (TND)">
            <input className="erp-input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.000" />
          </Field>
          <Field label="Taux de TVA">
            <select className="erp-select" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}>
              <option value={19}>19 % — taux normal</option>
              <option value={13}>13 % — taux intermédiaire</option>
              <option value={7}>7 % — taux réduit</option>
              <option value={0}>0 % — exonéré / export</option>
            </select>
          </Field>
          <Field label="Compte comptable" hint="Plan comptable tunisien">
            <input className="erp-input" value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} />
          </Field>
          <Field label="Stock initial">
            <input
              type="number"
              className="erp-input"
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) })}
            />
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
