import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeads } from "@/lib/scrape.functions";
import { MapPin, TrendingUp, MessageCircle, ArrowRight } from "lucide-react";
import { getMessagingMetrics } from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mega Lead" }] }),
  component: Dashboard,
});

function Dashboard() {
  const listFn = useServerFn(listLeads);
  const metricsFn = useServerFn(getMessagingMetrics);
  const { data } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const leads = data?.leads ?? [];
  const { data: messaging } = useQuery({ queryKey: ["messaging-metrics"], queryFn: () => metricsFn() });

  const total = leads.length;
  const contatados = leads.filter((l) => l.status !== "novo").length;
  const convertidos = leads.filter((l) => l.status === "convertido").length;

  const stats = [
    { label: "Leads capturados", value: total, icon: MapPin, color: "bg-brand" },
    { label: "Em processo", value: contatados, icon: MessageCircle, color: "bg-blue-500" },
    { label: "Convertidos", value: convertidos, icon: TrendingUp, color: "bg-emerald-500" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-sora font-extrabold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Visão geral da sua prospecção.</p>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white p-6 rounded-2xl border border-slate-100">
            <div className={`size-10 ${color} rounded-lg grid place-items-center text-white mb-4`}>
              <Icon className="size-5" />
            </div>
            <div className="text-3xl font-sora font-extrabold text-slate-900">{value}</div>
            <div className="text-sm text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-bold">Operação WhatsApp</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Enviadas', messaging?.sent ?? 0], ['Entregues', messaging?.delivered ?? 0], ['Lidas', messaging?.read ?? 0], ['Respostas', messaging?.inbound ?? 0], ['Falhas', messaging?.failed ?? 0], ['Opt-outs', messaging?.optOut ?? 0], ['Handoffs', messaging?.handoff ?? 0]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}
      </div>

      <Link
        to="/leads"
        className="bg-brand text-white px-6 py-4 rounded-xl font-bold inline-flex items-center gap-2 hover:bg-brand-dark transition-colors"
      >
        Ir para o Scraper <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
