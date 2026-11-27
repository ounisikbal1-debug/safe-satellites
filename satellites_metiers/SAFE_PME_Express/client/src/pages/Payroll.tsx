import * as XLSX from "xlsx";
import { useMemo, useRef, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import {
  CNSS_EMPLOYEE_RATE,
  IRPP_BRACKETS,
  computePayslip,
  currentPeriod,
  fmtTND,
  periodLabel,
} from "../../../shared/fiscal";

export interface PmePayrollInputs {
  fiscalBenefitType: "COMPLEMENTARY_RETIREMENT" | "RETIREMENT_SAVINGS" | "LIFE_INSURANCE";
  baseSalary: number;
  presenceBonus: number;
  transportBonus: number;
  isHeadOfFamily: boolean;
  childrenCount: number;
  dependentParents: number;
  complementaryRetirementRate: number;
}

export interface CustomPmePayrollRates {
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  workAccidentRate: number;
  foprolosRate: number;
  profExpensesRate: number;
  profExpensesMaxCap: number;
  headOfFamilyDeduction: number;
  childDeduction: number;
  parentDeduction: number;
  cssRate: number;
  employerInsuranceRate: number;
  assuranceDecesRate: number;
  assuranceInvaliditeRate: number;
  assuranceMaladieRate: number;
  irppBrackets: Array<{ min: number; max: number; rate: number }>;
}

const INITIAL_PME_INPUTS: PmePayrollInputs = {
  fiscalBenefitType: "COMPLEMENTARY_RETIREMENT",
  baseSalary: 4580.673,
  presenceBonus: 18.668,
  transportBonus: 93.216,
  isHeadOfFamily: false,
  childrenCount: 0,
  dependentParents: 0,
  complementaryRetirementRate: 4,
};

const DEFAULT_PME_RATES: CustomPmePayrollRates = {
  cnssEmployeeRate: 9.68,
  cnssEmployerRate: 16.57,
  workAccidentRate: 0.5,
  foprolosRate: 1.0,
  profExpensesRate: 10.0,
  profExpensesMaxCap: 2000.0,
  headOfFamilyDeduction: 300.0,
  childDeduction: 100.0,
  parentDeduction: 1750.0,
  cssRate: 0.5,
  employerInsuranceRate: 6.0,
  assuranceDecesRate: 0.5,
  assuranceInvaliditeRate: 0.78400752510838,
  assuranceMaladieRate: 0.48212520380679,
  irppBrackets: IRPP_BRACKETS.map((b) => ({
    min: b.from,
    max: b.to === null ? Infinity : b.to,
    rate: b.rate,
  })),
};

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

export interface PmePayrollResult {
  grossSalary: number;
  employeeCnss: number;
  taxableGross: number;
  fraisProfessionnels: number;
  chefDeFamille: number;
  enfantACharge: number;
  retirementBonusDeduction: number;
  netImposable: number;
  irpp: number;
  irppBeforeRetirementGain: number;
  css: number;
  cssBeforeRetirementGain: number;
  gainIrpp: number;
  gainCss: number;
  assuranceDeces: number;
  assuranceInvalidite: number;
  assuranceMaladie: number;
  employeeInsurance: number;
  totalImpots: number;
  totalGain: number;
  totalImpotsApresGains: number;
  intermediateNet: number;
  parentACharge: number;
  totalRetenue: number;
  netSalary: number;
  employerCnss: number;
  workAccident: number;
  foprolos: number;
  employerInsurance: number;
  totalAssurancesPatronales: number;
  totalEmployerCharges: number;
  totalCoutGlobal: number;
}

export function computePmePayslipFull(
  inputs: PmePayrollInputs,
  rates: CustomPmePayrollRates,
): PmePayrollResult {
  const grossSalary = round3(
    (Number(inputs.baseSalary) || 0) +
      (Number(inputs.presenceBonus) || 0) +
      (Number(inputs.transportBonus) || 0),
  );
  const employeeCnss = round3(grossSalary * (rates.cnssEmployeeRate / 100));
  const taxableGross = Math.max(0, round3(grossSalary - employeeCnss));
  const annualTaxableGross = taxableGross * 12;
  const annualProfExpenses = Math.min(
    annualTaxableGross * (rates.profExpensesRate / 100),
    rates.profExpensesMaxCap,
  );
  const annualFamilyDeductions =
    (inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0) +
    (Number(inputs.childrenCount) || 0) * rates.childDeduction;

  const benefitRate = Math.max(0, Number(inputs.complementaryRetirementRate) || 0);
  // Calcul de l’Avantage fiscal assis sur le Salaire Brut Total (Base + Primes) selon le contrat spécifique du salarié
  const retirementBonusDeduction = round3(grossSalary * (benefitRate / 100));

  const annualNetBeforeGain = Math.max(0, annualTaxableGross - annualProfExpenses - annualFamilyDeductions);
  const annualNetAfterGain = Math.max(0, annualNetBeforeGain - retirementBonusDeduction * 12);

  const calcAnnualIrpp = (annualNet: number) => {
    let total = 0;
    for (const b of rates.irppBrackets) {
      if (annualNet > b.min) {
        total += Math.max(0, Math.min(annualNet, b.max) - b.min) * (b.rate / 100);
      }
    }
    return total;
  };

  const irppBeforeRetirementGain = round3(calcAnnualIrpp(annualNetBeforeGain) / 12);
  const irpp = round3(calcAnnualIrpp(annualNetAfterGain) / 12);
  const cssBeforeRetirementGain = round3((annualNetBeforeGain * (rates.cssRate / 100)) / 12);
  const css = round3((annualNetAfterGain * (rates.cssRate / 100)) / 12);

  const gainIrpp = Math.max(0, round3(irppBeforeRetirementGain - irpp));
  const gainCss = Math.max(0, round3(cssBeforeRetirementGain - css));
  const totalImpots = round3(irppBeforeRetirementGain + cssBeforeRetirementGain);
  const totalGain = round3(gainIrpp + gainCss);
  const totalImpotsApresGains = round3(irpp + css);

  // 3 Assurances exclusivement patronales
  const assuranceDeces = round3(grossSalary * (rates.assuranceDecesRate / 100));
  const assuranceInvalidite = round3(grossSalary * (rates.assuranceInvaliditeRate / 100));
  const effectiveMaladieRate =
    rates.assuranceMaladieRate < 0.01 ? rates.assuranceMaladieRate * 100 : rates.assuranceMaladieRate;
  const assuranceMaladie = round3(grossSalary * (effectiveMaladieRate / 100));

  // Rubrique 10200 : Assurance Compl. Mutuelle Salariale = Taux de retraite complémentaire (%) * salaire brut
  const employeeInsurance = retirementBonusDeduction;
  const parentACharge = round3(((Number(inputs.dependentParents) || 0) * rates.parentDeduction) / 12);
  const intermediateNet = round3(grossSalary - employeeCnss - irpp - css);
  const totalRetenue = round3(employeeCnss + irpp + css + employeeInsurance + parentACharge);
  const netSalary = round3(grossSalary - totalRetenue);

  // Charges patronales
  const employerCnss = round3(grossSalary * (rates.cnssEmployerRate / 100));
  const workAccident = round3(grossSalary * (rates.workAccidentRate / 100));
  const foprolos = round3(grossSalary * (rates.foprolosRate / 100));
  const employerInsurance = round3(grossSalary * (rates.employerInsuranceRate / 100));
  const totalAssurancesPatronales = round3(assuranceDeces + assuranceInvalidite + assuranceMaladie);
  const totalEmployerCharges = round3(
    employerCnss + workAccident + foprolos + employerInsurance + totalAssurancesPatronales,
  );
  const totalCoutGlobal = round3(grossSalary + totalEmployerCharges);

  return {
    grossSalary,
    employeeCnss,
    taxableGross,
    fraisProfessionnels: round3(annualProfExpenses / 12),
    chefDeFamille: round3((inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0) / 12),
    enfantACharge: round3(((Number(inputs.childrenCount) || 0) * rates.childDeduction) / 12),
    retirementBonusDeduction,
    netImposable: round3(annualNetAfterGain / 12),
    irpp,
    irppBeforeRetirementGain,
    css,
    cssBeforeRetirementGain,
    gainIrpp,
    gainCss,
    assuranceDeces,
    assuranceInvalidite,
    assuranceMaladie,
    employeeInsurance,
    totalImpots,
    totalGain,
    totalImpotsApresGains,
    intermediateNet,
    parentACharge,
    totalRetenue,
    netSalary,
    employerCnss,
    workAccident,
    foprolos,
    employerInsurance,
    totalAssurancesPatronales,
    totalEmployerCharges,
    totalCoutGlobal,
  };
}

export interface PmeMultiEmployeeRecord {
  id: string;
  matricule: string;
  employeeName: string;
  department: string;
  position: string;
  inputs: PmePayrollInputs;
  result: PmePayrollResult;
}

const SAMPLE_PME_EMPLOYEES_RAW: Array<{
  matricule: string;
  employeeName: string;
  department: string;
  position: string;
  inputs: PmePayrollInputs;
}> = [
  {
    matricule: "MAT-001",
    employeeName: "Amine Ben Ali",
    department: "Direction Financière",
    position: "Directeur Administratif et Financier",
    inputs: {
      fiscalBenefitType: "COMPLEMENTARY_RETIREMENT",
      baseSalary: 4580.673,
      presenceBonus: 18.668,
      transportBonus: 93.216,
      isHeadOfFamily: false,
      childrenCount: 0,
      dependentParents: 0,
      complementaryRetirementRate: 4,
    },
  },
  {
    matricule: "MAT-002",
    employeeName: "Salma Trabelsi",
    department: "Ressources Humaines",
    position: "Responsable RH",
    inputs: {
      fiscalBenefitType: "COMPLEMENTARY_RETIREMENT",
      baseSalary: 2800.0,
      presenceBonus: 50.0,
      transportBonus: 100.0,
      isHeadOfFamily: true,
      childrenCount: 2,
      dependentParents: 0,
      complementaryRetirementRate: 4,
    },
  },
  {
    matricule: "MAT-003",
    employeeName: "Karim Gharbi",
    department: "Département IT",
    position: "Ingénieur Logiciel",
    inputs: {
      fiscalBenefitType: "RETIREMENT_SAVINGS",
      baseSalary: 3200.0,
      presenceBonus: 30.0,
      transportBonus: 80.0,
      isHeadOfFamily: false,
      childrenCount: 0,
      dependentParents: 1,
      complementaryRetirementRate: 5,
    },
  },
  {
    matricule: "MAT-004",
    employeeName: "Nadia Jaziri",
    department: "Commercial",
    position: "Chargée d'Affaires",
    inputs: {
      fiscalBenefitType: "COMPLEMENTARY_RETIREMENT",
      baseSalary: 1950.0,
      presenceBonus: 20.0,
      transportBonus: 60.0,
      isHeadOfFamily: true,
      childrenCount: 1,
      dependentParents: 0,
      complementaryRetirementRate: 0,
    },
  },
];

function loadSavedPmeRates(): CustomPmePayrollRates {
  try {
    const raw = window.localStorage.getItem("safe_pme_custom_rates_v1");
    if (!raw) return DEFAULT_PME_RATES;
    const parsed = JSON.parse(raw) as Partial<CustomPmePayrollRates>;
    const brackets =
      Array.isArray(parsed.irppBrackets) && parsed.irppBrackets.length > 0
        ? parsed.irppBrackets.map((b) => ({
            min: Number(b.min) || 0,
            max:
              b.max === null || b.max === undefined || !Number.isFinite(Number(b.max))
                ? Infinity
                : Number(b.max),
            rate: Number(b.rate) || 0,
          }))
        : DEFAULT_PME_RATES.irppBrackets;
    return {
      ...DEFAULT_PME_RATES,
      ...parsed,
      irppBrackets: brackets,
    };
  } catch {
    return DEFAULT_PME_RATES;
  }
}

const PAYROLL_DEADLINE_STORAGE_KEY = "safe_pme_payroll_deadline_v1";
const PAYROLL_VALIDATED_STORAGE_KEY = "safe_pme_payroll_validated_v1";
const MULTI_EMPLOYEES_STORAGE_KEY = "safe_pme_multi_employees_v1";
const DEFAULT_PAYROLL_DEADLINE = "2026-11-17";

function computeDaysRemaining(deadlineStr: string): number {
  if (!deadlineStr) return 0;
  const parts = deadlineStr.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function loadSavedPmeMultiEmployees(rates: CustomPmePayrollRates): PmeMultiEmployeeRecord[] {
  try {
    const raw = window.localStorage.getItem(MULTI_EMPLOYEES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((e: any, idx: number) => ({
          id: e.id || `pme-emp-${idx}`,
          matricule: e.matricule || `EMP-${idx + 1}`,
          employeeName: e.employeeName || "Salarié",
          department: e.department || "Général",
          position: e.position || "Collaborateur",
          inputs: e.inputs || INITIAL_PME_INPUTS,
          result: computePmePayslipFull(e.inputs || INITIAL_PME_INPUTS, rates),
        }));
      }
    }
  } catch {
    // Fallback
  }
  return SAMPLE_PME_EMPLOYEES_RAW.map((e, idx) => ({
    id: `pme-emp-${idx}`,
    ...e,
    result: computePmePayslipFull(e.inputs, rates),
  }));
}

export default function Payroll() {
  const utils = trpc.useUtils();
  const runs = trpc.payroll.runs.useQuery();
  const employees = trpc.employees.list.useQuery();
  const create = trpc.payroll.createRun.useMutation({
    onSuccess: (r) => {
      utils.payroll.runs.invalidate();
      setOpen(false);
      setSelected(r.id);
    },
  });
  const postOdEntry = trpc.accounting.createEntry.useMutation({
    onSuccess: () => {
      utils.accounting.entries.invalidate();
      utils.accounting.trialBalance.invalidate();
    },
  });

  const [activeTab, setActiveTab] = useState<"payslip" | "ratesSheet" | "multiEmployee" | "cycles">("payslip");
  const [inputs, setInputs] = useState<PmePayrollInputs>(INITIAL_PME_INPUTS);
  const [customRates, setCustomRates] = useState<CustomPmePayrollRates>(loadSavedPmeRates);
  const [savedNotice, setSavedNotice] = useState("");
  const printableSlipRef = useRef<HTMLElement | null>(null);

  const [payrollDeadline, setPayrollDeadline] = useState<string>(() => {
    try {
      return window.localStorage.getItem(PAYROLL_DEADLINE_STORAGE_KEY) || DEFAULT_PAYROLL_DEADLINE;
    } catch {
      return DEFAULT_PAYROLL_DEADLINE;
    }
  });
  // Pour la version de travail (Date limite = 17 novembre 2026) : salaires calculés d'office afin que l'Alerte soit à 0
  const [payrollValidated, setPayrollValidated] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(PAYROLL_VALIDATED_STORAGE_KEY);
      if (stored !== null) return stored === "true";
      return true; // Salaires calculés et validés par défaut => Alerte à 0
    } catch {
      return true;
    }
  });
  const [odSourceMode, setOdSourceMode] = useState<"multi" | "single">("multi");
  const [odStatusNotice, setOdStatusNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [multiEmployees, setMultiEmployees] = useState<PmeMultiEmployeeRecord[]>(() =>
    loadSavedPmeMultiEmployees(loadSavedPmeRates()),
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [multiSearchTerm, setMultiSearchTerm] = useState("");

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());

  const handleDeadlineChange = (newDeadline: string) => {
    setPayrollDeadline(newDeadline);
    setPayrollValidated(false);
    try {
      window.localStorage.setItem(PAYROLL_DEADLINE_STORAGE_KEY, newDeadline);
      window.localStorage.setItem(PAYROLL_VALIDATED_STORAGE_KEY, "false");
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(MULTI_EMPLOYEES_STORAGE_KEY, JSON.stringify(multiEmployees));
    } catch {
      // Ignore
    }
  }, [multiEmployees]);

  // Ajout automatique des salariés enregistrés dans le module RH (employees.list)
  useEffect(() => {
    const list = employees.data;
    if (!Array.isArray(list) || list.length === 0) return;
    setMultiEmployees((prev) => {
      let changed = false;
      const next = [...prev];
      for (const hrEmp of list) {
        if (!hrEmp.active) continue;
        const fullName = `${hrEmp.firstName} ${hrEmp.lastName}`.trim();
        const matricule = (hrEmp.matricule && hrEmp.matricule.trim()) || `HR-${hrEmp.id.slice(0, 6).toUpperCase()}`;
        const exists = next.some(
          (e) =>
            e.id === hrEmp.id ||
            e.matricule.toLowerCase() === matricule.toLowerCase() ||
            e.employeeName.trim().toLowerCase() === fullName.toLowerCase(),
        );
        if (exists) continue;
        changed = true;
        const empInputs: PmePayrollInputs = {
          fiscalBenefitType: "COMPLEMENTARY_RETIREMENT",
          baseSalary: round3(Number(hrEmp.baseSalary) || 0),
          presenceBonus: 0,
          transportBonus: 0,
          isHeadOfFamily: Boolean(hrEmp.headOfFamily),
          childrenCount: Number(hrEmp.children) || 0,
          dependentParents: 0,
          complementaryRetirementRate: 0,
        };
        next.push({
          id: hrEmp.id,
          matricule,
          employeeName: fullName,
          department: hrEmp.department || "Ressources Humaines",
          position: hrEmp.position || "Collaborateur",
          inputs: empInputs,
          result: computePmePayslipFull(empInputs, customRates),
        });
      }
      return changed ? next : prev;
    });
  }, [employees.data, customRates]);

  const result = useMemo(() => computePmePayslipFull(inputs, customRates), [inputs, customRates]);

  const multiTotals = useMemo(
    () =>
      multiEmployees.reduce(
        (acc, e) => {
          acc.count += 1;
          acc.totalGross = round3(acc.totalGross + e.result.grossSalary);
          acc.totalCnss = round3(acc.totalCnss + e.result.employeeCnss);
          acc.totalEmployerCnss = round3(acc.totalEmployerCnss + e.result.employerCnss);
          acc.totalWorkAccident = round3(acc.totalWorkAccident + e.result.workAccident);
          acc.totalFoprolos = round3(acc.totalFoprolos + e.result.foprolos);
          acc.totalInsuranceEmp = round3(acc.totalInsuranceEmp + e.result.employeeInsurance);
          acc.totalNetImp = round3(acc.totalNetImp + e.result.netImposable);
          acc.totalIrpp = round3(acc.totalIrpp + e.result.irpp);
          acc.totalCss = round3(acc.totalCss + e.result.css);
          acc.totalNet = round3(acc.totalNet + e.result.netSalary);
          acc.totalAssurances = round3(acc.totalAssurances + e.result.totalAssurancesPatronales);
          acc.totalEmployer = round3(acc.totalEmployer + e.result.totalEmployerCharges);
          acc.totalCoutGlobal = round3(acc.totalCoutGlobal + e.result.totalCoutGlobal);
          return acc;
        },
        {
          count: 0,
          totalGross: 0,
          totalCnss: 0,
          totalEmployerCnss: 0,
          totalWorkAccident: 0,
          totalFoprolos: 0,
          totalInsuranceEmp: 0,
          totalNetImp: 0,
          totalIrpp: 0,
          totalCss: 0,
          totalNet: 0,
          totalAssurances: 0,
          totalEmployer: 0,
          totalCoutGlobal: 0,
        },
      ),
    [multiEmployees],
  );

  const handleUpdateMultiEmployee = (empId: string, changes: Partial<PmePayrollInputs>) => {
    setMultiEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const updatedInputs = { ...emp.inputs, ...changes };
        return {
          ...emp,
          inputs: updatedInputs,
          result: computePmePayslipFull(updatedInputs, customRates),
        };
      }),
    );
  };

  const handleRecalculateMulti = () => {
    setMultiEmployees((prev) =>
      prev.map((emp) => ({
        ...emp,
        result: computePmePayslipFull(emp.inputs, customRates),
      })),
    );
    setPayrollValidated(true);
    try {
      window.localStorage.setItem(PAYROLL_VALIDATED_STORAGE_KEY, "true");
    } catch {
      // Ignore
    }
    setImportNotice({
      type: "success",
      message: `Paie recalculée et validée pour ${multiEmployees.length} salarié(s). Alerte remise à 0.`,
    });
  };

  const handleValidateAndCalculatePayroll = () => {
    handleRecalculateMulti();
    setActiveTab("payslip");
  };

  const rawDaysDiff = computeDaysRemaining(payrollDeadline);
  const alertDays = payrollValidated ? 0 : rawDaysDiff;

  const useMultiForOd = odSourceMode === "multi" && multiEmployees.length > 0;
  const odGross = round3(useMultiForOd ? multiTotals.totalGross : result.grossSalary);
  const odEmployerCharges = round3(useMultiForOd ? multiTotals.totalEmployer : result.totalEmployerCharges);
  const odCnssTotal = round3(
    useMultiForOd
      ? multiTotals.totalCnss + multiTotals.totalEmployerCnss + multiTotals.totalWorkAccident + multiTotals.totalFoprolos
      : result.employeeCnss + result.employerCnss + result.workAccident + result.foprolos,
  );
  const odEmployeeInsurance = round3(useMultiForOd ? multiTotals.totalInsuranceEmp : result.employeeInsurance);
  const odAssurancesPatronales = round3(useMultiForOd ? multiTotals.totalAssurances : result.totalAssurancesPatronales);
  const odAssurancesAndMutuelle = round3(odEmployeeInsurance + odAssurancesPatronales);
  const odIrpp = round3(useMultiForOd ? multiTotals.totalIrpp : result.irpp);
  const odCss = round3(useMultiForOd ? multiTotals.totalCss : result.css);
  const odTotalDebit = round3(odGross + odEmployerCharges);
  const odNetBalanced = round3(odTotalDebit - (odCnssTotal + odAssurancesAndMutuelle + odIrpp + odCss));
  const odTotalCredit = round3(odNetBalanced + odCnssTotal + odAssurancesAndMutuelle + odIrpp + odCss);

  const handlePostPayrollOd = async () => {
    setOdStatusNotice(null);
    const toMillimes = (v: number) => Math.round(v * 1000);
    const debitGrossM = toMillimes(odGross);
    const debitEmpM = toMillimes(odEmployerCharges);
    const totalDebitM = debitGrossM + debitEmpM;
    const cnssM = toMillimes(odCnssTotal);
    const assMutM = toMillimes(odAssurancesAndMutuelle);
    const irppM = toMillimes(odIrpp);
    const cssM = toMillimes(odCss);
    const netM = totalDebitM - (cnssM + assMutM + irppM + cssM);

    if (totalDebitM <= 0 || netM < 0) {
      setOdStatusNotice({ type: "error", message: "Montants OD invalides ou nuls." });
      return;
    }

    const lines: Array<{ accountCode: string; accountLabel: string; debit: number; credit: number }> = [
      { accountCode: "641", accountLabel: "Charges de personnel (Brut)", debit: debitGrossM, credit: 0 },
    ];
    if (debitEmpM > 0) {
      lines.push({
        accountCode: "645",
        accountLabel: `Charges sociales pat. & 3 Assurances (${odAssurancesPatronales.toFixed(3)} DT)`,
        debit: debitEmpM,
        credit: 0,
      });
    }
    if (netM > 0) {
      lines.push({ accountCode: "421", accountLabel: "Personnel — rémunérations dues", debit: 0, credit: netM });
    }
    if (cnssM > 0) {
      lines.push({ accountCode: "431", accountLabel: "CNSS (Salarié + Patronale + AT + FOPROLOS)", debit: 0, credit: cnssM });
    }
    if (assMutM > 0) {
      lines.push({
        accountCode: "431",
        accountLabel: `Mutuelle 10200 (${odEmployeeInsurance.toFixed(3)}) + 3 Assurances pat. (${odAssurancesPatronales.toFixed(3)})`,
        debit: 0,
        credit: assMutM,
      });
    }
    if (irppM > 0) {
      lines.push({ accountCode: "447", accountLabel: "Impôts sur les salaires (IRPP)", debit: 0, credit: irppM });
    }
    if (cssM > 0) {
      lines.push({ accountCode: "448", accountLabel: "État — CSS", debit: 0, credit: cssM });
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      await postOdEntry.mutateAsync({
        entryDate: today,
        journal: "PA",
        reference: `OD-PAIE-${period}`,
        label: `OD Paie ${period} (${useMultiForOd ? `${multiTotals.count} salariés` : "Bulletin"}) — Mutuelle 10200: ${odEmployeeInsurance.toFixed(3)} DT`,
        lines,
      });
      setOdStatusNotice({
        type: "success",
        message: `OD de Paie enregistrée dans le journal comptable (${odTotalDebit.toFixed(3)} DT).`,
      });
    } catch (err: any) {
      setOdStatusNotice({
        type: "error",
        message: err?.message || "Erreur lors de l'enregistrement de l'OD de Paie dans le journal comptable.",
      });
    }
  };

  const handleSelectEmployeeForPayslip = (emp: PmeMultiEmployeeRecord) => {
    setInputs({ ...emp.inputs });
    setActiveTab("payslip");
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportNotice(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let records: Array<{
        matricule: string;
        employeeName: string;
        department: string;
        position: string;
        inputs: PmePayrollInputs;
      }> = [];

      const parseBenefitType = (val: unknown): PmePayrollInputs["fiscalBenefitType"] => {
        const s = String(val ?? "").toUpperCase();
        if (s.includes("EPARGNE") || s.includes("SAVING")) return "RETIREMENT_SAVINGS";
        if (s.includes("VIE") || s.includes("LIFE")) return "LIFE_INSURANCE";
        return "COMPLEMENTARY_RETIREMENT";
      };

      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 1) {
          const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
          const headers = lines[0].split(sep).map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(sep).map((v) => v.replace(/^["']|["']$/g, "").trim());
            const r: Record<string, string> = {};
            headers.forEach((h, idx) => {
              r[h] = vals[idx] || "";
            });
            const rawRate = r.taux_retraite_complementaire ?? r.taux_avantage_fiscal ?? r.taux_retraite ?? r.taux_avantage;
            records.push({
              matricule: r.matricule || r.mat || r.code || `MAT-${i}`,
              employeeName: r.nom_prenom || r.salarie || r.nom || `Salarié ${i}`,
              department: r.departement || r.service || "Direction Générale",
              position: r.poste || "Collaborateur",
              inputs: {
                fiscalBenefitType: parseBenefitType(r.type_avantage_fiscal || r.avantage_fiscal),
                baseSalary: parseFloat(String(r.salaire_base || r.base || r.salaire || 2500).replace(",", ".")) || 2500,
                presenceBonus: parseFloat(String(r.prime_presence || r.presence || 0).replace(",", ".")) || 0,
                transportBonus: parseFloat(String(r.prime_transport || r.transport || 0).replace(",", ".")) || 0,
                isHeadOfFamily: ["1", "true", "oui", "vrai"].includes(String(r.chef_famille || "").toLowerCase()),
                childrenCount: parseInt(String(r.enfants_charge || r.enfants || 0), 10) || 0,
                dependentParents: Math.min(2, Math.max(0, parseInt(String(r.parents_charge || r.parents || 0), 10) || 0)),
                complementaryRetirementRate: rawRate !== undefined && rawRate !== "" ? Math.max(0, parseFloat(String(rawRate).replace(",", ".")) || 0) : 0,
              },
            });
          }
        }
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        records = json.map((r, i) => {
          const rawRate = r.Taux_Retraite_Complementaire ?? r.Taux_Avantage_Fiscal ?? r.taux_avantage_fiscal ?? r.Taux_Retraite;
          return {
            matricule: String(r.Matricule || r.matricule || r.Code || `MAT-${i + 1}`),
            employeeName: String(r.Nom_Prenom || r.Salarié || r.nom || r.Nom || `Salarié ${i + 1}`),
            department: String(r.Departement || r.departement || "Direction"),
            position: String(r.Poste || r.poste || "Collaborateur"),
            inputs: {
              fiscalBenefitType: parseBenefitType(r.Type_Avantage_Fiscal || r.Avantage_Fiscal),
              baseSalary: parseFloat(String(r.Salaire_Base || r.base || 3000).replace(",", ".")) || 3000,
              presenceBonus: parseFloat(String(r.Prime_Presence || 0).replace(",", ".")) || 0,
              transportBonus: parseFloat(String(r.Prime_Transport || 0).replace(",", ".")) || 0,
              isHeadOfFamily: ["oui", "true", "1"].includes(String(r.Chef_Famille || "").toLowerCase()),
              childrenCount: parseInt(String(r.Enfants_Charge || 0), 10) || 0,
              dependentParents: Math.min(2, Math.max(0, parseInt(String(r.Parents_Charge || 0), 10) || 0)),
              complementaryRetirementRate: rawRate !== undefined && rawRate !== "" ? Math.max(0, parseFloat(String(rawRate).replace(",", ".")) || 0) : 0,
            },
          };
        });
      }

      if (records.length === 0) throw new Error("Aucun enregistrement valide n'a été trouvé.");
      const computed: PmeMultiEmployeeRecord[] = records.map((rec, idx) => ({
        id: `pme-imp-${Date.now()}-${idx}`,
        ...rec,
        result: computePmePayslipFull(rec.inputs, customRates),
      }));
      setMultiEmployees(computed);
      setActiveTab("multiEmployee");
      setImportNotice({
        type: "success",
        message: `Import réussi : ${computed.length} salarié(s) importé(s) et calculés individuellement.`,
      });
    } catch (err: any) {
      setImportNotice({ type: "error", message: err.message || "Erreur d'importation." });
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  const downloadPmeTemplateExcel = () => {
    const rows = SAMPLE_PME_EMPLOYEES_RAW.map((emp) => ({
      Matricule: emp.matricule,
      Nom_Prenom: emp.employeeName,
      Departement: emp.department,
      Poste: emp.position,
      Salaire_Base: emp.inputs.baseSalary,
      Prime_Presence: emp.inputs.presenceBonus,
      Prime_Transport: emp.inputs.transportBonus,
      Chef_Famille: emp.inputs.isHeadOfFamily ? "OUI" : "NON",
      Enfants_Charge: emp.inputs.childrenCount,
      Parents_Charge: emp.inputs.dependentParents,
      Type_Avantage_Fiscal: emp.inputs.fiscalBenefitType,
      Taux_Avantage_Fiscal: emp.inputs.complementaryRetirementRate,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salariés");
    XLSX.writeFile(wb, "Modele_Import_Paie_SAFE_PME.xlsx");
  };

  const exportPmeResultsExcel = () => {
    const exportData = multiEmployees.map((e) => ({
      Matricule: e.matricule,
      Salarié: e.employeeName,
      Département: e.department,
      Poste: e.position,
      "Taux Retraite Compl. (%)": e.inputs.complementaryRetirementRate,
      "Brut Total (DT)": e.result.grossSalary,
      "CNSS Salarié (DT)": e.result.employeeCnss,
      "Mutuelle Sal. 10200 (DT)": e.result.employeeInsurance,
      "Net Imposable (DT)": e.result.netImposable,
      "IRPP (DT)": e.result.irpp,
      "CSS (DT)": e.result.css,
      "Net à Payer (DT)": e.result.netSalary,
      "3 Assurances Patronales (DT)": e.result.totalAssurancesPatronales,
      "Charges Patronales Totales (DT)": e.result.totalEmployerCharges,
      "Coût Global Entreprise (DT)": e.result.totalCoutGlobal,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Paie_Multi_Salariés");
    XLSX.writeFile(wb, `Resultats_Paie_Multi_Salaries_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Calculs temps réel pour la Feuille des Taux Modulables
  const annualTaxableGross = round3(result.taxableGross * 12);
  const annualProfExpenses = round3(result.fraisProfessionnels * 12);
  const annualFamilyDeductions = round3((result.chefDeFamille + result.enfantACharge) * 12);
  const annualNetAfterGain = round3(result.netImposable * 12);

  const tranchesCalcul = customRates.irppBrackets.map((b) => {
    let slice = 0;
    if (annualNetAfterGain > b.min) {
      slice = Math.max(0, Math.min(annualNetAfterGain, b.max) - b.min);
    }
    const taxAnnual = round3(slice * (b.rate / 100));
    return {
      min: b.min,
      max: b.max,
      rate: b.rate,
      slice,
      taxAnnual,
      taxMonthly: round3(taxAnnual / 12),
    };
  });

  function saveCustomRates() {
    try {
      const serializable = {
        ...customRates,
        irppBrackets: customRates.irppBrackets.map((b) => ({
          min: b.min,
          max: Number.isFinite(b.max) ? b.max : null,
          rate: b.rate,
        })),
      };
      window.localStorage.setItem("safe_pme_custom_rates_v1", JSON.stringify(serializable));
      setSavedNotice("Taux modulables enregistrés et appliqués au bulletin officiel et à la paie multi-salariés !");
      setTimeout(() => setSavedNotice(""), 4000);
    } catch {
      setSavedNotice("Erreur lors de l’enregistrement des taux.");
    }
  }

  // Cycles tRPC
  const runDetail = trpc.payroll.runDetail.useQuery({ id: selected! }, { enabled: !!selected });
  const active = useMemo(() => (employees.data ?? []).filter((e) => e.active), [employees.data]);
  const preview = useMemo(
    () =>
      active.map((e) => ({
        emp: e,
        ...computePayslip({
          gross: Number(e.baseSalary),
          headOfFamily: e.headOfFamily,
          children: e.children,
        }),
      })),
    [active],
  );
  const totals = useMemo(
    () =>
      preview.reduce(
        (acc, p) => ({
          gross: acc.gross + p.gross,
          net: acc.net + p.net,
          cnssR: acc.cnssR + p.cnssEmployer,
          irpp: acc.irpp + p.irpp,
        }),
        { gross: 0, net: 0, cnssR: 0, irpp: 0 },
      ),
    [preview],
  );

  function generate() {
    create.mutate({
      period,
      items: preview.map((p) => ({
        employeeId: p.emp.id,
        gross: p.gross,
        cnssEmployee: p.cnssEmployee,
        cnssEmployer: p.cnssEmployer,
        taxable: p.taxable,
        irpp: p.irpp,
        css: p.css,
        net: p.net,
      })),
    });
  }

  return (
    <>
      <PageHeader
        title="Gestion de la Paie & Charges Sociales"
        subtitle="Moteur fiscal tunisien harmonisé · IRPP 8 tranches · CNSS 9,68 % / 17,07 % · CSS 0,5 % · Rubrique 10200 Mutuelle Salariale · 3 Assurances patronales 1,766 %"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              id="pme-file-input"
              onChange={handleFileImport}
              accept=".xlsx,.xls,.csv,.pdf,.txt"
              className="hidden"
            />
            <button
              className="erp-btn-gold"
              onClick={() => document.getElementById("pme-file-input")?.click()}
              disabled={isImporting}
            >
              📥 {isImporting ? "Import…" : "Import Excel / CSV / PDF"}
            </button>
            <button
              className={activeTab === "payslip" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("payslip")}
            >
              📑 Bulletin &amp; Fiche de Paie Officielle
            </button>
            <button
              className={activeTab === "ratesSheet" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("ratesSheet")}
            >
              ⚙️ Feuille des Taux Modulables
            </button>
            <button
              className={activeTab === "multiEmployee" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("multiEmployee")}
            >
              👥 Paie Multi-Salariés ({multiEmployees.length})
            </button>
            <button
              className="erp-btn-gold"
              onClick={handleValidateAndCalculatePayroll}
            >
              + Lancer la Paie
            </button>
            <button
              className={activeTab === "cycles" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("cycles")}
            >
              📋 Cycles &amp; Historique
            </button>
          </div>
        }
      />

      {/* DATE LIMITE MODULABLE & ALERTE PAIE (DATE LIMITE - DATE DU JOUR, REMISE À 0 APRÈS CALCUL & VALIDATION) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="safe-pme-payroll-deadline" className="text-[13px] font-bold text-foreground">
            Date Limite :
          </label>
          <input
            id="safe-pme-payroll-deadline"
            type="date"
            value={payrollDeadline}
            onChange={(e) => handleDeadlineChange(e.target.value)}
            className="erp-input w-auto text-[13px] font-semibold"
          />
          <span className="text-xs text-muted-foreground">
            (Formule dynamique : Date Limite − Date du jour = {rawDaysDiff > 0 ? `+${rawDaysDiff}` : rawDaysDiff} j)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            data-testid="pme-payroll-alert-badge"
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-[13px] font-bold ${
              payrollValidated
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : alertDays <= 0
                  ? "border-red-300 bg-red-50 text-red-800"
                  : alertDays <= 7
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-blue-300 bg-blue-50 text-blue-800"
            }`}
          >
            <span>{payrollValidated ? "✅" : "⏰"}</span>
            <span>Alerte :</span>
            <span className="text-base font-black">{alertDays}</span>
            <span>
              {payrollValidated
                ? "jour (Salaires calculés & validés)"
                : `${Math.abs(alertDays) <= 1 ? "jour" : "jours"} (En attente de validation)`}
            </span>
          </div>

          <button
            type="button"
            onClick={handleValidateAndCalculatePayroll}
            className="erp-btn-gold text-xs"
          >
            ⚡ {payrollValidated ? "Recalculer les salaires" : "Calculer les salaires (Remise à 0)"}
          </button>
        </div>
      </div>

      {/* SYNTHÈSE & GÉNÉRATION OD DE PAIE (MOIS EN COURS — MONTANTS RÉELS AU MILLIME PRÈS) */}
      <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
              GÉNÉRATION OD DE PAIE (MOIS EN COURS)
            </h3>
            <p className="text-xs text-muted-foreground">
              Montants calculés au millime près (Brut, Charges patronales &amp; 3 Assurances, Mutuelle 10200, IRPP, CSS, Net à payer)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Source de l'OD de Paie"
              value={odSourceMode}
              onChange={(e) => setOdSourceMode(e.target.value as "multi" | "single")}
              className="erp-input w-auto text-xs font-semibold"
            >
              <option value="multi">Paie Multi-Salariés ({multiTotals.count})</option>
              <option value="single">Bulletin Individuel</option>
            </select>
            <button
              type="button"
              onClick={handlePostPayrollOd}
              disabled={postOdEntry.isPending}
              className="erp-btn-gold"
            >
              {postOdEntry.isPending ? "Comptabilisation…" : "Comptabiliser OD Paie"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="erp-table text-xs">
            <thead>
              <tr className="border-b-2 border-border bg-secondary/70 font-bold">
                <th>Compte</th>
                <th>Intitulé</th>
                <th className="text-right">Débit (DT)</th>
                <th className="text-right">Crédit (DT)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-bold text-primary">641</td>
                <td>Charges de personnel (Salaires bruts)</td>
                <td className="text-right font-bold">{odGross.toFixed(3)}</td>
                <td className="text-right">—</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">645</td>
                <td>
                  Charges sociales patronales &amp; 3 Assurances{" "}
                  <span className="text-[11px] text-muted-foreground">
                    (dont 3 Assurances: {odAssurancesPatronales.toFixed(3)} DT)
                  </span>
                </td>
                <td className="text-right font-bold">{odEmployerCharges.toFixed(3)}</td>
                <td className="text-right">—</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">421</td>
                <td>Personnel — Rémunérations dues (Net à payer)</td>
                <td className="text-right">—</td>
                <td className="text-right font-bold text-destructive">{odNetBalanced.toFixed(3)}</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">431</td>
                <td>CNSS (Salarié + Patronale + AT + FOPROLOS)</td>
                <td className="text-right">—</td>
                <td className="text-right font-bold text-destructive">{odCnssTotal.toFixed(3)}</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">431</td>
                <td>
                  Mutuelle Sal. 10200 + 3 Assurances Patronales{" "}
                  <span className="text-[11px] text-muted-foreground">
                    (10200: {odEmployeeInsurance.toFixed(3)} · Ass. Pat.: {odAssurancesPatronales.toFixed(3)})
                  </span>
                </td>
                <td className="text-right">—</td>
                <td className="text-right font-bold text-destructive">{odAssurancesAndMutuelle.toFixed(3)}</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">447</td>
                <td>Impôts sur les salaires (IRPP)</td>
                <td className="text-right">—</td>
                <td className="text-right font-bold text-destructive">{odIrpp.toFixed(3)}</td>
              </tr>
              <tr>
                <td className="font-bold text-primary">448</td>
                <td>État — Contribution Sociale de Solidarité (CSS)</td>
                <td className="text-right">—</td>
                <td className="text-right font-bold text-destructive">{odCss.toFixed(3)}</td>
              </tr>
              <tr className="bg-secondary/60 font-extrabold">
                <td colSpan={2}>TOTAL ÉQUILIBRÉ OD PAIE</td>
                <td className="text-right">{odTotalDebit.toFixed(3)}</td>
                <td className="text-right">{odTotalCredit.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {odStatusNotice && (
          <div
            role="status"
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${
              odStatusNotice.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            {odStatusNotice.type === "success" ? "✅ " : "⚠️ "}
            {odStatusNotice.message}
          </div>
        )}
      </div>

      {activeTab === "payslip" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <div className="text-[13px] text-foreground">
              <span className="mr-2">💡</span>
              <strong>Bulletin de paie officiel généré automatiquement.</strong> Toutes les rubriques modulables (salaires, primes, situation familiale, taux de retraite complémentaire, barèmes) sont centralisées exclusivement dans la{" "}
              <strong>Feuille des Taux Modulables</strong>.
            </div>
            <div className="flex gap-2">
              <button className="erp-btn-gold" onClick={() => setActiveTab("ratesSheet")}>
                ⚙️ Modifier les Rubriques Modulables
              </button>
              <button className="erp-btn-ghost" onClick={() => window.print()}>
                🖨️ Imprimer le bulletin
              </button>
            </div>
          </div>

          <article
            ref={printableSlipRef}
            className="rounded-xl border border-border bg-card p-6 text-foreground shadow-sm"
          >
            <header className="mb-4 flex flex-wrap justify-between gap-4 border-b-2 border-foreground pb-3">
              <div>
                <div className="text-lg font-extrabold tracking-tight">SAFE TUNISIE PME EXPRESS SARL</div>
                <div className="text-xs text-muted-foreground">Immeuble NIDA Technopole Ghazela, Ariana 2088 • Tunisie</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  CNSS : <strong>00551293-42</strong> • Matricule Fiscal : <strong>1234567/A/M/000</strong>
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-black tracking-wider">BULLETIN DE PAIE</div>
                <div className="text-xs font-semibold text-muted-foreground">
                  Période du 01/{String(new Date().getMonth() + 1).padStart(2, "0")}/{new Date().getFullYear()} au 30/{String(new Date().getMonth() + 1).padStart(2, "0")}/{new Date().getFullYear()}
                </div>
                <div className="text-[11px] text-muted-foreground">Paiement le 30 par Virement bancaire</div>
              </div>
            </header>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs sm:grid-cols-3">
              <div><span className="text-muted-foreground">Matricule :</span> <strong>EMP-5553388</strong></div>
              <div><span className="text-muted-foreground">Emploi :</span> <strong>Collaborateur Cadre / Senior</strong></div>
              <div><span className="text-muted-foreground">Situation :</span> <strong>{inputs.isHeadOfFamily ? "Marié(e) (Chef de famille)" : "Célibataire"}</strong></div>
              <div><span className="text-muted-foreground">Enfant(s) :</span> <strong>{inputs.childrenCount}</strong></div>
              <div>
                <span className="text-muted-foreground">Parents à charge :</span>{" "}
                <strong>
                  {inputs.dependentParents > 0
                    ? `${inputs.dependentParents} à charge (${((inputs.dependentParents * customRates.parentDeduction) / 12).toFixed(3)} DT)`
                    : "0"}
                </strong>
              </div>
              <div><span className="text-muted-foreground">Taux Retraite Compl. :</span> <strong>{(Number(inputs.complementaryRetirementRate) || 0).toFixed(3)} %</strong></div>
            </div>

            <div className="overflow-x-auto">
              <table className="erp-table text-[12px]">
                <thead>
                  <tr className="border-b-2 border-border bg-secondary/70 font-bold">
                    <th className="w-14">N°</th>
                    <th>Désignation de la rubrique</th>
                    <th className="text-right">Base</th>
                    <th className="text-right">Taux Sal.</th>
                    <th className="text-right">Gain Sal.</th>
                    <th className="text-right">Retenue Sal.</th>
                    <th className="text-right">Taux Pat.</th>
                    <th className="text-right">Part Patronale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1010</td>
                    <td>Salaire de base mensuel</td>
                    <td className="text-right">{inputs.baseSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold">{inputs.baseSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr>
                    <td>1020</td>
                    <td>Prime de présence</td>
                    <td className="text-right">{inputs.presenceBonus.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold">{inputs.presenceBonus.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr>
                    <td>1030</td>
                    <td>Prime de transport</td>
                    <td className="text-right">{inputs.transportBonus.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold">{inputs.transportBonus.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr className="border-y-2 border-border bg-secondary/60 font-extrabold">
                    <td colSpan={2}>TOTAL BRUT</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right text-primary">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right" colSpan={3}>—</td>
                  </tr>
                  <tr>
                    <td>8000</td>
                    <td>CNSS Normale</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">{customRates.cnssEmployeeRate.toFixed(3)} %</td>
                    <td className="text-right">—</td>
                    <td className="text-right text-destructive">{result.employeeCnss.toFixed(3)}</td>
                    <td className="text-right">{(customRates.cnssEmployerRate + customRates.workAccidentRate).toFixed(3)} %</td>
                    <td className="text-right">{(result.employerCnss + result.workAccident).toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td>9000</td>
                    <td>Impôt sur le Revenu (IRPP)</td>
                    <td className="text-right">{result.netImposable.toFixed(3)}</td>
                    <td className="text-right">Barème</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold text-destructive">{result.irpp.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr className="bg-emerald-50/70">
                    <td>9050</td>
                    <td className="font-semibold text-emerald-800">Gain / IRPP (Avantage fiscal)</td>
                    <td className="text-right">{result.retirementBonusDeduction.toFixed(3)}</td>
                    <td className="text-right">Économie</td>
                    <td className="text-right font-bold text-emerald-700">+{result.gainIrpp.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr>
                    <td>9400</td>
                    <td>Contrib° Sociale de Solidarité (CSS)</td>
                    <td className="text-right">{result.netImposable.toFixed(3)}</td>
                    <td className="text-right">{customRates.cssRate.toFixed(3)} %</td>
                    <td className="text-right">—</td>
                    <td className="text-right text-destructive">{result.css.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr className="bg-emerald-50/70">
                    <td>9450</td>
                    <td className="font-semibold text-emerald-800">Gain / CSS (Avantage fiscal)</td>
                    <td className="text-right">{result.retirementBonusDeduction.toFixed(3)}</td>
                    <td className="text-right">Économie</td>
                    <td className="text-right font-bold text-emerald-700">+{result.gainCss.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                  </tr>
                  <tr>
                    <td>9910</td>
                    <td>Assurance Compl. Mutuelle Patronale</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">{customRates.employerInsuranceRate.toFixed(3)} %</td>
                    <td className="text-right">{result.employerInsurance.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td>9920</td>
                    <td>1. Assurance Décès Patronale (0.5% × Brut)</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">{customRates.assuranceDecesRate.toFixed(3)} %</td>
                    <td className="text-right font-semibold">{result.assuranceDeces.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td>9930</td>
                    <td>2. Assurance Invalidité Patronale</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">{customRates.assuranceInvaliditeRate.toFixed(4)} %</td>
                    <td className="text-right font-semibold">{result.assuranceInvalidite.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td>9940</td>
                    <td>3. Assurance Maladie Patronale</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">{customRates.assuranceMaladieRate.toFixed(4)} %</td>
                    <td className="text-right font-semibold">{result.assuranceMaladie.toFixed(3)}</td>
                  </tr>
                  <tr className="border-y-2 border-border bg-secondary/60 font-extrabold">
                    <td colSpan={2}>TOTAL COTISATIONS</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right text-destructive">
                      {(result.employeeCnss + result.irpp + result.css + result.employeeInsurance).toFixed(3)}
                    </td>
                    <td className="text-right">—</td>
                    <td className="text-right">
                      {(result.employerCnss + result.workAccident + result.employerInsurance + result.totalAssurancesPatronales).toFixed(3)}
                    </td>
                  </tr>
                  <tr>
                    <td>10000</td>
                    <td className="font-bold">Salaire Net Intermédiaire</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold">{result.intermediateNet.toFixed(3)}</td>
                    <td className="text-right" colSpan={3}>—</td>
                  </tr>
                  <tr>
                    <td>10200</td>
                    <td>Assurance Compl. Mutuelle Salariale</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)}</td>
                    <td className="text-right">{(Number(inputs.complementaryRetirementRate) || 0).toFixed(3)} %</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-bold text-destructive">{result.employeeInsurance.toFixed(3)}</td>
                    <td className="text-right" colSpan={2}>—</td>
                  </tr>
                  {inputs.dependentParents >= 1 && (
                    <tr>
                      <td>11160</td>
                      <td>Déduction 1er Parent à Charge</td>
                      <td className="text-right">1,000</td>
                      <td className="text-right">—</td>
                      <td className="text-right">—</td>
                      <td className="text-right text-destructive">{(customRates.parentDeduction / 12).toFixed(3)}</td>
                      <td className="text-right" colSpan={2}>—</td>
                    </tr>
                  )}
                  {inputs.dependentParents >= 2 && (
                    <tr>
                      <td>11170</td>
                      <td>Déduction 2ème Parent à Charge</td>
                      <td className="text-right">1,000</td>
                      <td className="text-right">—</td>
                      <td className="text-right">—</td>
                      <td className="text-right text-destructive">{(customRates.parentDeduction / 12).toFixed(3)}</td>
                      <td className="text-right" colSpan={2}>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">80500 Net à payer par virement</div>
                <div className="text-xs font-medium text-white/80">DINARS TUNISIENS (TND)</div>
              </div>
              <div className="text-2xl font-black text-gold">{result.netSalary.toFixed(3)} DT</div>
            </div>
          </article>
        </div>
      ) : activeTab === "ratesSheet" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-900">
            <strong>💡 Feuille interactive des rubriques &amp; taux modulables :</strong> Toutes les rubriques éditables (salaires, primes, situation familiale, taux de retraite complémentaire, barèmes sociaux et fiscaux) sont centralisées uniquement ici. Tout est recalculé en temps réel.
          </div>

          {/* 1. RUBRIQUES MODULABLES DU SALARIÉ */}
          <Panel
            title="👤 Rubriques Modulables du Salarié (Rémunération & Situation Familiale)"
            subtitle="Impact direct sur le Brut, la Retraite Complémentaire (10200) et l'Assiette Fiscale"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Salaire de base (DT)">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="erp-input font-bold"
                  value={inputs.baseSalary}
                  onChange={(e) => setInputs({ ...inputs, baseSalary: Number(e.target.value) })}
                />
              </Field>
              <Field label="Prime de présence (DT)">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="erp-input font-bold"
                  value={inputs.presenceBonus}
                  onChange={(e) => setInputs({ ...inputs, presenceBonus: Number(e.target.value) })}
                />
              </Field>
              <Field label="Avantage transport domicile-travail (DT)">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="erp-input font-bold"
                  value={inputs.transportBonus}
                  onChange={(e) => setInputs({ ...inputs, transportBonus: Number(e.target.value) })}
                />
              </Field>
              <div>
                <Field label="Taux de retraite complémentaire (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="erp-input font-bold"
                    value={inputs.complementaryRetirementRate}
                    onChange={(e) => setInputs({ ...inputs, complementaryRetirementRate: Number(e.target.value) })}
                  />
                </Field>
                <p className="mt-1 text-[11px] font-semibold text-blue-700">Rubrique 10200 = Taux (%) × Salaire Brut</p>
              </div>
              <Field label="Dispositif d’avantage fiscal">
                <select
                  className="erp-input font-semibold"
                  value={inputs.fiscalBenefitType}
                  onChange={(e) => setInputs({ ...inputs, fiscalBenefitType: e.target.value as PmePayrollInputs["fiscalBenefitType"] })}
                >
                  <option value="COMPLEMENTARY_RETIREMENT">Retraite complémentaire — gains calculés</option>
                  <option value="RETIREMENT_SAVINGS">Épargne retraite — gains calculés</option>
                  <option value="LIFE_INSURANCE">Assurance-vie — gains calculés</option>
                </select>
              </Field>
              <Field label="Enfants à charge">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="erp-input font-bold"
                  value={inputs.childrenCount}
                  onChange={(e) => setInputs({ ...inputs, childrenCount: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Parents à charge">
                <select
                  className="erp-input font-semibold"
                  value={inputs.dependentParents}
                  onChange={(e) => setInputs({ ...inputs, dependentParents: Number(e.target.value) })}
                >
                  <option value={0}>Aucun parent à charge (0)</option>
                  <option value={1}>1er parent à charge</option>
                  <option value={2}>2ème parent à charge</option>
                </select>
              </Field>
              <div className="flex items-center pt-5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={inputs.isHeadOfFamily}
                    onChange={(e) => setInputs({ ...inputs, isHeadOfFamily: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Chef de famille
                </label>
              </div>
            </div>
          </Panel>

          {/* 2. TAUX SOCIAUX, ASSURANCES PATRONALES & DÉDUCTIONS FISCALES */}
          <Panel
            title="⚖️ Taux Sociaux, Assurances Patronales & Déductions Fiscales Modulables"
            subtitle="Paramètres légaux et conventionnels"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Taux CNSS Salarié (%)">
                <input
                  type="number"
                  step="0.01"
                  className="erp-input font-bold"
                  value={customRates.cnssEmployeeRate}
                  onChange={(e) => setCustomRates({ ...customRates, cnssEmployeeRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Taux CNSS Patronale (%)">
                <input
                  type="number"
                  step="0.01"
                  className="erp-input font-bold"
                  value={customRates.cnssEmployerRate}
                  onChange={(e) => setCustomRates({ ...customRates, cnssEmployerRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Taux Accident du Travail (%)">
                <input
                  type="number"
                  step="0.01"
                  className="erp-input font-bold"
                  value={customRates.workAccidentRate}
                  onChange={(e) => setCustomRates({ ...customRates, workAccidentRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Taux FOPROLOS (%)">
                <input
                  type="number"
                  step="0.01"
                  className="erp-input font-bold"
                  value={customRates.foprolosRate}
                  onChange={(e) => setCustomRates({ ...customRates, foprolosRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Assurance Mutuelle Patronale (%)">
                <input
                  type="number"
                  step="0.1"
                  className="erp-input font-bold"
                  value={customRates.employerInsuranceRate}
                  onChange={(e) => setCustomRates({ ...customRates, employerInsuranceRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Frais Professionnels (%)">
                <input
                  type="number"
                  step="0.1"
                  className="erp-input font-bold"
                  value={customRates.profExpensesRate}
                  onChange={(e) => setCustomRates({ ...customRates, profExpensesRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Plafond Frais Pro (DT/an)">
                <input
                  type="number"
                  step="50"
                  className="erp-input font-bold"
                  value={customRates.profExpensesMaxCap}
                  onChange={(e) => setCustomRates({ ...customRates, profExpensesMaxCap: Number(e.target.value) })}
                />
              </Field>
              <Field label="Déduction Chef de Famille (DT/an)">
                <input
                  type="number"
                  step="50"
                  className="erp-input font-bold"
                  value={customRates.headOfFamilyDeduction}
                  onChange={(e) => setCustomRates({ ...customRates, headOfFamilyDeduction: Number(e.target.value) })}
                />
              </Field>
              <Field label="Déduction par Enfant (DT/an)">
                <input
                  type="number"
                  step="25"
                  className="erp-input font-bold"
                  value={customRates.childDeduction}
                  onChange={(e) => setCustomRates({ ...customRates, childDeduction: Number(e.target.value) })}
                />
              </Field>
              <Field label="Déduction par Parent (DT/an)">
                <input
                  type="number"
                  step="50"
                  className="erp-input font-bold"
                  value={customRates.parentDeduction}
                  onChange={(e) => setCustomRates({ ...customRates, parentDeduction: Number(e.target.value) })}
                />
              </Field>
              <Field label="Taux CSS (%)">
                <input
                  type="number"
                  step="0.1"
                  className="erp-input font-bold"
                  value={customRates.cssRate}
                  onChange={(e) => setCustomRates({ ...customRates, cssRate: Number(e.target.value) })}
                />
              </Field>
              <div>
                <Field label="1. Assurance Décès Patronale (%)">
                  <input
                    type="number"
                    step="0.001"
                    className="erp-input font-bold"
                    value={customRates.assuranceDecesRate}
                    onChange={(e) => setCustomRates({ ...customRates, assuranceDecesRate: Number(e.target.value) })}
                  />
                </Field>
                <p className="mt-1 text-[11px] font-semibold text-emerald-800">0.5% × Total Brut (Charge Patronale)</p>
              </div>
              <div>
                <Field label="2. Assurance Invalidité Patronale (%)">
                  <input
                    type="number"
                    step="0.000001"
                    className="erp-input font-bold"
                    value={customRates.assuranceInvaliditeRate}
                    onChange={(e) => setCustomRates({ ...customRates, assuranceInvaliditeRate: Number(e.target.value) })}
                  />
                </Field>
                <p className="mt-1 text-[11px] font-semibold text-emerald-800">0.78400752510838% × Total Brut (Charge Patronale)</p>
              </div>
              <div>
                <Field label="3. Assurance Maladie Patronale (%)">
                  <input
                    type="number"
                    step="0.000001"
                    className="erp-input font-bold"
                    value={customRates.assuranceMaladieRate}
                    onChange={(e) => setCustomRates({ ...customRates, assuranceMaladieRate: Number(e.target.value) })}
                  />
                </Field>
                <p className="mt-1 text-[11px] font-semibold text-emerald-800">0,0048212520380679 × Total Brut (Charge Patronale)</p>
              </div>
            </div>
          </Panel>

          {/* 3. DÉTAIL DU CALCUL DU NET IMPOSABLE */}
          <Panel title="📑 Détail du Calcul du Net Imposable (Assiette IRPP & CSS)" subtitle="Barème Fiscal Officiel Tunisien" noPad>
            <div className="overflow-x-auto">
              <table className="erp-table text-[12.5px]">
                <thead>
                  <tr className="bg-secondary/60">
                    <th>Élément de Détermination de l'Assiette</th>
                    <th className="text-center">Règle légale / Taux</th>
                    <th className="text-right">Montant Annuel (DT/an)</th>
                    <th className="text-right">Montant Mensuel (DT/mois)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold">
                    <td>1. Salaire Brut Total (Base + Primes)</td>
                    <td className="text-center text-muted-foreground">Assiette de départ</td>
                    <td className="text-right">{(result.grossSalary * 12).toFixed(3)} DT</td>
                    <td className="text-right">{result.grossSalary.toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-destructive">
                    <td>− Cotisation CNSS Salariée Déductible</td>
                    <td className="text-center">{customRates.cnssEmployeeRate}% du Brut</td>
                    <td className="text-right">-{(result.employeeCnss * 12).toFixed(3)} DT</td>
                    <td className="text-right">-{result.employeeCnss.toFixed(3)} DT</td>
                  </tr>
                  <tr className="bg-secondary/40 font-bold text-primary">
                    <td>= Salaire Brut Imposable (Brut − CNSS)</td>
                    <td className="text-center">Formule légale</td>
                    <td className="text-right">{annualTaxableGross.toFixed(3)} DT</td>
                    <td className="text-right">{result.taxableGross.toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-amber-800">
                    <td>− Déduction Frais Professionnels</td>
                    <td className="text-center">{customRates.profExpensesRate}% (plafonné à {customRates.profExpensesMaxCap} DT/an)</td>
                    <td className="text-right">-{annualProfExpenses.toFixed(3)} DT</td>
                    <td className="text-right">-{result.fraisProfessionnels.toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td>− Déductions Familiales (Chef de famille + Enfants)</td>
                    <td className="text-center">{customRates.headOfFamilyDeduction} DT / {customRates.childDeduction} DT</td>
                    <td className="text-right">-{annualFamilyDeductions.toFixed(3)} DT</td>
                    <td className="text-right">-{(result.chefDeFamille + result.enfantACharge).toFixed(3)} DT</td>
                  </tr>
                  <tr className="font-medium text-emerald-700">
                    <td>− Dispositif d’Avantage Fiscal ({inputs.fiscalBenefitType === "COMPLEMENTARY_RETIREMENT" ? "Retraite compl." : inputs.fiscalBenefitType === "RETIREMENT_SAVINGS" ? "Épargne retraite" : "Assurance-vie"})</td>
                    <td className="text-center">{inputs.complementaryRetirementRate}% assis sur Salaire Brut Total</td>
                    <td className="text-right">-{(result.retirementBonusDeduction * 12).toFixed(3)} DT</td>
                    <td className="text-right">-{result.retirementBonusDeduction.toFixed(3)} DT</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-primary font-bold text-primary-foreground">
                    <td colSpan={2}>= REVENU NET IMPOSABLE RETENU (ASSIETTE BARÈME IRPP ET CSS)</td>
                    <td className="text-right text-gold">{annualNetAfterGain.toFixed(3)} DT</td>
                    <td className="text-right text-gold">{result.netImposable.toFixed(3)} DT</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          {/* 4. BARÈME PROGRESSIF DE L'IRPP MODULABLE */}
          <Panel
            title="Barème Progressif de l’IRPP (Tranches modulables & Calcul par tranche)"
            subtitle="Barème fiscal 8 tranches"
            actions={
              <span className="rounded border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">
                ✓ Tranche 6 vérifiée : 40 000 DT – 50 000 DT (36%, assiette 10 000 DT) conforme loi tunisienne
              </span>
            }
            noPad
          >
            <Table head={["Tranche de revenu net imposable", "Taux IRPP (%)", "Assiette Tranche (DT/an)", "IRPP Annuel", "IRPP Mensuel"]}>
              {tranchesCalcul.map((t, idx) => (
                <tr key={idx} className={t.slice > 0 ? "font-semibold" : "text-muted-foreground opacity-75"}>
                  <td>{t.max === Infinity ? `Plus de ${t.min.toLocaleString("fr-FR")} DT` : `De ${t.min.toLocaleString("fr-FR")} DT à ${t.max.toLocaleString("fr-FR")} DT`}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="erp-input w-20 text-right font-bold"
                      value={t.rate}
                      onChange={(e) => {
                        const updated = [...customRates.irppBrackets];
                        updated[idx] = { ...updated[idx], rate: Number(e.target.value) };
                        setCustomRates({ ...customRates, irppBrackets: updated });
                      }}
                    />{" "}
                    %
                  </td>
                  <td className="text-right">{t.slice.toFixed(3)}</td>
                  <td className="text-right">{t.taxAnnual.toFixed(3)}</td>
                  <td className="text-right text-destructive">{t.taxMonthly.toFixed(3)}</td>
                </tr>
              ))}
              <tr className="bg-secondary/70 font-bold">
                <td colSpan={2}>TOTAL IRPP CALCULÉ</td>
                <td className="text-right">{annualNetAfterGain.toFixed(3)} DT</td>
                <td className="text-right">{(result.irpp * 12).toFixed(3)} DT</td>
                <td className="text-right text-destructive">{result.irpp.toFixed(3)} DT</td>
              </tr>
            </Table>
          </Panel>

          {/* 5. RÉSULTAT EN TEMPS RÉEL & ENREGISTREMENT */}
          <Panel title="📊 Résultat du Recalcul Instantané en Temps Réel" subtitle="Actualisation immédiate">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="text-[11px] font-bold text-muted-foreground">1. SALAIRE BRUT</div>
                <div className="text-[18px] font-extrabold">{result.grossSalary.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="text-[11px] font-bold text-red-700">2. CNSS SALARIÉ ({customRates.cnssEmployeeRate}%)</div>
                <div className="text-[18px] font-extrabold text-destructive">-{result.employeeCnss.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-[11px] font-bold text-emerald-700">3. BRUT IMPOSABLE</div>
                <div className="text-[18px] font-extrabold text-emerald-800">{result.taxableGross.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="text-[11px] font-bold text-muted-foreground">4. MUTUELLE SAL. (10200)</div>
                <div className="text-[18px] font-extrabold text-destructive">-{result.employeeInsurance.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="text-[11px] font-bold text-red-700">5. IRPP RETENU MENSUEL</div>
                <div className="text-[18px] font-extrabold text-destructive">-{result.irpp.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="text-[11px] font-bold text-red-700">6. CSS MENSUELLE ({customRates.cssRate}%)</div>
                <div className="text-[18px] font-extrabold text-destructive">-{result.css.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-primary p-3 text-primary-foreground sm:col-span-2">
                <div className="text-[11px] font-bold uppercase text-gold">NET À PAYER SALARIÉ</div>
                <div className="text-[22px] font-black text-white">{result.netSalary.toFixed(3)} TND</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
              <div className="text-[12.5px]">
                <span className="font-bold">Charges Patronales Totales : </span>
                <span className="font-extrabold text-primary">{result.totalEmployerCharges.toFixed(3)} DT</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="erp-btn-gold" onClick={saveCustomRates}>
                  💾 Enregistrer Modification
                </button>
                <button className="erp-btn-ghost" onClick={() => setActiveTab("payslip")}>
                  📑 Voir le Bulletin de Paie Officiel
                </button>
              </div>
            </div>
            {savedNotice && (
              <p className="mt-2 rounded bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                ✅ {savedNotice}
              </p>
            )}
          </Panel>
        </div>
      ) : activeTab === "multiEmployee" ? (
        <div className="space-y-4">
          <Panel
            title="👥 Traitement & Calcul de Paie Multi-Salariés en Simultané"
            subtitle="Importez un fichier Excel, CSV ou PDF. Chaque salarié conserve ses paramètres spécifiques (contrat mutuelle, retraite complémentaire %, enfants, parents)."
            actions={
              <div className="flex flex-wrap gap-2">
                <button className="erp-btn-gold" onClick={() => document.getElementById("pme-file-input")?.click()} disabled={isImporting}>
                  📥 {isImporting ? "Import…" : "Importer Fichier"}
                </button>
                <button className="erp-btn-ghost" onClick={downloadPmeTemplateExcel}>
                  📊 Modèle Excel
                </button>
                <button className="erp-btn-ghost" onClick={handleRecalculateMulti}>
                  ⚡ Recalculer ({multiEmployees.length})
                </button>
                <button className="erp-btn-ghost" onClick={exportPmeResultsExcel}>
                  📤 Export Excel
                </button>
              </div>
            }
          >
            {importNotice && (
              <div
                className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold ${
                  importNotice.type === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-800"
                }`}
              >
                <span>{importNotice.type === "success" ? "✅" : "⚠️"} {importNotice.message}</span>
                <button onClick={() => setImportNotice(null)} className="font-bold">✕</button>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Effectif Importé" value={`${multiTotals.count} Salariés`} hint="Calcul simultané" />
              <Stat label="Masse Salariale Brute" value={`${multiTotals.totalGross.toFixed(3)} DT`} hint={`CNSS ${customRates.cnssEmployeeRate}%`} />
              <Stat label="Total Mutuelle Sal. (10200)" value={`${multiTotals.totalInsuranceEmp.toFixed(3)} DT`} hint="Selon contrat individuel" tone="gold" />
              <Stat label="Total Net à Payer" value={`${multiTotals.totalNet.toFixed(3)} DT`} hint="Net viré global" tone="success" />
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">
                Grille détaillée ({multiEmployees.length} salariés)
              </span>
              <input
                type="text"
                placeholder="🔍 Filtrer par matricule ou salarié…"
                className="erp-input w-64"
                value={multiSearchTerm}
                onChange={(e) => setMultiSearchTerm(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="erp-table text-[11.5px]">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th>Matricule</th>
                    <th>Salarié</th>
                    <th>Situation Fam. (Spécifique)</th>
                    <th>Contrat Mutuelle / Retraite Compl. (%)</th>
                    <th className="text-right">Salaire Brut</th>
                    <th className="text-right">CNSS Sal.</th>
                    <th className="text-right">Mutuelle Sal. (10200)</th>
                    <th className="text-right">IRPP</th>
                    <th className="text-right">CSS</th>
                    <th className="text-right">Net à Payer</th>
                    <th className="text-right">Charges Pat.</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {multiEmployees
                    .filter(
                      (emp) =>
                        !multiSearchTerm ||
                        emp.matricule.toLowerCase().includes(multiSearchTerm.toLowerCase()) ||
                        emp.employeeName.toLowerCase().includes(multiSearchTerm.toLowerCase()),
                    )
                    .map((emp) => (
                      <tr key={emp.id}>
                        <td className="font-bold text-primary">{emp.matricule}</td>
                        <td>
                          <div className="font-bold">{emp.employeeName}</div>
                          <div className="text-[10.5px] text-muted-foreground">{emp.department} · {emp.position}</div>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <label className="inline-flex cursor-pointer items-center gap-1 font-semibold">
                              <input
                                type="checkbox"
                                checked={emp.inputs.isHeadOfFamily}
                                onChange={(e) => handleUpdateMultiEmployee(emp.id, { isHeadOfFamily: e.target.checked })}
                              />
                              Chef
                            </label>
                            <label className="inline-flex items-center gap-1">
                              Enf:
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="erp-input w-11 px-1 py-0.5 text-center"
                                value={emp.inputs.childrenCount}
                                onChange={(e) =>
                                  handleUpdateMultiEmployee(emp.id, { childrenCount: Math.max(0, Number(e.target.value) || 0) })
                                }
                              />
                            </label>
                            <label className="inline-flex items-center gap-1">
                              Par:
                              <select
                                className="erp-input px-1 py-0.5"
                                value={emp.inputs.dependentParents}
                                onChange={(e) =>
                                  handleUpdateMultiEmployee(emp.id, { dependentParents: Number(e.target.value) || 0 })
                                }
                              >
                                <option value={0}>0</option>
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                              </select>
                            </label>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1 text-[11px]">
                            <select
                              className="erp-input max-w-[125px] px-1 py-0.5"
                              value={emp.inputs.fiscalBenefitType}
                              onChange={(e) =>
                                handleUpdateMultiEmployee(emp.id, {
                                  fiscalBenefitType: e.target.value as PmePayrollInputs["fiscalBenefitType"],
                                })
                              }
                            >
                              <option value="COMPLEMENTARY_RETIREMENT">Retraite compl.</option>
                              <option value="RETIREMENT_SAVINGS">Épargne retraite</option>
                              <option value="LIFE_INSURANCE">Assurance-vie</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              className="erp-input w-14 px-1 py-0.5 text-right font-bold"
                              value={emp.inputs.complementaryRetirementRate}
                              onChange={(e) =>
                                handleUpdateMultiEmployee(emp.id, {
                                  complementaryRetirementRate: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                            <span>%</span>
                          </div>
                        </td>
                        <td className="text-right font-bold">{emp.result.grossSalary.toFixed(3)}</td>
                        <td className="text-right text-destructive">{emp.result.employeeCnss.toFixed(3)}</td>
                        <td className="text-right font-semibold text-destructive">{emp.result.employeeInsurance.toFixed(3)}</td>
                        <td className="text-right text-destructive">{emp.result.irpp.toFixed(3)}</td>
                        <td className="text-right text-destructive">{emp.result.css.toFixed(3)}</td>
                        <td className="bg-emerald-50 text-right font-black text-emerald-700">{emp.result.netSalary.toFixed(3)} DT</td>
                        <td className="text-right font-semibold text-primary">{emp.result.totalEmployerCharges.toFixed(3)}</td>
                        <td className="text-center">
                          <button
                            className="erp-btn-ghost px-2 py-1 text-[11px]"
                            onClick={() => handleSelectEmployeeForPayslip(emp)}
                            title="Charger dans le bulletin individuel"
                          >
                            👁️ Bulletin
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary/70 font-extrabold">
                    <td colSpan={4}>TOTAL ({multiTotals.count} Salariés)</td>
                    <td className="text-right">{multiTotals.totalGross.toFixed(3)} DT</td>
                    <td className="text-right text-destructive">{multiTotals.totalCnss.toFixed(3)} DT</td>
                    <td className="text-right text-destructive">{multiTotals.totalInsuranceEmp.toFixed(3)} DT</td>
                    <td className="text-right text-destructive">{multiTotals.totalIrpp.toFixed(3)} DT</td>
                    <td className="text-right text-destructive">{multiTotals.totalCss.toFixed(3)} DT</td>
                    <td className="bg-emerald-100 text-right text-emerald-800">{multiTotals.totalNet.toFixed(3)} DT</td>
                    <td className="text-right text-primary">{multiTotals.totalEmployer.toFixed(3)} DT</td>
                    <td className="text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Salariés actifs" value={String(active.length)} hint="Base de calcul du prochain cycle" />
            <Stat label="Masse brute soumise" value={fmtTND(totals.gross)} hint={`CNSS salarié ${CNSS_EMPLOYEE_RATE} %`} />
            <Stat label="IRPP retenu total" value={fmtTND(totals.irpp)} hint="Barème progressif 8 tranches" tone="gold" />
            <Stat label="Net à payer global" value={fmtTND(totals.net)} hint="Viré sur compte bancaire" tone="success" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Cycles de paie"
              subtitle="Historique des bulletins générés"
              className="xl:col-span-2"
              noPad
              actions={
                <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
                  + Lancer un cycle
                </button>
              }
            >
              {runs.isLoading ? (
                <Loading />
              ) : (runs.data ?? []).length === 0 ? (
                <EmptyState
                  icon="◫"
                  title="Aucun cycle de paie"
                  description="Lancez votre premier cycle : l'ERP calcule automatiquement la CNSS salarié (9,68 %), employeur (17,07 %), la CSS (0,5 %) et l'IRPP selon le barème tunisien à 8 tranches."
                  action={
                    <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
                      {active.length === 0 ? "Créez d'abord des salariés" : "Lancer un cycle"}
                    </button>
                  }
                />
              ) : (
                <Table head={["Période", "Statut", "Brut", "CNSS salarié", "IRPP", "Net à payer"]}>
                  {(runs.data ?? []).map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                      <td className="font-medium">{periodLabel(r.period)}</td>
                      <td>
                        <Badge tone={r.status === "PAID" ? "success" : "gold"}>{r.status}</Badge>
                      </td>
                      <td className="text-right"><Money value={Number(r.totalGross)} /></td>
                      <td className="text-right"><Money value={Number(r.totalCnssEmp)} /></td>
                      <td className="text-right"><Money value={Number(r.totalIrpp)} /></td>
                      <td className="text-right"><Money value={Number(r.totalNet)} bold /></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            <Panel title="Détail du cycle" subtitle={selected ? "Ventilation par salarié" : "Sélectionnez un cycle"} noPad>
              {!selected ? (
                <EmptyState icon="⌖" title="Aucun cycle sélectionné" description="Cliquez sur une ligne à gauche pour inspecter les bulletins." />
              ) : runDetail.isLoading ? (
                <Loading />
              ) : runDetail.data ? (
                <Table head={["Salarié", "Brut", "IRPP", "Net"]}>
                  {runDetail.data.items.map((it) => (
                    <tr key={it.id}>
                      <td className="font-medium">
                        {it.firstName} {it.lastName}
                      </td>
                      <td className="text-right"><Money value={Number(it.gross)} /></td>
                      <td className="text-right"><Money value={Number(it.irpp)} /></td>
                      <td className="text-right"><Money value={Number(it.net)} bold /></td>
                    </tr>
                  ))}
                </Table>
              ) : null}
            </Panel>
          </div>
        </>
      )}

      {/* Modale de lancement de cycle */}
      <Modal open={open} onClose={() => setOpen(false)} title="Lancer un cycle de paie" wide>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Période">
            <input type="month" className="erp-input" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <div className="rounded-lg bg-gold-soft/50 p-3 text-[12px] leading-relaxed">
            <p className="font-semibold text-[hsl(38_72%_30%)]">Taux et Barèmes de Paie Harmonisés</p>
            <p className="mt-1 text-muted-foreground">
              CNSS salarié {customRates.cnssEmployeeRate} % · CNSS employeur {customRates.cnssEmployerRate + customRates.workAccidentRate} % · CSS {customRates.cssRate} % · Assurances patronales 1,766 % (Décès 0,5 %, Invalidité 0,784 %, Maladie 0,482 %) · IRPP 8 tranches
            </p>
          </div>
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-lg border border-border">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Salarié</th>
                <th className="text-right">Brut</th>
                <th className="text-right">CNSS</th>
                <th className="text-right">CSS</th>
                <th className="text-right">IRPP</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.emp.id}>
                  <td className="font-medium">
                    {p.emp.firstName} {p.emp.lastName}
                    {p.emp.headOfFamily && <span className="ml-1.5 text-[10px] text-gold">CF</span>}
                  </td>
                  <td className="text-right"><Money value={p.gross} /></td>
                  <td className="text-right"><Money value={p.cnssEmployee} /></td>
                  <td className="text-right"><Money value={p.css} /></td>
                  <td className="text-right"><Money value={p.irpp} /></td>
                  <td className="text-right"><Money value={p.net} bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total brut</span>
            <Money value={totals.gross} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net à payer</span>
            <Money value={totals.net} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Charges patronales (CNSS 17,07 % + 3 Assurances 1,766 %)</span>
            <Money value={totals.cnssR} bold />
          </div>
        </div>

        {create.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{create.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={generate} disabled={create.isPending || preview.length === 0}>
            {create.isPending ? "Calcul…" : `Générer ${preview.length} bulletin(s)`}
          </button>
        </div>
      </Modal>
    </>
  );
}
