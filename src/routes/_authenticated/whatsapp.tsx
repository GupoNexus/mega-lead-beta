import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Cloud,
  Hand,
  MessageCircle,
  Play,
  Plus,
  Radio,
  Save,
  Send,
  Settings2,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  addTargetsFromCrm,
  createCampaign,
  listCampaigns,
  listTargets,
} from "@/lib/whatsapp.functions";
import { saveJourneyScript } from "@/lib/journeys.functions";
import { enqueueCampaign } from "@/lib/queue.functions";
import { getConnectionHub } from "@/lib/connections.functions";
import {
  configureCampaignDelivery,
  listApprovedTemplates,
  syncMetaTemplates,
} from "@/lib/templates.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "Jornadas de conversa | MEGA LEAD" }] }),
  component: JourneysPage,
});

function JourneysPage() {
  const qc = useQueryClient();
  const campaignsFn = useServerFn(listCampaigns),
    targetsFn = useServerFn(listTargets);
  const createFn = useServerFn(createCampaign),
    addFn = useServerFn(addTargetsFromCrm);
  const launchFn = useServerFn(enqueueCampaign),
    scriptFn = useServerFn(saveJourneyScript);
  const hubFn = useServerFn(getConnectionHub),
    templatesFn = useServerFn(listApprovedTemplates),
    syncTemplatesFn = useServerFn(syncMetaTemplates),
    deliveryFn = useServerFn(configureCampaignDelivery);
  const [selected, setSelected] = useState<string | null>(null);
  const [objective, setObjective] = useState(""),
    [opening, setOpening] = useState(""),
    [instructions, setInstructions] = useState("");
  const [autoReply, setAutoReply] = useState(true);
  const [deliveryChannel, setDeliveryChannel] = useState(""),
    [deliveryTemplate, setDeliveryTemplate] = useState("");
  const campaignsQ = useQuery({ queryKey: ["wa-campaigns"], queryFn: () => campaignsFn() });
  const hubQ = useQuery({ queryKey: ["connection-hub"], queryFn: () => hubFn() });
  const templateQ = useQuery({
    queryKey: ["approved-templates", deliveryChannel],
    queryFn: () => templatesFn({ data: { channelId: deliveryChannel } }),
    enabled: !!deliveryChannel,
  });
  const campaigns = (campaignsQ.data?.campaigns ?? []) as any[];
  const active = useMemo(
    () => campaigns.find((c) => c.id === selected) ?? campaigns[0] ?? null,
    [campaigns, selected],
  );
  const targetsQ = useQuery({
    queryKey: ["wa-targets", active?.id],
    queryFn: () => targetsFn({ data: { campaign_id: active.id } }),
    enabled: !!active,
  });
  const targets = (targetsQ.data?.targets ?? []) as any[];
  useEffect(() => {
    if (!active) return;
    setObjective(active.objective ?? "Qualificar o interesse e agendar uma conversa");
    setOpening(
      active.opening_message ??
        "Olá, {nome}! Vi a {empresa} e queria entender se melhorar a prospecção comercial é uma prioridade por aí hoje.",
    );
    setInstructions(
      active.agent_instructions ??
        "Converse de forma natural e curta. Entenda o contexto, qualifique a necessidade e proponha uma conversa quando houver interesse. Faça uma pergunta por vez.",
    );
    setAutoReply(active.auto_reply ?? true);
    setDeliveryChannel(active.channel_id ?? "");
    setDeliveryTemplate(active.opening_template_id ?? "");
  }, [active?.id]);

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: `Nova jornada ${campaigns.length + 1}`,
          delay_min_seconds: 5,
          delay_max_seconds: 15,
          batch_size: 20,
          batch_pause_seconds: 60,
          scheduled_at: null,
          sync_crm: true,
          move_to_status: "contatado",
        },
      }),
    onSuccess: (r) => {
      setSelected(r.campaign.id);
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
    },
  });
  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          campaign_id: active.id,
          template_id: null,
          status_filter: ["novo"],
          only_with_phone: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.added} leads adicionados`);
      qc.invalidateQueries({ queryKey: ["wa-targets", active?.id] });
    },
  });
  const scriptM = useMutation({
    mutationFn: () =>
      scriptFn({
        data: {
          campaign_id: active.id,
          objective,
          opening_message: opening,
          agent_instructions: instructions,
          auto_reply: autoReply,
        },
      }),
    onSuccess: () => {
      toast.success("Roteiro salvo");
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
    },
  });
  const deliveryM = useMutation({
    mutationFn: () =>
      deliveryFn({
        data: { campaignId: active.id, channelId: deliveryChannel, templateId: deliveryTemplate },
      }),
    onSuccess: () => {
      toast.success("Canal e template salvos");
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha"),
  });
  const launchM = useMutation({
    mutationFn: async () => launchFn({ data: { campaignId: active.id } }),
    onSuccess: (r) => {
      toast.success(`${r.queued} mensagens enfileiradas`);
      qc.invalidateQueries({ queryKey: ["wa-targets", active?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enfileirar"),
  });
  const channel =
      (hubQ.data?.channels ?? []).find((c: any) => c.id === deliveryChannel) ??
      (hubQ.data?.channels?.[0] as any),
    live = channel?.mode === "live" && channel?.status === "connected";

  return (
    <div className="min-h-full bg-[#f4f1eb] text-[#20241f]">
      <header className="border-b border-[#d9d4ca] bg-[#f9f7f2] px-6 py-5 md:px-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#697267]">
              Central de automação
            </p>
            <h1 className="mt-1 font-sora text-2xl font-bold">Jornadas de conversa</h1>
            <p className="mt-1 text-sm text-[#6d716a]">
              Da descoberta do lead à conversa qualificada, com controle humano.
            </p>
          </div>
          <Link
            to="/conexoes"
            className="flex items-center gap-3 rounded-full border border-[#c9c3b7] bg-white px-4 py-2.5 text-sm font-semibold shadow-sm"
          >
            <span className={`size-2.5 rounded-full ${live ? "bg-[#2c8a65]" : "bg-[#d68b2d]"}`} />
            {live ? "WhatsApp Cloud ativo" : "Configurar conexão"}
            <Settings2 className="size-4" />
          </Link>
        </div>
      </header>
      <main className="p-5 md:p-8">
        <section className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["1", "Extrair", "Encontre empresas"],
            ["2", "Selecionar", "Monte seu público"],
            ["3", "Jornada", "Defina o roteiro"],
            ["4", "Conversar", "IA + humano"],
          ].map(([n, t, h], i) => (
            <div
              key={n}
              className="flex items-center gap-3 rounded-2xl border border-[#d8d2c7] bg-[#fbfaf7] p-3.5"
            >
              <span
                className={`grid size-8 place-items-center rounded-full text-xs font-bold ${i < 2 ? "bg-[#28382f] text-white" : "bg-[#e6e0d5]"}`}
              >
                {n}
              </span>
              <div>
                <div className="text-sm font-bold">{t}</div>
                <div className="text-xs text-[#7b7e77]">{h}</div>
              </div>
              {i < 3 && <ChevronRight className="ml-auto hidden size-4 text-[#aaa59d] lg:block" />}
            </div>
          ))}
        </section>
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="rounded-3xl border border-[#d8d2c7] bg-[#292f2b] p-4 text-white shadow-xl shadow-black/5">
            <div className="mb-4 flex items-center justify-between px-1">
              <div>
                <p className="text-xs text-white/55">Suas jornadas</p>
                <p className="font-bold">{campaigns.length} criadas</p>
              </div>
              <button
                onClick={() => createM.mutate()}
                className="grid size-9 place-items-center rounded-full bg-[#d9f275] text-[#20271f]"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`w-full rounded-2xl p-3.5 text-left ${c.id === active?.id ? "bg-white text-[#222822]" : "bg-white/5 hover:bg-white/10"}`}
                >
                  <div className="flex items-center gap-2">
                    <Workflow className="size-4" />
                    <span className="truncate text-sm font-bold">{c.name}</span>
                  </div>
                  <p className="mt-2 text-xs opacity-55">
                    {c.status === "rascunho" ? "Em preparação" : c.status}
                  </p>
                </button>
              ))}
              {!campaigns.length && (
                <button
                  onClick={() => createM.mutate()}
                  className="w-full rounded-2xl border border-dashed border-white/25 p-6 text-sm text-white/65"
                >
                  Criar primeira jornada
                </button>
              )}
            </div>
          </aside>
          {active ? (
            <section className="space-y-5">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Eyebrow>Público</Eyebrow>
                    <h2 className="mt-1 text-xl font-bold">{targets.length} leads selecionados</h2>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/leads"
                      className="rounded-xl border border-[#cfc9bd] px-4 py-2 text-sm font-semibold"
                    >
                      Extrair leads
                    </Link>
                    <button
                      onClick={() => addM.mutate()}
                      disabled={addM.isPending}
                      className="rounded-xl bg-[#28382f] px-4 py-2 text-sm font-semibold text-white"
                    >
                      <Users className="mr-2 inline size-4" />
                      Adicionar do CRM
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Metric
                    label="Na fila"
                    value={targets.filter((t) => !t.sent).length}
                    icon={CircleDot}
                  />
                  <Metric
                    label="Abordados"
                    value={targets.filter((t) => t.sent).length}
                    icon={Send}
                  />
                  <Metric
                    label="Em conversa"
                    value={targets.filter((t) => t.journey_status === "conversando").length}
                    icon={MessageCircle}
                  />
                </div>
              </Card>
              <Card>
                <Eyebrow>Entrega oficial</Eyebrow>
                <h2 className="mt-1 font-bold">Canal e template de abertura</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select
                    value={deliveryChannel}
                    onChange={(e) => {
                      setDeliveryChannel(e.target.value);
                      setDeliveryTemplate("");
                    }}
                    className="rounded-xl border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Selecione um número</option>
                    {(hubQ.data?.channels ?? [])
                      .filter((c: any) => c.provider === "meta" && c.status === "connected")
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.display_phone}
                        </option>
                      ))}
                  </select>
                  <select
                    value={deliveryTemplate}
                    onChange={(e) => setDeliveryTemplate(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Template aprovado</option>
                    {(templateQ.data?.templates ?? []).map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.meta_name} · {t.language}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!deliveryChannel}
                    onClick={() =>
                      syncTemplatesFn({ data: { channelId: deliveryChannel } }).then((r) => {
                        toast.success(`${r.approved} templates aprovados`);
                        templateQ.refetch();
                      })
                    }
                    className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40"
                  >
                    Sincronizar Meta
                  </button>
                  <button
                    disabled={!deliveryChannel || !deliveryTemplate || deliveryM.isPending}
                    onClick={() => deliveryM.mutate()}
                    className="rounded-xl bg-[#28382f] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Salvar entrega
                  </button>
                </div>
              </Card>
              <Card>
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-[#e7efcc]">
                    <Bot className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-bold">Roteiro da IA</h2>
                    <p className="text-xs text-[#747870]">Direção clara, conversa natural.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Field label="Objetivo da conversa" value={objective} onChange={setObjective} />
                  <Area
                    label="Mensagem interna da jornada"
                    value={opening}
                    onChange={setOpening}
                    hint="A primeira abordagem live usa obrigatoriamente o template Meta aprovado."
                  />
                  <Area
                    label="Como a IA deve conduzir"
                    value={instructions}
                    onChange={setInstructions}
                    rows={5}
                  />
                  <label className="flex items-center justify-between rounded-2xl bg-[#f0ede6] p-4">
                    <div>
                      <p className="text-sm font-bold">Respostas automáticas</p>
                      <p className="text-xs text-[#747870]">
                        Pausam em opt-out ou pedido de atendente.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoReply}
                      onChange={(e) => setAutoReply(e.target.checked)}
                      className="size-5 accent-[#28382f]"
                    />
                  </label>
                  <button
                    onClick={() => scriptM.mutate()}
                    className="flex items-center gap-2 rounded-xl border border-[#cfc9bd] px-4 py-2.5 text-sm font-bold"
                  >
                    <Save className="size-4" />
                    Salvar roteiro
                  </button>
                </div>
              </Card>
            </section>
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-[#c9c3b7]">
              <button
                onClick={() => createM.mutate()}
                className="rounded-2xl bg-[#28382f] px-6 py-3 font-bold text-white"
              >
                Criar primeira jornada
              </button>
            </div>
          )}
          <aside className="space-y-5">
            <div className="rounded-3xl bg-[#d9f275] p-5 text-[#20271f] shadow-xl">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Radio className="size-4" />
                Pronto para iniciar
              </div>
              <p className="mt-3 font-sora text-3xl font-bold">
                {targets.filter((t) => !t.sent).length}
              </p>
              <p className="text-sm">novas conversas na fila</p>
              <button
                onClick={() => launchM.mutate()}
                disabled={!targets.some((t) => !t.sent) || launchM.isPending}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#253029] py-3.5 text-sm font-bold text-white disabled:opacity-40"
              >
                <Play className="size-4" />
                {launchM.isPending ? "Iniciando..." : "Iniciar jornadas"}
              </button>
              {!live && (
                <p className="mt-3 text-center text-[11px] font-medium opacity-70">
                  Demonstração: nenhuma mensagem real será enviada.
                </p>
              )}
            </div>
            <Card>
              <h3 className="font-bold">Regras de segurança</h3>
              <div className="mt-4 space-y-3 text-sm">
                <Rule icon={Bot} text="IA segue o roteiro" />
                <Rule icon={Hand} text="Pedido de humano pausa a IA" />
                <Rule icon={Check} text="Opt-out encerra imediatamente" />
                <Rule icon={Cloud} text="Webhook funciona com o app fechado" />
              </div>
              <Link
                to="/inbox"
                className="mt-5 block rounded-xl bg-[#f0ede6] py-3 text-center text-sm font-bold"
              >
                Abrir conversas
              </Link>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-[#d8d2c7] bg-[#fbfaf7] p-5 md:p-6">{children}</div>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-[#7a7d75]">{children}</p>;
}
function Metric({ label, value, icon: Icon }: any) {
  return (
    <div className="rounded-2xl bg-[#f0ede6] p-3">
      <Icon className="size-4 text-[#747a70]" />
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-xs text-[#777a74]">{label}</p>
    </div>
  );
}
function Rule({ icon: Icon, text }: any) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-[#ece8df]">
        <Icon className="size-4" />
      </span>
      <span>{text}</span>
    </div>
  );
}
function Field({ label, value, onChange }: any) {
  return (
    <label className="block">
      <Eyebrow>{label}</Eyebrow>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-[#d4cec2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#52634f]"
      />
    </label>
  );
}
function Area({ label, value, onChange, hint, rows = 3 }: any) {
  return (
    <label className="block">
      <Eyebrow>{label}</Eyebrow>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full resize-none rounded-xl border border-[#d4cec2] bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-[#52634f]"
      />
      {hint && <span className="mt-1 block text-[11px] text-[#888b84]">{hint}</span>}
    </label>
  );
}
