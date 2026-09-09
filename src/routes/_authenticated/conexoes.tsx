import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Cloud, Loader2, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import {
  completeEmbeddedSignup,
  getConnectionHub,
  testMetaChannel,
} from "@/lib/connections.functions";
import { toast } from "sonner";
import { WaConnectionCard } from "@/components/WaConnectionCard";
import { useWaBridge } from "@/hooks/useWaBridge";
import { GooglePlacesSettings } from "@/components/GooglePlacesSettings";

export const Route = createFileRoute("/_authenticated/conexoes")({ component: ConnectionsPage });

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

async function loadFacebook(appId: string) {
  if (window.FB) return window.FB;
  await new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v23.0" });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.onerror = () => reject(new Error("Falha ao carregar SDK Meta"));
    document.head.appendChild(script);
  });
  return window.FB;
}

function ConnectionsPage() {
  const wa = useWaBridge();
  const hubFn = useServerFn(getConnectionHub),
    completeFn = useServerFn(completeEmbeddedSignup),
    testFn = useServerFn(testMetaChannel);
  const qc = useQueryClient();
  const hubQ = useQuery({ queryKey: ["connection-hub"], queryFn: () => hubFn() });
  const healthQ = useQuery({
    queryKey: ["backend-health"],
    queryFn: async () => {
      const r = await fetch("/api/public/health");
      if (!r.ok) throw new Error("Backend indisponível");
      return r.json();
    },
    retry: false,
  });
  const completeM = useMutation({
    mutationFn: (v: { code: string; wabaId: string; phoneNumberId: string }) =>
      completeFn({ data: v }),
    onSuccess: () => {
      toast.success("Número Meta conectado");
      qc.invalidateQueries({ queryKey: ["connection-hub"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na conexão"),
  });
  const startSignup = async () => {
    const meta = hubQ.data?.meta;
    if (!meta?.configured || !meta.appId || !meta.configId)
      return toast.error("Configure META_APP_ID, META_CONFIG_ID e META_APP_SECRET no backend");
    const FB = await loadFacebook(meta.appId);
    const embedded = new Promise<{ wabaId: string; phoneNumberId: string }>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Tempo esgotado aguardando os dados do número"));
      }, 120_000);
      const handler = (event: MessageEvent) => {
        try {
          const d = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
          const wabaId = d.data?.waba_id,
            phoneNumberId = d.data?.phone_number_id;
          if (wabaId && phoneNumberId) {
            window.clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve({ wabaId, phoneNumberId });
          }
        } catch {}
      };
      window.addEventListener("message", handler);
    });
    const login = new Promise<any>((resolve) =>
      FB.login(resolve, {
        config_id: meta.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      }),
    );
    try {
      const [response, ids] = await Promise.all([login, embedded]);
      const code = response?.authResponse?.code;
      if (!code) throw new Error("A Meta não retornou o código de autorização");
      completeM.mutate({ code, ...ids });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no Embedded Signup");
    }
  };
  const channels = hubQ.data?.channels ?? [],
    caps = healthQ.data?.capabilities;
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <GooglePlacesSettings />
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-slate-500">
          Configuração segura
        </p>
        <h1 className="mt-2 font-sora text-3xl font-extrabold">Configurações</h1>
        <p className="mt-2 text-slate-600">
          Gerencie suas integrações e preferências. A sessão WhatsApp e a chave do extrator são armazenadas neste computador.
        </p>
      </div>
      <div className="mb-6 rounded-2xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <span
            className={`size-3 rounded-full ${healthQ.isSuccess && caps?.serviceRole ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <div>
            <p className="font-bold">Backend {healthQ.isSuccess ? "respondendo" : "pendente"}</p>
            <p className="text-sm text-slate-500">
              {hubQ.data?.backendUrl ||
                "Serviços locais do Mega Lead."}
            </p>
          </div>
          <button onClick={() => healthQ.refetch()} className="ml-auto rounded-xl border p-2">
            <RefreshCw className="size-4" />
          </button>
        </div>
        {caps && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
            {Object.entries(caps).map(([k, v]) => (
              <div
                key={k}
                className={`rounded-lg p-2 ${v ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
              >
                {v ? "✓" : "○"} {k}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6">
          <Cloud className="size-7 text-blue-600" />
          <h2 className="mt-4 text-xl font-bold">Meta oficial</h2>
          <p className="mt-2 text-sm text-slate-600">
            Embedded Signup conecta WABA e número, valida permissões e inscreve o webhook.
          </p>
          <button
            onClick={startSignup}
            disabled={completeM.isPending || !hubQ.data?.meta.configured}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-40"
          >
            {completeM.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Conectar com a Meta
          </button>
          {!hubQ.data?.meta.configured && (
            <p className="mt-3 flex gap-2 text-xs text-amber-700">
              <ShieldAlert className="size-4 shrink-0" />
              Credenciais Meta pendentes no backend.
            </p>
          )}
        </section>
        <div className="md:col-span-2"><WaConnectionCard status={wa.status} checking={wa.checking} onRefresh={wa.refresh} onConnect={wa.connect} onPair={wa.pair} onDisconnect={wa.disconnect} /></div>
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Números conectados</h2>
        <div className="space-y-3">
          {channels.map((c: any) => (
            <div key={c.id} className="flex items-center rounded-2xl border bg-white p-4">
              <div>
                <p className="font-bold">{c.name || c.display_phone || "Canal Meta"}</p>
                <p className="text-xs text-slate-500">
                  {c.display_phone} · {c.status} · {c.provider}
                </p>
                {c.last_error && <p className="mt-1 text-xs text-red-600">{c.last_error}</p>}
              </div>
              <button
                onClick={() =>
                  testFn({ data: { channelId: c.id } })
                    .then(() => toast.success("Canal validado"))
                    .catch((e) => toast.error(e.message))
                }
                className="ml-auto rounded-xl border px-3 py-2 text-sm font-bold"
              >
                Testar
              </button>
            </div>
          ))}
          {!channels.length && (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
              Nenhum número conectado.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
