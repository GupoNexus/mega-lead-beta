export type PlanId = "diario" | "mensal" | "trimestral" | "anual";

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  days: number;
  label: string;
  highlight?: boolean;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "diario",
    name: "Diário",
    priceCents: 990,
    days: 1,
    label: "/dia",
    features: ["Acesso completo por 24h", "Scraper Google Maps", "CRM + WhatsApp"],
  },
  {
    id: "mensal",
    name: "Mensal",
    priceCents: 4700,
    days: 30,
    label: "/mês",
    highlight: true,
    features: [
      "Acesso completo por 30 dias",
      "Scraper Google Maps premium",
      "CRM + Financeiro",
      "Disparos WhatsApp",
    ],
  },
  {
    id: "trimestral",
    name: "Trimestral",
    priceCents: 9900,
    days: 90,
    label: "/3 meses",
    features: ["Acesso completo por 90 dias", "Tudo do mensal", "Economia de 30%"],
  },
  {
    id: "anual",
    name: "Anual",
    priceCents: 20000,
    days: 365,
    label: "/ano",
    features: ["Acesso completo por 365 dias", "Tudo do mensal", "Melhor custo-benefício"],
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
