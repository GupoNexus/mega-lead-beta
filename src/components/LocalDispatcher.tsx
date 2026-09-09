import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MessageCircle, Pause, Play, Search, Send, Settings2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { useWaBridge } from "@/hooks/useWaBridge";
import { listLeads } from "@/lib/scrape.functions";
import { pauseLocalQueue, resumeLocalQueue } from "@/lib/wa-bridge";

type Bridge = ReturnType<typeof useWaBridge>;
type LocalLead = { id: string; name: string; phone: string | null; city?: string | null; state?: string | null; status?: string };
type DispatcherConfig = { scripts: string[]; minDelay: number; maxDelay: number; batchSize: number; batchPause: number; dailyLimit: number };

export const DISPATCHER_KEY = "mega-lead:local-dispatcher:v1";
const DISCARDED_KEY = "mega-lead:dispatcher-discarded:v1";
const DEFAULT_CONFIG: DispatcherConfig = {
  scripts: [
    "Olá, {nome}! Tudo bem? Vi a {empresa} no Google e gostaria de conversar rapidamente.",
    "Oi, {nome}! Encontrei a {empresa} e acredito que podemos ajudar a gerar novas oportunidades. Posso explicar em dois minutos?",
    "Olá! Falo com a pessoa responsável pela {empresa}? Tenho uma ideia objetiva para aumentar a prospecção comercial de vocês.",
  ],
  minDelay: 5,
  maxDelay: 15,
  batchSize: 10,
  batchPause: 60,
  dailyLimit: 200,
};

function loadConfig(): DispatcherConfig {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(DISPATCHER_KEY) || "{}") }; }
  catch { return DEFAULT_CONFIG; }
}

export function LocalDispatcher({ bridge, onConversations, onConnect }: { bridge: Bridge; onConversations: () => void; onConnect: () => void }) {
  const listLeadsFn = useServerFn(listLeads);
  const leadsQ = useQuery({ queryKey: ["leads", "local-dispatcher"], queryFn: () => listLeadsFn() });
  const leads = ((leadsQ.data?.leads ?? []) as LocalLead[]).filter((lead) => lead.phone);
  const initializedSelection = useRef(false);
  const [discarded, setDiscarded] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(DISCARDED_KEY) || "[]")); } catch { return new Set(); } });
  const availableLeads = useMemo(() => leads.filter((lead) => !discarded.has(lead.id) && lead.status !== "descartado"), [leads, discarded]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState(loadConfig);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const visible = useMemo(() => availableLeads.filter((lead) => `${lead.name} ${lead.phone} ${lead.city}`.toLowerCase().includes(search.toLowerCase())), [availableLeads, search]);
  const selectedCount = availableLeads.filter((lead) => selected.has(lead.id)).length;
  const pendingJobs = bridge.status.jobs ?? [];

  useEffect(() => {
    if (initializedSelection.current || !leads.length) return;
    initializedSelection.current = true;
    setSelected(new Set());
  }, [leads]);

  function updateConfig(next: DispatcherConfig) {
    setConfig(next);
    localStorage.setItem(DISPATCHER_KEY, JSON.stringify(next));
  }

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function discard(id: string) {
    setDiscarded((current) => { const next = new Set(current).add(id); localStorage.setItem(DISCARDED_KEY, JSON.stringify([...next])); return next; });
    setSelected((current) => { const next = new Set(current); next.delete(id); return next; });
    toast.success("Lead removido deste público", { description: "O cadastro continua disponível no CRM." });
  }

  async function start() {
    if (!bridge.status.connected) return toast.error("Conecte o WhatsApp por QR antes de iniciar");
    const targets = availableLeads.filter((lead) => selected.has(lead.id));
    const scripts = config.scripts.map((script) => script.trim()).filter(Boolean);
    if (!targets.length) return toast.error("Selecione pelo menos um lead");
    if (!scripts.length) return toast.error("Cadastre pelo menos uma mensagem");
    if (sending || bridge.status.queued > 0) return toast.error("Aguarde ou cancele a fila atual antes de iniciar outra.");
    setSending(true);
    setProgress({ done: 0, total: targets.length });
    try {
      for (let index = 0; index < targets.length; index++) {
        const lead = targets[index];
        const firstName = lead.name.split(/\s+/)[0] || lead.name;
        const message = scripts[index % scripts.length]
          .replaceAll("{nome}", firstName)
          .replaceAll("{empresa}", lead.name);
        await bridge.send({
          phone: lead.phone!, message, name: lead.name, leadId: lead.id,
          minDelaySeconds: config.minDelay, maxDelaySeconds: config.maxDelay,
          dailyLimit: config.dailyLimit, batchSize: config.batchSize, batchPauseSeconds: config.batchPause, batchPosition: index + 1,
        });
        setProgress({ done: index + 1, total: targets.length });
      }
      await bridge.refresh();
      toast.success(`${targets.length} mensagens adicionadas à fila`);
    } catch (error) {
      toast.error("Falha ao montar a fila", { description: (error as Error).message });
    } finally { setSending(false); }
  }

  return <div className="dispatcher min-h-full bg-[#07101d] p-5 text-slate-100 md:p-7">
    <header className="mx-auto mb-5 flex max-w-[1700px] flex-wrap items-center gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.22em] text-blue-400">Central de disparos</p><h1 className="font-sora text-3xl font-extrabold">WhatsApp em um clique</h1><p className="text-sm text-slate-400">Selecione os leads, ajuste as mensagens e envie sem sair do Mega Lead.</p></div>
      <button onClick={onConnect} className="ml-auto flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold"><span className={`size-2 rounded-full ${bridge.status.connected ? "bg-emerald-400" : "bg-amber-400"}`} />{bridge.status.connected ? "WhatsApp conectado" : "Conectar WhatsApp"}</button>
    </header>
    <div className="mx-auto grid max-w-[1700px] gap-5 xl:grid-cols-[minmax(360px,.85fr)_minmax(480px,1.25fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 p-4"><div className="flex items-center justify-between"><div><b>Público do CRM</b><p className="text-xs text-slate-400">{selectedCount} de {availableLeads.length} selecionados</p></div><button onClick={() => setSelected(selectedCount === availableLeads.length ? new Set() : new Set(availableLeads.map((lead) => lead.id)))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold">{selectedCount === availableLeads.length ? "Limpar" : "Selecionar todos"}</button></div><div className="relative mt-3"><Search className="absolute left-3 top-2.5 size-4 text-slate-500"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa ou telefone" className="w-full rounded-xl border border-slate-700 bg-[#0b1625] py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div></div>
        <div className="max-h-[620px] overflow-y-auto">{leadsQ.isError && <button onClick={() => void leadsQ.refetch()} className="p-4 text-red-600">Não foi possível carregar os leads. Tentar novamente.</button>}{leadsQ.isLoading && <div className="p-8 text-center text-sm text-slate-400">Carregando leads...</div>}{visible.map((lead) => <div key={lead.id} className="flex items-center gap-3 border-b border-slate-800 p-3 hover:bg-slate-800"><button onClick={() => toggle(lead.id)} className={`grid size-5 shrink-0 place-items-center rounded border ${selected.has(lead.id) ? "border-blue-500 bg-blue-500" : "border-slate-600"}`}>{selected.has(lead.id) && <Check className="size-3"/>}</button><button onClick={() => toggle(lead.id)} className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{lead.name}</b><small className="text-slate-400">{lead.phone} · {[lead.city, lead.state].filter(Boolean).join("/")}</small></button><button onClick={() => discard(lead.id)} title="Remover deste público" className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="size-4"/></button></div>)}{!leadsQ.isLoading && !availableLeads.length && <div className="p-10 text-center text-sm text-slate-400"><Users className="mx-auto mb-2"/>Extraia leads com telefone primeiro.</div>}</div>
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div><b>Abordagens para disparo</b><p className="text-xs text-slate-400">As mensagens alternam automaticamente. Use {"{nome}"} e {"{empresa}"} para personalizar.</p></div>
        {config.scripts.map((script, index) => <label key={index} className="block"><span className="mb-1 block text-xs font-bold text-blue-400">Mensagem {index + 1}</span><textarea value={script} onChange={(e) => { const scripts=[...config.scripts]; scripts[index]=e.target.value; updateConfig({...config,scripts}); }} rows={4} className="w-full resize-none rounded-xl border border-slate-700 bg-[#0b1625] p-3 text-sm leading-relaxed outline-none focus:border-blue-500"/></label>)}
        <button onClick={() => updateConfig({...config,scripts:[...config.scripts,""]})} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold">+ Nova abordagem</button>
      </section>
      <aside className="space-y-4">
        {bridge.status.queued > 0 && <button className="w-full rounded-xl border p-3 font-bold" onClick={async () => { try { await (bridge.status.paused ? resumeLocalQueue() : pauseLocalQueue()); await bridge.refresh(); } catch (e) { toast.error((e as Error).message); } }}>{bridge.status.paused ? "Retomar fila pausada" : "Pausar fila"} · {bridge.status.queued} pendentes</button>}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-center gap-2"><Settings2 className="size-4 text-blue-400"/><b>Configurações</b></div><div className="mt-4 grid grid-cols-2 gap-3"><NumberField label="Delay mínimo (s)" value={config.minDelay} onChange={(minDelay) => updateConfig({...config,minDelay})}/><NumberField label="Delay máximo (s)" value={config.maxDelay} onChange={(maxDelay) => updateConfig({...config,maxDelay})}/><NumberField label="Mensagens/lote" value={config.batchSize} onChange={(batchSize) => updateConfig({...config,batchSize})}/><NumberField label="Pausa do lote (s)" value={config.batchPause} onChange={(batchPause) => updateConfig({...config,batchPause})}/><div className="col-span-2"><NumberField label="Limite diário" value={config.dailyLimit} onChange={(dailyLimit) => updateConfig({...config,dailyLimit})}/></div></div></section>
        <section className="rounded-2xl border border-blue-500/30 bg-blue-600/10 p-5"><div className="flex justify-between text-sm"><span>Selecionados</span><b>{selectedCount}</b></div><div className="mt-2 flex justify-between text-sm"><span>Na fila</span><b>{bridge.status.queued ?? 0}</b></div>{progress.total > 0 && <div className="mt-3 h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{width:`${progress.done/progress.total*100}%`}}/></div>}<button onClick={() => void start()} disabled={sending || bridge.status.queued > 0 || !selectedCount || !bridge.status.connected} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold disabled:opacity-40">{sending ? <Pause className="size-4"/> : <Play className="size-4"/>}{sending ? `Montando fila ${progress.done}/${progress.total}` : "Iniciar disparo"}</button>{!bridge.status.connected && <p className="mt-2 text-center text-xs text-amber-300">Conecte o QR para liberar o disparo.</p>}</section>
        {pendingJobs.length > 0 && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><b className="text-sm">Fila atual</b><div className="mt-3 max-h-56 space-y-2 overflow-auto">{pendingJobs.map((job) => <div key={job.id} className="flex items-center gap-2 rounded-lg bg-[#0b1625] p-2 text-xs"><Send className="size-3 text-blue-400"/><span className="min-w-0 flex-1 truncate">{job.phone}</span><button onClick={() => bridge.cancelJob(job.id)} title="Cancelar"><Trash2 className="size-4 text-rose-400"/></button></div>)}</div></section>}
        <button onClick={onConversations} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-3 text-sm font-bold"><MessageCircle className="size-4"/>Voltar às conversas</button>
      </aside>
    </div>
  </div>;
}

function NumberField({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}) { return <label className="text-xs text-slate-400">{label}<input type="number" min={0} value={value} onChange={(e)=>onChange(Math.max(0,Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1625] px-2 py-2 text-sm text-white"/></label>; }
