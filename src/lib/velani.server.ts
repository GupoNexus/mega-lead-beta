const BASE_URL = "https://api.velanipagamentos.com.br/api/v1/api-gateway";

function apiKey(): string {
  const key = process.env["VELANI_SECRET_KEY"];
  if (!key) throw new Error("VELANI_SECRET_KEY não configurada");
  return key;
}

export type VelaniTransaction = {
  id?: string;
  status?: string;
  amount?: number;
  pixQrCode?: string;
  pixQrCodeImage?: string;
  expiresAt?: string;
  externalId?: string;
  [k: string]: unknown;
};

async function request(path: string, init?: RequestInit): Promise<VelaniTransaction> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: VelaniTransaction; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Erro Velani (${res.status})`);
  }
  return json?.data ?? ({} as VelaniTransaction);
}

export function createPixTransaction(input: {
  amountCents: number;
  title: string;
  externalId: string;
  postbackUrl: string;
  customer: { name: string; email: string; document: string };
}): Promise<VelaniTransaction> {
  return request("/v1/transactions", {
    method: "POST",
    body: JSON.stringify({
      paymentMethod: "pix",
      amount: input.amountCents,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: { type: "cpf", number: input.customer.document },
      },
      items: [{ title: input.title, unitPrice: input.amountCents, quantity: 1 }],
      postbackUrl: input.postbackUrl,
      externalId: input.externalId,
    }),
  });
}

export function getTransaction(id: string): Promise<VelaniTransaction> {
  return request(`/v1/transactions/${id}`, { method: "GET" });
}
