import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Mega Lead" },
      { name: "description", content: "Acesse sua conta no Mega Lead." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: window.megaLeadDesktop ? "/leads" : "/download" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: window.megaLeadDesktop ? "/leads" : "/download" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) toast.success("Conta criada. Seu download está liberado.");
        else toast.success("Conta criada. Confirme o e-mail para entrar e baixar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12 font-inter">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="block text-center text-2xl font-sora font-extrabold text-brand italic mb-8"
        >
          MEGA LEAD
        </Link>
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
          <h1 className="text-2xl font-sora font-bold text-center mb-2">
            {mode === "login" ? "Entrar na sua conta" : "Criar conta grátis"}
          </h1>
          <p className="text-center text-slate-500 text-sm mb-6">
            {mode === "login" ? "Bem-vindo de volta!" : "Comece a extrair leads em minutos."}
          </p>


          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Nome</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como quer ser chamado"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-3 rounded-xl font-bold hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-center text-sm text-slate-500 mt-6 hover:text-brand"
          >
            {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
