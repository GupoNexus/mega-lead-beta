import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function buildLovablePrompt(l: {
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  googleMaps: string | null;
  rating: number | null;
  ratingCount: number | null;
}) {
  const lines: string[] = [];
  const local = [l.neighborhood, l.city, l.state].filter(Boolean).join(", ");
  lines.push(`Crie um site institucional moderno, responsivo e com ótimo SEO local para o seguinte negócio real:`);
  lines.push("");
  lines.push(`# ${l.name}`);
  if (l.category) lines.push(`- Segmento: ${l.category}`);
  if (local) lines.push(`- Localização: ${local}`);
  if (l.address) lines.push(`- Endereço completo: ${l.address}`);
  if (l.phone) lines.push(`- Telefone/WhatsApp: ${l.phone}`);
  if (l.website) lines.push(`- Site/rede social atual (referência): ${l.website}`);
  if (l.googleMaps) lines.push(`- Google Maps: ${l.googleMaps}`);
  if (l.rating != null) lines.push(`- Nota Google: ${l.rating} (${l.ratingCount ?? 0} avaliações)`);
  lines.push("");
  lines.push(`## Requisitos do site`);
  lines.push(`- Hero forte com nome do negócio + CTA "Fale no WhatsApp" (link wa.me com o telefone acima, apenas dígitos).`);
  lines.push(`- Seções: Sobre, Serviços/Produtos (deduza pelo segmento "${l.category ?? "negócio local"}"), Diferenciais, Localização (embed do Google Maps para o endereço acima), Contato.`);
  lines.push(`- SEO local: title e meta description incluindo "${l.name}"${l.city ? ` e "${l.city}"` : ""}. Adicione JSON-LD LocalBusiness com nome, telefone, endereço e geo.`);
  lines.push(`- Botão flutuante de WhatsApp em todas as páginas.`);
  lines.push(`- Tom brasileiro, acolhedor e profissional. Nada de lorem ipsum — use os dados reais acima.`);
  lines.push(`- Paleta e tipografia coerentes com o segmento. Use imagens genéricas de alta qualidade (Unsplash) relacionadas a "${l.category ?? l.name}" enquanto o cliente não envia as fotos reais dele.`);
  lines.push(`- Formulário de contato simples (nome, telefone, mensagem) que abre o WhatsApp com a mensagem preenchida.`);
  lines.push(`- Rodapé com endereço, telefone e horário genérico ("Seg a Sáb, 9h às 18h") — o cliente ajusta depois.`);
  return lines.join("\n");
}

export const generateLeadBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.leadId)
      .single();
    if (error || !lead) throw new Error(error?.message ?? "Lead não encontrado");

    const info = {
      name: lead.name,
      category: lead.category,
      city: lead.city,
      state: lead.state,
      neighborhood: lead.neighborhood,
      address: lead.formatted_address,
      phone: lead.phone,
      website: lead.website,
      googleMaps: lead.google_maps_uri,
      rating: lead.rating,
      ratingCount: lead.user_rating_count,
      hours: [] as string[],
      overview: null as string | null,
      reviews: [] as string[],
      photos: [] as string[],
    };

    const prompt = buildLovablePrompt({
      name: info.name,
      category: info.category,
      city: info.city,
      state: info.state,
      neighborhood: info.neighborhood,
      address: info.address,
      phone: info.phone,
      website: info.website,
      googleMaps: info.googleMaps,
      rating: info.rating,
      ratingCount: info.ratingCount,
    });

    return { leadId: lead.id, info, prompt };
  });

export type LeadBriefing = Awaited<ReturnType<typeof generateLeadBriefing>>;
