import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { scrapeGoogleMaps, listLeads, updateLeadStatus } from "@/lib/scrape.functions";
import { generateLeadBriefing, type LeadBriefing } from "@/lib/briefing.functions";

import { openWhatsApp } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search, Phone, Globe, MapPin, Star, MessageCircle, Loader2, Trash2, RotateCcw,
  Users, Building2, TrendingUp, X, Briefcase, Download, Sparkles, Copy, ChevronLeft, ChevronRight,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Prospecção — Mega Lead" }] }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  formatted_address: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  category: string | null;
  website: string | null;
  rating: number | null;
  user_rating_count: number | null;
  google_maps_uri: string | null;
  status: string;
  created_at?: string;
};

type SortKey = "recent" | "name" | "rating" | "reviews";

const STATUS_OPTIONS = ["novo", "contatado", "em_negociacao", "convertido", "descartado"] as const;
const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  em_negociacao: "Em negociação",
  convertido: "Convertido",
  descartado: "Descartado",
};

const BR_STATES = [
  { uf: "AC", name: "Acre" }, { uf: "AL", name: "Alagoas" }, { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" }, { uf: "BA", name: "Bahia" }, { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" }, { uf: "ES", name: "Espírito Santo" }, { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" }, { uf: "MT", name: "Mato Grosso" }, { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" }, { uf: "PA", name: "Pará" }, { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" }, { uf: "PE", name: "Pernambuco" }, { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" }, { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" }, { uf: "RO", name: "Rondônia" }, { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" }, { uf: "SP", name: "São Paulo" }, { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

function LeadsPage() {
  const [segment, setSegment] = useState("");
  const [state, setState] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [neighborhoodInput, setNeighborhoodInput] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [page, setPage] = useState(0);
  const [websiteFilter, setWebsiteFilter] = useState<"todos" | "sem_site" | "com_site">("sem_site");
  const [phoneOnly, setPhoneOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("todas");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [minRating, setMinRating] = useState(0);
  useEffect(() => setPage(0), [statusFilter, websiteFilter, phoneOnly, search, cityFilter, sortBy, minRating]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [briefings, setBriefings] = useState<LeadBriefing[]>([]);
  const [briefingIndex, setBriefingIndex] = useState(0);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingProgress, setBriefingProgress] = useState<{ done: number; total: number } | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<"idle" | "starting" | "running" | "success" | "error">("idle");
  const [scrapeMessage, setScrapeMessage] = useState("");
  const qc = useQueryClient();

  const briefingFn = useServerFn(generateLeadBriefing);

  async function runBriefings(leadIds: string[]) {
    if (leadIds.length === 0) return;
    setBriefingBusy(true);
    setBriefings([]);
    setBriefingIndex(0);
    setBriefingProgress({ done: 0, total: leadIds.length });
    setBriefingOpen(true);
    const results: LeadBriefing[] = [];
    for (let i = 0; i < leadIds.length; i++) {
      try {
        const r = await briefingFn({ data: { leadId: leadIds[i] } });
        results.push(r);
        setBriefings([...results]);
        setBriefingProgress({ done: i + 1, total: leadIds.length });
      } catch (e) {
        toast.error(`Falha no briefing ${i + 1}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    setBriefingBusy(false);
    if (results.length === 0) {
      setBriefingOpen(false);
      toast.error("Nenhum briefing gerado.");
    }
  }


  const scrapeFn = useServerFn(scrapeGoogleMaps);
  const listFn = useServerFn(listLeads);
  const updateFn = useServerFn(updateLeadStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listFn(),
  });
  const backendHealthQ = useQuery({ queryKey: ["backend-health"], queryFn: async () => { const r = await fetch("/api/public/health"); if (!r.ok) throw new Error("Backend indisponível"); return r.json() as Promise<{ capabilities?: { googlePlaces?: boolean } }> }, retry: false });
  const extractionReady = backendHealthQ.data?.capabilities?.googlePlaces === true;


  const scrape = useMutation({
    mutationFn: (input: { segment: string; state: string | null; cities: string[]; neighborhoods: string[]; maxResultsPerCity: number }) =>
      scrapeFn({ data: input }),
    onMutate: () => {
      setScrapeStatus("running");
      setScrapeMessage("Busca enviada. Estou consultando os leads agora...");
      toast.loading("Prospecção iniciada...", { id: "scrape-google-maps" });
    },
    onSuccess: async (res) => {
      if (res.count === 0) {
        toast.info("Nenhum lead novo encontrado.", { id: "scrape-google-maps" });
        setScrapeMessage("Busca concluída, mas não encontrei leads novos para esses parâmetros.");
      } else if (res.requested && res.count < res.requested) {
        const message = `${res.count} leads novos capturados (máximo disponível para esta busca).`;
        toast.success(message, { id: "scrape-google-maps" });
        setScrapeMessage(message);
      } else {
        const message = `${res.count} leads capturados!`;
        toast.success(message, { id: "scrape-google-maps" });
        setScrapeMessage(message);
      }
      setScrapeStatus("success");
      await qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Erro ao prospectar";
      setScrapeStatus("error");
      setScrapeMessage(message);
      toast.error(message, { id: "scrape-google-maps" });
    },
  });


  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e) => toast.error("Não foi possível atualizar o lead", { description: e.message }),
  });

  function addCity(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setCities((prev) => Array.from(new Set([...prev, ...parts])));
    setCityInput("");
  }

  function addNeighborhood(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setNeighborhoods((prev) => Array.from(new Set([...prev, ...parts])));
    setNeighborhoodInput("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!segment.trim()) {
      setScrapeStatus("error");
      setScrapeMessage("Preencha o segmento de atuação antes de iniciar.");
      toast.error("Informe o segmento de atuação");
      return;
    }
    setScrapeStatus("starting");
    setScrapeMessage("Clique recebido. Preparando a busca...");
    scrape.mutate({
      segment: segment.trim(),
      state: state || null,
      cities,
      neighborhoods,
      maxResultsPerCity: maxResults,
    });
  }


  function leadValues(l: Lead): string[] {
    return [
      l.name,
      l.phone ?? "",
      l.formatted_address ?? "",
      (l as Lead & { neighborhood?: string | null }).neighborhood ?? "",
      l.city ?? "",
      l.state ?? "",
      l.category ?? "",
      l.website ?? "",
      l.rating?.toString() ?? "",
      l.user_rating_count?.toString() ?? "",
      STATUS_LABELS[l.status] ?? l.status,
      l.google_maps_uri ?? "",
    ];
  }

  function exportCsv(rows: Lead[]) {
    if (rows.length === 0) return;
    const headers = ["Empresa", "Telefone", "Endereco", "Bairro", "Cidade", "Estado", "Nicho", "Website", "Rating", "Avaliacoes", "Status", "Google Maps"];
    const SEP = ";";
    const stripAccents = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/~/g, "");
    const esc = (v: string) => {
      const s = stripAccents(String(v ?? ""));
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (arr: string[]) => arr.map(esc).join(SEP);
    // Preenche a "linha de seção" com colunas vazias pra manter o alinhamento
    const pad = (arr: string[]) =>
      arr.length >= headers.length ? arr : [...arr, ...Array(headers.length - arr.length).fill("")];

    const lines: string[] = [];
    lines.push(`sep=${SEP}`); // dica pro Excel usar ; como separador

    for (const status of STATUS_OPTIONS) {
      const subset = rows.filter((l) => l.status === status);
      if (subset.length === 0) continue;
      const label = STATUS_LABELS[status] ?? status;
      lines.push(line(pad([`── ${label.toUpperCase()} (${subset.length}) ──`])));
      lines.push(line(headers));
      for (const l of subset) lines.push(line(leadValues(l)));
      lines.push(line(pad([""]))); // linha em branco alinhada
    }

    const csv = lines.join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    let segLabel = segment.trim();
    if (!segLabel) {
      const counts = new Map<string, number>();
      for (const l of rows) {
        const c = (l.category ?? "").trim();
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      segLabel = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
    const segPart = slug(segLabel);
    const datePart = new Date().toISOString().slice(0, 10);
    a.download = segPart ? `leads-${segPart}-${datePart}.csv` : `leads-${datePart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }





  const leads = (data?.leads ?? []) as Lead[];

  // Alguns leads colocam Instagram/Facebook/Linktree no campo "site" do Google.
  // Para prospecção, isso conta como "sem site real".
  const SOCIAL_HOSTS = [
    "instagram.com",
    "facebook.com",
    "fb.com",
    "fb.me",
    "m.facebook.com",
    "linktr.ee",
    "linktree.com",
    "wa.me",
    "api.whatsapp.com",
    "whatsapp.com",
    "tiktok.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "threads.net",
    "t.me",
    "telegram.me",
  ];
  function hasRealWebsite(l: Lead): boolean {
    const w = (l.website ?? "").trim().toLowerCase();
    if (!w) return false;
    try {
      const host = new URL(w.startsWith("http") ? w : `https://${w}`).hostname.replace(/^www\./, "");
      return !SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return true;
    }
  }

  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.city) s.add(l.city);
    return Array.from(s).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let out = leads;
    if (statusFilter !== "todos") out = out.filter((l) => l.status === statusFilter);
    if (websiteFilter === "sem_site") out = out.filter((l) => !hasRealWebsite(l));
    else if (websiteFilter === "com_site") out = out.filter((l) => hasRealWebsite(l));
    if (phoneOnly) out = out.filter((l) => !!l.phone);
    if (cityFilter !== "todas") out = out.filter((l) => l.city === cityFilter);
    if (minRating > 0) out = out.filter((l) => (l.rating ?? 0) >= minRating);
    if (search.trim()) {
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const q = norm(search);
      out = out.filter((l) => {
        const hay = norm([l.name, l.phone, l.formatted_address, l.neighborhood, l.category].filter(Boolean).join(" "));
        return hay.includes(q);
      });
    }
    const sorted = [...out];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    else if (sortBy === "rating") sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sortBy === "reviews") sorted.sort((a, b) => (b.user_rating_count ?? 0) - (a.user_rating_count ?? 0));
    // "recent" mantém ordem original (já vem por created_at desc do backend)
    return sorted;
  }, [leads, statusFilter, websiteFilter, phoneOnly, cityFilter, minRating, search, sortBy]);
  const selectedLeads = useMemo(
    () => filteredLeads.filter((l) => selected.has(l.id)),
    [filteredLeads, selected],
  );
  const exportRows = selectedLeads.length > 0 ? selectedLeads : filteredLeads;

  const stats = useMemo(() => {
    const total = leads.length;
    const semSite = leads.filter((l) => !hasRealWebsite(l)).length;
    const semSiteComTel = leads.filter((l) => !hasRealWebsite(l) && !!l.phone).length;
    const cidades = new Set(leads.map((l) => l.city).filter(Boolean)).size;
    return { total, semSite, semSiteComTel, cidades };
  }, [leads]);


  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selected.has(l.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredLeads.forEach((l) => next.delete(l.id));
      else filteredLeads.forEach((l) => next.add(l.id));
      return next;
    });
  }
  const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selected.has(l.id));


  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-sora font-extrabold text-slate-900">Prospecção</h1>
        <p className="text-slate-500 mt-1">
          Encontre leads qualificados de forma rápida. Busque por segmento, múltiplas cidades e exporte para planilha.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Users className="size-5" />} label="Total de Leads" value={stats.total.toString()} />
        <StatCard
          icon={<Globe className="size-5" />}
          label="Sem site (alvo)"
          value={stats.semSite.toString()}
          highlight
        />
        <StatCard icon={<Phone className="size-5" />} label="Sem site + telefone" value={stats.semSiteComTel.toString()} />
        <StatCard icon={<MapPin className="size-5" />} label="Cidades" value={stats.cidades.toString()} />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Filtros */}
        <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-fit mb-24 lg:mb-0">
          <div className="flex items-center gap-2 mb-4">
            <Search className="size-5 text-brand" />
            <h2 className="font-sora font-bold text-slate-900">Configure sua prospecção</h2>
          </div>

          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
            <Briefcase className="size-4" /> Segmento de Atuação
          </label>
          <input
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="Ex: clínica odontológica, contabilidade, imobiliária"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand mb-4"
          />

          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
            <MapPin className="size-4" /> Estado
          </label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand mb-4 bg-white"
          >
            <option value="">Brasil inteiro</option>
            {BR_STATES.map((s) => (
              <option key={s.uf} value={s.uf}>{s.name} ({s.uf})</option>
            ))}
          </select>

          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
            <MapPin className="size-4" /> Cidades
          </label>
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCity(cityInput);
              }
            }}
            onBlur={() => cityInput && addCity(cityInput)}
            placeholder="Digite e Enter (ex: São Paulo, Campinas)"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
          />
          {cities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {cities.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-brand/10 text-brand-dark text-xs font-medium px-2 py-1 rounded-full">
                  {c}
                  <button type="button" onClick={() => setCities((p) => p.filter((x) => x !== c))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5">
            Deixe em branco para buscar no estado inteiro (ou Brasil se sem estado).
          </p>

          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5 mt-4">
            <MapPin className="size-4" /> Bairros
          </label>
          <input
            value={neighborhoodInput}
            onChange={(e) => setNeighborhoodInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addNeighborhood(neighborhoodInput);
              }
            }}
            onBlur={() => neighborhoodInput && addNeighborhood(neighborhoodInput)}
            placeholder="Digite e Enter (ex: Moema, Pinheiros)"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
          />
          {neighborhoods.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {neighborhoods.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 bg-brand/10 text-brand-dark text-xs font-medium px-2 py-1 rounded-full">
                  {n}
                  <button type="button" onClick={() => setNeighborhoods((p) => p.filter((x) => x !== n))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5">
            Opcional. Refina a busca por bairros dentro da(s) cidade(s).
          </p>

          <label className="text-sm font-semibold text-slate-700 mt-4 mb-1.5 block">Leads por busca</label>
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand bg-white mb-5"
          >
            <option value={20}>Até 20 leads</option>
            <option value={40}>Até 40 leads</option>
            <option value={60}>Até 60 leads</option>
            <option value={80}>Até 80 leads</option>
            <option value={100}>Até 100 leads</option>
            <option value={120}>Até 120 leads</option>
          </select>
          <p className="text-xs text-slate-400 -mt-3 mb-4">
            Leads já capturados antes não são repetidos. Se não houver o total, entregamos o máximo disponível.
          </p>


          <button
            type="submit"
            disabled={scrape.isPending || !extractionReady}
            className="w-full bg-brand text-white py-3 rounded-xl font-bold hover:bg-brand-dark transition-colors disabled:opacity-70 flex items-center gap-2 justify-center"
          >
            {scrape.isPending ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
            {scrape.isPending ? "Prospectando..." : "Iniciar Prospecção"}
          </button>
          {!extractionReady && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{backendHealthQ.isLoading ? "Verificando a configuração do extrator…" : "Não foi possível confirmar a configuração do Google Places."} <a href="/conexoes" className="font-bold underline">Abrir Configurações</a></p>}

          {scrapeMessage && (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-sm font-medium ${
                scrapeStatus === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : scrapeStatus === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-brand/20 bg-brand/5 text-brand-dark"
              }`}
            >
              {scrapeMessage}
            </div>
          )}
        </form>

        {/* Lista */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-xl font-sora font-bold">Seus Leads</h2>
              <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm text-slate-600" onClick={() => { setStatusFilter(statusFilter === "descartado" ? "todos" : "descartado"); setWebsiteFilter("todos"); setPhoneOnly(false); setCityFilter("todas"); setSearch(""); setMinRating(0); }}><Trash2 size={14}/>{statusFilter === "descartado" ? "Voltar aos leads" : "Lixeira"}</button>
              <p className="text-sm text-slate-500">
                {filteredLeads.length} de {leads.length} contato{leads.length === 1 ? "" : "s"}
                {selected.size > 0 && <> · <span className="text-brand font-medium">{selected.size} selecionado{selected.size === 1 ? "" : "s"}</span></>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, telefone, bairro..."
                  className="text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white w-60"
                />
              </div>
              {cityOptions.length > 1 && (
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
                >
                  <option value="todas">Todas as cidades</option>
                  {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
                title="Ordenar"
              >
                <option value="recent">Mais recentes</option>
                <option value="name">Nome (A-Z)</option>
                <option value="rating">Maior nota</option>
                <option value="reviews">Mais avaliações</option>
              </select>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
                title="Nota mínima"
              >
                <option value={0}>Nota: todas</option>
                <option value={3}>≥ 3.0 ⭐</option>
                <option value={4}>≥ 4.0 ⭐</option>
                <option value={4.5}>≥ 4.5 ⭐</option>
              </select>
              <select
                value={websiteFilter}
                onChange={(e) => setWebsiteFilter(e.target.value as typeof websiteFilter)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
              >
                <option value="sem_site">🎯 Sem site</option>
                <option value="com_site">Com site</option>
                <option value="todos">Todos (site)</option>
              </select>
              <label className="text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={phoneOnly}
                  onChange={(e) => setPhoneOnly(e.target.checked)}
                  className="size-4 accent-brand"
                />
                Só com telefone
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
              >
                <option value="todos">Todos os status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>

              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-sm text-slate-500 hover:text-slate-700 px-2 py-2"
                >
                  Limpar seleção
                </button>
              )}
              <button
                onClick={() => runBriefings(exportRows.map((l) => l.id))}
                disabled={exportRows.length === 0 || briefingBusy}
                className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
                title="Gera prompt + fotos + info do Google para cada lead selecionado"
              >
                {briefingBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Gerar briefings ({exportRows.length})
              </button>
              <button
                onClick={() => exportCsv(exportRows)}
                disabled={exportRows.length === 0}
                className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="size-4" />
                Baixar CSV ({exportRows.length})
              </button>



            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-slate-400">
              <Loader2 className="size-6 animate-spin mx-auto mb-2" /> Carregando...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-200 text-center">
              <Building2 className="size-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                {leads.length === 0 ? "Nenhum lead encontrado" : "Nenhum lead com este status"}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {leads.length === 0
                  ? 'Configure os parâmetros e clique em "Iniciar Prospecção".'
                  : "Ajuste o filtro para ver outros contatos."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          className="size-4 rounded border-slate-300 accent-brand cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold">Empresa</th>
                      <th className="text-left px-4 py-3 font-semibold">Contato</th>
                      <th className="text-left px-4 py-3 font-semibold">Local</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.slice(Math.min(page, Math.max(0, Math.ceil(filteredLeads.length / 50) - 1)) * 50, (Math.min(page, Math.max(0, Math.ceil(filteredLeads.length / 50) - 1)) + 1) * 50).map((l) => (
                      <tr key={l.id} className={`hover:bg-slate-50/50 ${selected.has(l.id) ? "bg-brand/5" : ""}`}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(l.id)}
                            onChange={() => toggleOne(l.id)}
                            className="size-4 rounded border-slate-300 accent-brand cursor-pointer"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">{l.name}</span>
                            {!hasRealWebsite(l) && (
                              <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                {l.website ? "Só social" : "Sem site"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            {l.category && <span>{l.category}</span>}
                            {l.rating != null && (
                              <span className="flex items-center gap-1">
                                <Star className="size-3 fill-amber-400 text-amber-400" /> {l.rating.toFixed(1)} ({l.user_rating_count ?? 0})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {l.phone ? (
                            <div className="flex items-center gap-1.5">
                              <Phone className="size-3.5" /> {l.phone}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">sem telefone</span>
                          )}
                          {l.website && (
                            <a
                              href={l.website}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-brand text-xs mt-1 hover:underline"
                            >
                              <Globe className="size-3.5" /> site
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs max-w-xs">
                          {l.city && l.state ? `${l.city} / ${l.state}` : l.formatted_address}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={l.status}
                            onChange={(e) => setStatus.mutate({ id: l.id, status: e.target.value })}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white font-medium"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button type="button" disabled={setStatus.isPending} title={l.status === "descartado" ? "Restaurar lead" : "Mover para lixeira"} onClick={() => setStatus.mutate({ id: l.id, status: l.status === "descartado" ? "novo" : "descartado" })} className="rounded-lg bg-rose-50 p-2 text-rose-600 disabled:opacity-40">{l.status === "descartado" ? <RotateCcw size={16}/> : <Trash2 size={16}/>}</button>
                            <button
                              onClick={() => runBriefings([l.id])}
                              disabled={briefingBusy}
                              className="p-2 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                              title="Gerar briefing (prompt + fotos)"
                            >
                              <Sparkles className="size-4" />
                            </button>
                            {l.phone && (
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openWhatsApp(l.phone!);
                                }}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="size-4" />
                              </a>
                            )}
                            {l.google_maps_uri && (
                              <a
                                href={l.google_maps_uri}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100"
                                title="Ver no Maps"
                              >
                                <MapPin className="size-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t p-3 text-sm"><button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button><span>{Math.min(page + 1, Math.ceil(filteredLeads.length / 50))} / {Math.ceil(filteredLeads.length / 50)} · 50 por página</span><button disabled={(page + 1) * 50 >= filteredLeads.length} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button></div>
            </div>
          )}
        </div>
      </div>

      {briefingOpen && (
        <BriefingModal
          briefings={briefings}
          index={briefingIndex}
          onIndexChange={setBriefingIndex}
          busy={briefingBusy}
          progress={briefingProgress}
          onClose={() => setBriefingOpen(false)}
        />
      )}
    </div>
  );
}

function BriefingModal({
  briefings, index, onIndexChange, busy, progress, onClose,
}: {
  briefings: LeadBriefing[];
  index: number;
  onIndexChange: (i: number) => void;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onClose: () => void;
}) {
  const current = briefings[index];
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error("Não consegui copiar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="font-sora font-bold text-slate-900">
                {current ? current.info.name : "Gerando briefings..."}
              </div>
              <div className="text-xs text-slate-500">
                {progress ? `${progress.done} de ${progress.total} processados` : ""}
                {briefings.length > 1 && ` · ${index + 1}/${briefings.length}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {briefings.length > 1 && (
              <>
                <button
                  onClick={() => onIndexChange(Math.max(0, index - 1))}
                  disabled={index === 0}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={() => onIndexChange(Math.min(briefings.length - 1, index + 1))}
                  disabled={index >= briefings.length - 1}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!current ? (
            <div className="text-center py-16 text-slate-400">
              <Loader2 className="size-6 animate-spin mx-auto mb-2" />
              Montando briefing...
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-sora font-bold text-slate-900">Prompt pronto pro Lovable</h3>
                  <button
                    onClick={() => copy(current.prompt, "Prompt")}
                    className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    <Copy className="size-3.5" /> Copiar prompt
                  </button>
                </div>
                <textarea
                  readOnly
                  value={current.prompt}
                  className="w-full h-64 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 resize-none"
                />
              </section>

              <section>
                <h3 className="font-sora font-bold text-slate-900 mb-2">Info da loja</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <InfoRow label="Segmento" value={current.info.category} />
                  <InfoRow label="Telefone" value={current.info.phone} />
                  <InfoRow label="Endereço" value={current.info.address} />
                  <InfoRow label="Cidade" value={[current.info.city, current.info.state].filter(Boolean).join(" - ")} />
                  <InfoRow label="Site atual" value={current.info.website} />
                  <InfoRow label="Rating" value={current.info.rating != null ? `${current.info.rating} (${current.info.ratingCount ?? 0})` : null} />
                </div>
                {current.info.hours.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Horários</div>
                    <ul className="text-xs text-slate-600 space-y-0.5">
                      {current.info.hours.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>
                )}
                {current.info.overview && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sobre</div>
                    <p className="text-sm text-slate-600">{current.info.overview}</p>
                  </div>
                )}
              </section>

              {current.info.reviews.length > 0 && (
                <section>
                  <h3 className="font-sora font-bold text-slate-900 mb-2">Depoimentos do Google</h3>
                  <ul className="space-y-2">
                    {current.info.reviews.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100">"{r}"</li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                💡 Este briefing usa só os dados que já estão salvos (grátis). Peça ao cliente as fotos reais da loja antes de gerar o site no Lovable.
              </div>
            </>
          )}

          {busy && current && (
            <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="size-3 animate-spin" /> Processando próximos leads...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-slate-700">{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border shadow-sm flex items-center gap-3 ${highlight ? "bg-brand text-white border-brand" : "bg-white border-slate-100"}`}>
      <div className={`size-10 rounded-xl flex items-center justify-center ${highlight ? "bg-white/20 text-white" : "bg-brand/10 text-brand"}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-sora font-extrabold leading-none ${highlight ? "text-white" : "text-slate-900"}`}>{value}</div>
        <div className={`text-xs mt-1 ${highlight ? "text-white/80" : "text-slate-500"}`}>{label}</div>
      </div>
    </div>
  );
}
