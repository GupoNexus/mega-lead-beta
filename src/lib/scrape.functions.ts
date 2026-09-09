import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const scrapeInput = z.object({
  segment: z.string().min(2).max(120),
  state: z.string().min(2).max(4).optional().nullable(),
  cities: z.array(z.string().min(1).max(80)).max(30).default([]),
  neighborhoods: z.array(z.string().min(1).max(80)).max(30).default([]),
  maxResultsPerCity: z.number().int().min(1).max(120).default(20),
});

type PlaceApiResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    location?: { latitude?: number; longitude?: number };
    googleMapsUri?: string;
    businessStatus?: string;
    primaryTypeDisplayName?: { text?: string };
    addressComponents?: Array<{ types?: string[]; longText?: string; shortText?: string }>;
  }>;
  nextPageToken?: string;
};

type AddressComponent = { types?: string[]; longText?: string; shortText?: string };
type PlaceItem = NonNullable<PlaceApiResponse["places"]>[number];

function pickCityState(components?: AddressComponent[]) {
  if (!components) return { city: null as string | null, state: null as string | null };
  let city: string | null = null;
  let state: string | null = null;
  for (const c of components) {
    const types = c.types ?? [];
    if (!city && (types.includes("administrative_area_level_2") || types.includes("locality"))) {
      city = c.longText ?? c.shortText ?? null;
    }
    if (!state && types.includes("administrative_area_level_1")) {
      state = c.shortText ?? c.longText ?? null;
    }
  }
  return { city, state };
}

async function fetchTextSearch(params: {
  textQuery: string;
  desired: number;
  gmapsKey: string;
  fieldMask: string;
}) {
  const collected: PlaceItem[] = [];
  let pageToken: string | undefined;
  let safety = 0;
  while (collected.length < params.desired && safety < 4) {
    safety++;
    const body: Record<string, unknown> = {
      textQuery: params.textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: Math.min(20, params.desired - collected.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: {
          "X-Goog-Api-Key": params.gmapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": params.fieldMask,
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Maps ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as PlaceApiResponse;
    if (json.places) collected.push(...json.places);
    if (!json.nextPageToken || collected.length >= params.desired) break;
    pageToken = json.nextPageToken;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return collected;
}

/**
 * Google Places textSearch caps at ~60 results per query. To reach up to 120
 * unique leads per target, we run a few query variations and dedupe.
 */
async function searchTarget(params: {
  segment: string;
  scopeLabel: string;
  desired: number;
  excludePlaceIds: Set<string>;
  gmapsKey: string;
  fieldMask: string;
}) {
  const variants = [
    `${params.segment} em ${params.scopeLabel}`,
    `melhores ${params.segment} em ${params.scopeLabel}`,
    `${params.segment} próximo a ${params.scopeLabel}`,
    `lista de ${params.segment} ${params.scopeLabel}`,
  ];

  const unique = new Map<string, PlaceItem>();
  for (const q of variants) {
    if (unique.size >= params.desired) break;
    const remaining = params.desired - unique.size;
    // Ask for a bit extra to compensate for overlap with existing leads
    const desired = Math.min(60, remaining + (params.excludePlaceIds.size > 0 ? 20 : 0));
    const places = await fetchTextSearch({
      textQuery: q,
      desired: Math.min(60, desired),
      gmapsKey: params.gmapsKey,
      fieldMask: params.fieldMask,
    });
    for (const p of places) {
      if (unique.has(p.id)) continue;
      if (params.excludePlaceIds.has(p.id)) continue;
      unique.set(p.id, p);
      if (unique.size >= params.desired) break;
    }
  }
  return Array.from(unique.values()).slice(0, params.desired);
}

export const scrapeGoogleMaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => scrapeInput.parse(data))
  .handler(async ({ data, context }) => {
    const gmapsKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!gmapsKey) {
      throw new Error("Google Places API key não configurada (GOOGLE_PLACES_API_KEY).");
    }

    const { supabase, userId } = context;

    // Acesso liberado para todos os usuários autenticados (sem trava de plano)





    // Build targets. Neighborhoods take priority — they combine with cities if both provided.
    const targets: Array<{ label: string; scope: string }> = [];
    const stateSuffix = data.state ? `, ${data.state}` : "";

    if (data.neighborhoods.length > 0 && data.cities.length > 0) {
      for (const city of data.cities) {
        for (const n of data.neighborhoods) {
          targets.push({ label: `${n} - ${city}`, scope: `${n}, ${city}${stateSuffix}` });
        }
      }
    } else if (data.neighborhoods.length > 0) {
      for (const n of data.neighborhoods) {
        targets.push({ label: n, scope: `${n}${stateSuffix}` });
      }
    } else if (data.cities.length > 0) {
      for (const city of data.cities) {
        targets.push({ label: city, scope: `${city}${stateSuffix}` });
      }
    } else {
      const scope = data.state ? `estado de ${data.state}` : "Brasil";
      targets.push({ label: data.state ?? "BR", scope });
    }

    const overallQuery = `${data.segment} — ${targets.map((t) => t.label).join(", ")}`;
    const { data: job, error: jobErr } = await supabase
      .from("scrape_jobs")
      .insert({
        user_id: userId,
        query: overallQuery,
        state: data.state ?? null,
        category: data.segment,
        status: "running",
      })
      .select()
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Falha ao criar job");

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.addressComponents",
      "places.nationalPhoneNumber",
      "places.internationalPhoneNumber",
      "places.websiteUri",
      "places.rating",
      "places.userRatingCount",
      "places.location",
      "places.googleMapsUri",
      "places.businessStatus",
      "places.primaryTypeDisplayName",
      "nextPageToken",
    ].join(",");

    try {
      // Pull all existing place_ids for this user so repeat runs never return duplicates.
      const existing = new Set<string>();
      {
        for (let offset = 0; ; offset += 1000) {
          const { data: rows, error } = await supabase.from("leads").select("place_id").eq("user_id", userId).order("id").range(offset, offset + 999);
          if (error) throw new Error(error.message);
          for (const r of rows ?? []) if (r.place_id) existing.add(r.place_id);
          if (!rows || rows.length < 1000) break;
        }
      }

      type LeadRow = {
        user_id: string;
        scrape_job_id: string;
        place_id: string;
        name: string;
        phone: string | null;
        formatted_address: string | null;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
        category: string | null;
        website: string | null;
        rating: number | null;
        user_rating_count: number | null;
        latitude: number | null;
        longitude: number | null;
        google_maps_uri: string | null;
        business_status: string | null;
        status: string;
      };
      const rows: LeadRow[] = [];
      const seenThisRun = new Set<string>();

      for (const t of targets) {
        const places = await searchTarget({
          segment: data.segment,
          scopeLabel: t.scope,
          desired: data.maxResultsPerCity,
          excludePlaceIds: new Set([...existing, ...seenThisRun]),
          gmapsKey,
          fieldMask,
        });
        for (const p of places) {
          if (seenThisRun.has(p.id) || existing.has(p.id)) continue;
          seenThisRun.add(p.id);
          const { city, state } = pickCityState(p.addressComponents);
          rows.push({
            user_id: userId,
            scrape_job_id: job.id,
            place_id: p.id,
            name: p.displayName?.text ?? "Sem nome",
            phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
            formatted_address: p.formattedAddress ?? null,
            neighborhood: t.label.includes(" - ") ? t.label.split(" - ")[0] : (data.neighborhoods.length > 0 ? t.label : null),
            city,
            state,
            category: p.primaryTypeDisplayName?.text ?? data.segment,
            website: p.websiteUri ?? null,
            rating: p.rating ?? null,
            user_rating_count: p.userRatingCount ?? null,
            latitude: p.location?.latitude ?? null,
            longitude: p.location?.longitude ?? null,
            google_maps_uri: p.googleMapsUri ?? null,
            business_status: p.businessStatus ?? null,
            status: "novo",
          });
        }
      }

      let insertedCount = 0;
      if (rows.length > 0) {
        const { data: inserted, error: upErr } = await supabase
          .from("leads")
          .upsert(rows, { onConflict: "user_id,place_id", ignoreDuplicates: true }).select("id");
        if (upErr) throw new Error(upErr.message);
        insertedCount = inserted?.length ?? 0;
      }

      await supabase
        .from("scrape_jobs")
        .update({ status: "completed", results_count: insertedCount })
        .eq("id", job.id);

      const requested = targets.length * data.maxResultsPerCity;
      return { ok: true, count: insertedCount, requested };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from("scrape_jobs").update({ status: "failed", error: msg }).eq("id", job.id);
      throw new Error(msg);
    }
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const leads: Database["public"]["Tables"]["leads"]["Row"][] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from("leads").select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      leads.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return { leads };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.string().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id).eq("user_id", context.userId).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true };
  });
