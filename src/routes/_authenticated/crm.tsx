import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeads, updateLeadStatus } from "@/lib/scrape.functions";
import { openWhatsApp } from "@/lib/utils";
import { Phone, Globe, MessageCircle, MapPin, Star, GripVertical } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [{ title: "CRM Pipeline — Mega Lead" }] }),
  component: CrmPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  rating: number | null;
  google_maps_uri: string | null;
  status: string;
};

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: "novo", label: "Novo", color: "bg-slate-400" },
  { key: "contatado", label: "Contatado", color: "bg-blue-500" },
  { key: "em_negociacao", label: "Em Negociação", color: "bg-amber-500" },
  { key: "convertido", label: "Convertido", color: "bg-emerald-500" },
  { key: "descartado", label: "Descartado", color: "bg-rose-400" },
];

function withTimeout<T>(operation: Promise<T>, ms = 12000) {
  return Promise.race<T>([
    operation,
    new Promise<T>((_resolve, reject) => window.setTimeout(() => reject(new Error("O carregamento demorou demais. Verifique sua conexão e tente novamente.")), ms)),
  ]);
}

function CrmPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeads);
  const updateFn = useServerFn(updateLeadStatus);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => withTimeout(listFn()),
    retry: 1,
    retryDelay: 800,
  });

  const move = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<{ leads: Lead[] }>(["leads"]);
      qc.setQueryData<{ leads: Lead[] }>(["leads"], (old) =>
        old
          ? { leads: old.leads.map((l) => (l.id === v.id ? { ...l, status: v.status } : l)) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leads"], ctx.prev);
      toast.error("Falha ao mover lead");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const leads = (data?.leads ?? []) as Lead[];

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const l of leads) {
      const key = COLUMNS.find((c) => c.key === l.status)?.key ?? "novo";
      map[key].push(l);
    }
    return map;
  }, [leads]);

  function onDrop(colKey: string, droppedId?: string) {
    const leadId = dragging || droppedId;
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== colKey) {
      move.mutate({ id: leadId, status: colKey });
    }
    setDragging(null);
    setHoverCol(null);
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-sora font-extrabold text-slate-900">CRM Pipeline</h1>
        <p className="text-slate-500 mt-1">
          Arraste seus leads entre as etapas para acompanhar o funil de vendas.
        </p>
      </header>

      {isLoading ? (
        <div className="text-slate-400">Carregando...</div>
      ) : !data ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><p className="font-bold">Não foi possível carregar o CRM.</p><p className="mt-1 text-sm">A lista de leads não respondeu. Tente novamente.</p><button onClick={() => qc.invalidateQueries({ queryKey: ["leads"] })} className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white">Tentar novamente</button></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-5">
          {COLUMNS.map((col) => {
            const items = grouped[col.key] ?? [];
            const isHover = hoverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverCol(col.key);
                }}
                onDragLeave={() => setHoverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => { e.preventDefault(); onDrop(col.key, e.dataTransfer.getData("text/plain")); }}
                className={`bg-slate-100/60 rounded-2xl p-3 min-h-[400px] w-[270px] shrink-0 transition-colors ${
                  isHover ? "bg-brand/10 outline-2 outline-dashed outline-brand" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`size-2.5 rounded-full ${col.color}`} />
                  <h3 className="font-sora font-bold text-slate-800 text-sm">{col.label}</h3>
                  <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full ml-auto font-semibold">
                    {items.length}
                  </span>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                  {items.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">Vazio</p>
                  )}
                  {items.map((l) => (
                    <div
                      key={l.id}
                      draggable={!move.isPending}
                      onDragStart={(e) => {
                        // Electron only completes a native HTML5 drop when a
                        // dataTransfer payload exists; keeping the id there also
                        // survives a React state update during the drag.
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", l.id);
                        setDragging(l.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setHoverCol(null);
                      }}
                      className={`bg-white rounded-xl p-3 border border-slate-100 shadow-sm cursor-grab active:cursor-grabbing hover:border-brand/30 transition-all ${
                        dragging === l.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="size-4 text-slate-300 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 text-sm truncate">{l.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {l.category}
                            {l.city && ` · ${l.city}${l.state ? `/${l.state}` : ""}`}
                          </div>
                          {l.rating != null && (
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                              <Star className="size-3 fill-amber-400 text-amber-400" /> {l.rating.toFixed(1)}
                            </div>
                          )}
                          <select aria-label={`Etapa de ${l.name}`} value={l.status} disabled={move.isPending} onChange={e => move.mutate({ id: l.id, status: e.target.value })} className="mt-2 w-full rounded border border-slate-200 p-1 text-xs">{COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                          <div className="flex gap-1.5 mt-2">
                            {l.phone && (
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openWhatsApp(l.phone!);
                                }}
                                className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                title="WhatsApp"
                              >
                                <MessageCircle className="size-3.5" />
                              </a>
                            )}
                            {l.phone && (
                              <a
                                href={`tel:${l.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100"
                                title="Ligar"
                              >
                                <Phone className="size-3.5" />
                              </a>
                            )}
                            {l.website && (
                              <a
                                href={l.website}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100"
                                title="Site"
                              >
                                <Globe className="size-3.5" />
                              </a>
                            )}
                            {l.google_maps_uri && (
                              <a
                                href={l.google_maps_uri}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100"
                                title="Maps"
                              >
                                <MapPin className="size-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
