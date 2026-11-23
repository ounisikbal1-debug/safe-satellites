// ── AGENT-OWNED: transmission vers la Télédéclaration (TTN) et e-Fatoura ─────
// Appels HTTP réels vers les plateformes, avec les identifiants fournis par
// l'utilisateur dans Web Admin → Secrets. Aucun envoi simulé : si les clés ne
// sont pas configurées, la fonction le dit et n'écrit rien.
// Import paresseux : `_core/env` valide DATABASE_URL/JWT_SECRET au chargement du
// module. L'importer ici en haut ferait échouer tout test unitaire qui charge le
// routeur sans base de données. On ne le lit qu'au moment de l'envoi.
async function readEnv() {
  const { env } = await import("./_core/env");
  return env;
}

export type Platform = "ttn" | "efatoura";

export type TransmissionResult = {
  ok: boolean;
  /** 'envoye' | 'non_configure' | 'refuse' | 'erreur_reseau' */
  status: "envoye" | "non_configure" | "refuse" | "erreur_reseau";
  reference?: string;
  message: string;
  httpStatus?: number;
};

const CONFIG: Record<Platform, { urlKey: string; keyKey: string; label: string }> = {
  ttn: {
    urlKey: "TTN_API_URL",
    keyKey: "TTN_API_KEY",
    label: "Télédéclaration TTN",
  },
  efatoura: {
    urlKey: "EFATOURA_API_URL",
    keyKey: "EFATOURA_API_KEY",
    label: "e-Fatoura",
  },
};

/** Indique, sans jamais révéler les valeurs, quelles plateformes sont prêtes. */
export async function transmissionStatus() {
  let env: Awaited<ReturnType<typeof readEnv>> | null = null;
  try {
    env = await readEnv();
  } catch {
    env = null;
  }
  return (Object.keys(CONFIG) as Platform[]).map((p) => {
    const c = CONFIG[p];
    let configured = false;
    try {
      configured = Boolean(env?.secret(c.urlKey)) && Boolean(env?.secret(c.keyKey));
    } catch {
      configured = false;
    }
    return { platform: p, label: c.label, configured };
  });
}

/**
 * Envoie une charge utile à une plateforme. Effectue un vrai POST JSON signé
 * par la clé d'API. Ne lève jamais : renvoie un résultat explicite.
 */
export async function transmit(
  platform: Platform,
  path: string,
  payload: unknown,
): Promise<TransmissionResult> {
  const c = CONFIG[platform];

  let baseUrl: string;
  let apiKey: string;
  try {
    const env = await readEnv();
    baseUrl = env.secret(c.urlKey);
    apiKey = env.secret(c.keyKey);
  } catch {
    return {
      ok: false,
      status: "non_configure",
      message: `${c.label} n'est pas configurée. Ajoutez ${c.urlKey} et ${c.keyKey} dans Web Admin → Secrets.`,
    };
  }

  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* réponse non JSON : on garde le texte brut */
    }

    if (!res.ok) {
      return {
        ok: false,
        status: "refuse",
        httpStatus: res.status,
        message: `${c.label} a refusé l'envoi (HTTP ${res.status}). ${summarize(body)}`,
      };
    }

    const reference = extractReference(body);
    return {
      ok: true,
      status: "envoye",
      httpStatus: res.status,
      reference,
      message: `${c.label} : envoi accepté${reference ? ` — référence ${reference}` : ""}.`,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: "erreur_reseau",
      message: aborted
        ? `${c.label} n'a pas répondu dans les 20 secondes.`
        : `${c.label} injoignable : ${e instanceof Error ? e.message : "erreur réseau"}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return "";
  }
}

function extractReference(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  for (const k of ["reference", "ref", "id", "declarationId", "invoiceId", "uuid", "numero"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  const data = o.data;
  if (data && typeof data === "object") return extractReference(data);
  return undefined;
}

/** Construit la charge utile e-Fatoura d'une facture (format TEIF simplifié). */
export function buildEfatouraPayload(invoice: {
  number: string;
  issueDate: string;
  dueDate: string;
  partnerName: string;
  totalHt: number;
  totalVat: number;
  stampDuty: number;
  totalTtc: number;
  lines: { label: string; quantity: number; unitPrice: number; vatRate: number; lineHt: number; lineVat: number }[];
}, company: { name: string; matriculeFiscal: string; address: string }) {
  return {
    documentType: "INVOICE",
    documentNumber: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: "TND",
    seller: {
      name: company.name,
      taxIdentifier: company.matriculeFiscal,
      address: company.address,
    },
    buyer: { name: invoice.partnerName },
    lines: invoice.lines.map((l, i) => ({
      lineNumber: i + 1,
      description: l.label,
      quantity: l.quantity / 1000,
      unitPrice: l.unitPrice / 1000,
      vatRate: l.vatRate,
      lineTotalHt: l.lineHt / 1000,
      lineVat: l.lineVat / 1000,
    })),
    totals: {
      totalHt: invoice.totalHt / 1000,
      totalVat: invoice.totalVat / 1000,
      stampDuty: invoice.stampDuty / 1000,
      totalTtc: invoice.totalTtc / 1000,
    },
  };
}

/** Construit la charge utile TTN d'une déclaration. */
export function buildTtnPayload(decl: {
  kind: string;
  period: string;
  baseAmount: number;
  taxAmount: number;
}, company: { name: string; matriculeFiscal: string }) {
  return {
    declarationType: decl.kind,
    period: decl.period,
    taxpayer: { name: company.name, taxIdentifier: company.matriculeFiscal },
    baseAmount: decl.baseAmount / 1000,
    taxAmount: decl.taxAmount / 1000,
    currency: "TND",
  };
}
