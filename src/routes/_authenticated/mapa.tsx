import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeads } from "@/lib/scrape.functions";
import { Loader2, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({ meta: [{ title: "Mapa de Leads — Mega Lead" }] }),
  component: MapaPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  google_maps_uri: string | null;
};

declare global {
  interface Window {
    google?: any;
    __initLeadMap?: () => void;
  }
}

const STATUS_COLOR: Record<string, string> = {
  novo: "#94a3b8",
  contatado: "#3b82f6",
  em_negociacao: "#f59e0b",
  convertido: "#10b981",
  descartado: "#f43f5e",
};

function MapaPage() {
  const listFn = useServerFn(listLeads);
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Load Google Maps JS
  useEffect(() => {
    if (window.google?.maps) {
      setReady(true);
      return;
    }
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const trackingId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) {
      setLoadErr("Chave do Google Maps não configurada.");
      return;
    }
    window.__initLeadMap = () => setReady(true);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLeadMap${
      trackingId ? `&channel=${trackingId}` : ""
    }`;
    script.async = true;
    script.onerror = () => setLoadErr("Falha ao carregar o Google Maps.");
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || !mapDiv.current || mapRef.current) return;
    mapRef.current = new window.google!.maps.Map(mapDiv.current, {
      center: { lat: -14.235, lng: -51.9253 },
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    infoRef.current = new window.google!.maps.InfoWindow();
  }, [ready]);

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const leads = ((data?.leads ?? []) as Lead[]).filter(
      (l) => l.latitude != null && l.longitude != null,
    );

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (leads.length === 0) return;

    const bounds = new window.google!.maps.LatLngBounds();
    for (const l of leads) {
      const pos = { lat: l.latitude!, lng: l.longitude! };
      const color = STATUS_COLOR[l.status] ?? "#94a3b8";
      const marker = new window.google!.maps.Marker({
        position: pos,
        map,
        title: l.name,
        icon: {
          path: window.google!.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        const journeyLink = l.phone
          ? `<a href="/whatsapp" style="color:#365b48;font-weight:600">Criar jornada</a>`
          : "";
        const mapsLink = l.google_maps_uri
          ? `<a href="${l.google_maps_uri}" target="_blank" style="color:#3b82f6;font-weight:600">Ver no Maps</a>`
          : "";
        infoRef.current?.setContent(
          `<div style="font-family:system-ui;padding:4px;min-width:180px">
            <div style="font-weight:700;color:#0f172a">${l.name}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${l.category ?? ""}</div>
            <div style="font-size:12px;color:#64748b">${l.city ?? ""}${l.state ? " / " + l.state : ""}</div>
            ${l.phone ? `<div style="font-size:12px;color:#334155;margin-top:4px">${l.phone}</div>` : ""}
            <div style="margin-top:8px;display:flex;gap:10px;font-size:12px">${journeyLink} ${mapsLink}</div>
          </div>`,
        );
        infoRef.current?.open({ anchor: marker, map });
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    }
    if (leads.length > 1) map.fitBounds(bounds, 60);
    else map.setCenter(bounds.getCenter());
  }, [ready, data]);

  const leadsWithGeo = ((data?.leads ?? []) as Lead[]).filter(
    (l) => l.latitude != null && l.longitude != null,
  ).length;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-sora font-extrabold text-slate-900">Mapa de Leads</h1>
        <p className="text-slate-500 mt-1">
          Visualize a distribuição geográfica dos seus leads. Clique nos pontos para detalhes.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="size-4" />
          <strong className="text-slate-900">{leadsWithGeo}</strong> leads no mapa
        </div>
        <div className="flex gap-3 flex-wrap text-xs">
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-white shadow" style={{ background: color }} />
              <span className="text-slate-600 capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm relative" style={{ height: "70vh" }}>
        {loadErr && (
          <div className="absolute inset-0 flex items-center justify-center text-rose-600 z-10 bg-white/80">
            {loadErr}
          </div>
        )}
        {(isLoading || !ready) && !loadErr && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 z-10 bg-white/80">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        <div ref={mapDiv} className="w-full h-full" />
      </div>
    </div>
  );
}
