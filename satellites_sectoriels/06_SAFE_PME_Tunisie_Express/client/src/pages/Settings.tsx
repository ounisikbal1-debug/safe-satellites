import { useState, useEffect } from "react";
import { trpc } from "@/_core/trpc";
import { PageHeader, Panel, Table } from "@/components/primitives";
import {
  CNSS_EMPLOYEE_RATE,
  CNSS_EMPLOYER_RATE,
  CSS_RATE,
  IRPP_BRACKETS,
  IRPP_DEPENDENT_DEDUCTION,
  IRPP_HEAD_OF_FAMILY_DEDUCTION,
  IS_RATES,
  STAMP_DUTY,
  TCL_RATES_BP,
  WITHHOLDING_RATES,
  fmtTND,
} from "../../../shared/fiscal";

export default function Settings() {
  const utils = trpc.useUtils();
  const company = trpc.company.get.useQuery();
  const updateCompany = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.get.invalidate();
      setMessage({ type: "success", text: "Paramètres et taux SAFE ERP enregistrés avec succès !" });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (err) => {
      setMessage({ type: "error", text: "Erreur lors de l'enregistrement : " + err.message });
    }
  });

  const c = company.data;

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    matriculeFiscal: "",
    registreCommerce: "",
    address: "",
    phone: "",
    email: "",
    cnssNumber: "",
    vatRegime: "assujetti",
    taxRegime: "reel",
    isRate: 15,
    fiscalYear: 2026,
    tclRateBp: 10,
    vatRateStandard: 19,
    vatRateIntermediate: 13,
    vatRateReduced: 7,
    stampDutyMillimes: 1000,
    cnssEmployeeRateBp: 968,
    cnssEmployerRateBp: 1707,
    cssRateBp: 50,
    headOfFamilyDeduction: 300,
    dependentDeduction: 100,
    foprolosRateBp: 100,
    tfpRateBp: 100,
    currencyCode: "TND"
  });

  useEffect(() => {
    if (c) {
      setFormData({
        name: c.name || "",
        matriculeFiscal: c.matriculeFiscal || "",
        registreCommerce: c.registreCommerce || "",
        address: c.address || "",
        phone: c.phone || "",
        email: c.email || "",
        cnssNumber: c.cnssNumber || "",
        vatRegime: c.vatRegime || "assujetti",
        taxRegime: c.taxRegime || "reel",
        isRate: c.isRate || 15,
        fiscalYear: c.fiscalYear || 2026,
        tclRateBp: c.tclRateBp ?? 10,
        vatRateStandard: (c as any).vatRateStandard ?? 19,
        vatRateIntermediate: (c as any).vatRateIntermediate ?? 13,
        vatRateReduced: (c as any).vatRateReduced ?? 7,
        stampDutyMillimes: (c as any).stampDutyMillimes ?? 1000,
        cnssEmployeeRateBp: (c as any).cnssEmployeeRateBp ?? 968,
        cnssEmployerRateBp: (c as any).cnssEmployerRateBp ?? 1707,
        cssRateBp: (c as any).cssRateBp ?? 50,
        headOfFamilyDeduction: (c as any).headOfFamilyDeduction ?? 300,
        dependentDeduction: (c as any).dependentDeduction ?? 100,
        foprolosRateBp: (c as any).foprolosRateBp ?? 100,
        tfpRateBp: (c as any).tfpRateBp ?? 100,
        currencyCode: (c as any).currencyCode ?? "TND"
      });
    }
  }, [c]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompany.mutate(formData as any);
  };

  return (
    <>
      <PageHeader
        title="Paramètres Généraux & Taux SAFE ERP"
        subtitle="Identité légale, régime fiscal, taux de TVA, cotisations sociales CNSS et barèmes dynamiquement modifiables"
      />

      {message && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "16px",
          backgroundColor: message.type === "success" ? "rgba(22, 163, 74, 0.2)" : "rgba(220, 38, 38, 0.2)",
          border: 1px solid ,
          color: message.type === "success" ? "#4ade80" : "#f87171",
          fontWeight: 600,
          fontSize: "13.5px"
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Identité de la société */}
          <Panel title="Identité de la Société & Coordonnées (Éditable)" subtitle="Mentions portées sur les factures et bilans">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Raison sociale</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.name}
                  onChange={e => handleChange("name", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Matricule Fiscal</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.matriculeFiscal}
                  onChange={e => handleChange("matriculeFiscal", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Registre de Commerce</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.registreCommerce}
                  onChange={e => handleChange("registreCommerce", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">N° CNSS Employeur</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.cnssNumber}
                  onChange={e => handleChange("cnssNumber", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[12px] text-muted-foreground block mb-1">Adresse Siège</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.address}
                  onChange={e => handleChange("address", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Téléphone</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.phone}
                  onChange={e => handleChange("phone", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">E-mail officiel</label>
                <input
                  type="email"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.email}
                  onChange={e => handleChange("email", e.target.value)}
                />
              </div>
            </div>
          </Panel>

          {/* Régimes & Paramètres Fiscaux Modifiables */}
          <Panel title="Régimes & Taux Fiscaux (SAFE ERP)" subtitle="TVA, IS, TCL et Timbre fiscal configurables">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Régime TVA</label>
                <select
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.vatRegime}
                  onChange={e => handleChange("vatRegime", e.target.value)}
                >
                  <option value="assujetti">Assujetti standard</option>
                  <option value="exportateur">Exportateur total</option>
                  <option value="non_assujetti">Non assujetti</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Régime Fiscal</label>
                <select
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.taxRegime}
                  onChange={e => handleChange("taxRegime", e.target.value)}
                >
                  <option value="reel">Régime Réel</option>
                  <option value="forfaitaire">Régime Forfaitaire</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Taux IS (%)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.isRate}
                  onChange={e => handleChange("isRate", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Exercice Comptable</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.fiscalYear}
                  onChange={e => handleChange("fiscalYear", parseInt(e.target.value) || 2026)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">TVA Taux Normal (%)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.vatRateStandard}
                  onChange={e => handleChange("vatRateStandard", parseInt(e.target.value) || 19)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">TVA Intermédiaire (%)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.vatRateIntermediate}
                  onChange={e => handleChange("vatRateIntermediate", parseInt(e.target.value) || 13)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">TVA Taux Réduit (%)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.vatRateReduced}
                  onChange={e => handleChange("vatRateReduced", parseInt(e.target.value) || 7)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Timbre Fiscal (Millimes)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.stampDutyMillimes}
                  onChange={e => handleChange("stampDutyMillimes", parseInt(e.target.value) || 1000)}
                />
              </div>
            </div>
          </Panel>
        </div>

        {/* Taux Sociaux, Salariaux & Patronaux issus de SAFE ERP */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
          <Panel title="Taux Sociaux & Retenues (Paie SAFE ERP)" subtitle="Cotisations CNSS, CSS, TFP & FOPROLOS modifiables">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">CNSS Part Salariale (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={(formData.cnssEmployeeRateBp / 100).toFixed(2)}
                  onChange={e => handleChange("cnssEmployeeRateBp", Math.round(parseFloat(e.target.value) * 100) || 968)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">CNSS Part Patronale (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={(formData.cnssEmployerRateBp / 100).toFixed(2)}
                  onChange={e => handleChange("cnssEmployerRateBp", Math.round(parseFloat(e.target.value) * 100) || 1707)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">CSS Solidarité Sociale (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={(formData.cssRateBp / 100).toFixed(2)}
                  onChange={e => handleChange("cssRateBp", Math.round(parseFloat(e.target.value) * 100) || 50)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">TFP Taxe Formation Pro (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={(formData.tfpRateBp / 100).toFixed(2)}
                  onChange={e => handleChange("tfpRateBp", Math.round(parseFloat(e.target.value) * 100) || 100)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">FOPROLOS Logement Social (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={(formData.foprolosRateBp / 100).toFixed(2)}
                  onChange={e => handleChange("foprolosRateBp", Math.round(parseFloat(e.target.value) * 100) || 100)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Devise Principale</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.currencyCode}
                  onChange={e => handleChange("currencyCode", e.target.value)}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Déductions IRPP & Avantages Fiscaux" subtitle="Abattements annuels légaux (TND)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Abattement Chef de Famille (TND/an)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.headOfFamilyDeduction}
                  onChange={e => handleChange("headOfFamilyDeduction", parseInt(e.target.value) || 300)}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Abattement par Enfant à Charge (TND/an)</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-[13px]"
                  value={formData.dependentDeduction}
                  onChange={e => handleChange("dependentDeduction", parseInt(e.target.value) || 100)}
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex justify-end">
              <button
                type="submit"
                disabled={updateCompany.isPending}
                style={{
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  padding: "10px 24px",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                {updateCompany.isPending ? "Enregistrement en cours..." : "💾 Enregistrer Tous les Paramètres & Taux"}
              </button>
            </div>
          </Panel>
        </div>
      </form>

      <Panel title="Barème IRPP en Vigueur (Loi de Finances 2024-48)" subtitle="8 tranches progressives — 0 % à 40 %" className="mt-4" noPad>
        <Table head={["Tranche", "Bornes annuelles (TND)", "Taux marginal"]}>
          {IRPP_BRACKETS.map((b, i) => (
            <tr key={i}>
              <td className="text-muted-foreground">Tranche {i + 1}</td>
              <td>
                {b.from.toLocaleString("fr-FR")} — {b.to === null ? "au-delà" : b.to.toLocaleString("fr-FR")}
              </td>
              <td className="num text-right font-semibold text-gold">{b.rate} %</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
