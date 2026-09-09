import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminListSales } from "@/lib/billing.functions";
import { formatBRL } from "@/lib/plans";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel Admin — Mega Lead" },
      { name: "description", content: "Painel administrativo de vendas do Mega Lead." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const salesFn = useServerFn(adminListSales);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const salesQ = useQuery({
    queryKey: ["admin-sales", status, search],
    queryFn: () => salesFn({ data: { status, search } }),
    enabled: session === true,
    retry: false,
  });

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  }

  if (session === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 px-6 font-inter">
        <form
          onSubmit={login}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4"
        >
          <h1 className="font-sora font-extrabold text-xl text-white text-center">Painel Admin</h1>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do administrador"
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white py-3 rounded-xl font-bold disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  if (salesQ.isError) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 px-6 text-center font-inter">
        <div>
          <p className="text-slate-300 mb-4">
            {salesQ.error instanceof Error ? salesQ.error.message : "Acesso negado"}
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-brand font-semibold underline"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  const stats = salesQ.data?.stats;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-inter p-4 sm:p-8">
      <header className="max-w-7xl mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 mb-6">
        <h1 className="font-sora font-extrabold text-xl sm:text-2xl truncate">
          Painel Admin — Vendas
        </h1>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => salesQ.refetch()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700"
            aria-label="Atualizar"
          >
            <RefreshCw className={`size-4 ${salesQ.isFetching ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700"
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Faturamento", value: formatBRL(stats?.revenueCents ?? 0) },
          { label: "Vendas pagas", value: stats?.paidCount ?? 0 },
          { label: "Pendentes", value: stats?.pendingCount ?? 0 },
          { label: "Assinaturas ativas", value: stats?.activeSubs ?? 0 },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="font-sora font-extrabold text-xl sm:text-2xl mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto flex flex-wrap gap-2 mb-4">
        {["all", "paid", "pending"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${
              status === s ? "bg-brand text-white" : "bg-slate-900 border border-slate-800"
            }`}
          >
            {s === "all" ? "Todos" : s === "paid" ? "Pagos" : "Pendentes"}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por e-mail"
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm min-w-0 flex-1"
        />
      </div>

      <div className="max-w-7xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-left text-slate-500 border-b border-slate-800">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Plano</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Transação</th>
            </tr>
          </thead>
          <tbody>
            {(salesQ.data?.payments ?? []).map((p) => (
              <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                <td className="p-3">{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3">{p.customer_name}</td>
                <td className="p-3">{p.customer_email}</td>
                <td className="p-3 capitalize">{p.plan}</td>
                <td className="p-3">{formatBRL(p.amount_cents)}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      p.status === "paid"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {p.status === "paid" ? "Pago" : "Pendente"}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{p.transaction_id?.slice(0, 12)}</td>
              </tr>
            ))}
            {(salesQ.data?.payments.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  Nenhuma venda encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
