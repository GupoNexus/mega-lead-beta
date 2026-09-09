import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ Templates / Abordagens ============

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        body: z.string().min(1).max(4000),
        tags: z.array(z.string().max(30)).max(10).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      name: data.name,
      body: data.body,
      tags: data.tags,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("wa_templates")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("wa_templates")
      .insert(row)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar");
    return { ok: true, id: created.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Campanhas / Disparos ============

const campaignSettings = z.object({
  name: z.string().min(1).max(120),
  delay_min_seconds: z.number().int().min(1).max(600),
  delay_max_seconds: z.number().int().min(1).max(1800),
  batch_size: z.number().int().min(1).max(200),
  batch_pause_seconds: z.number().int().min(0).max(3600),
  scheduled_at: z.string().datetime().nullable().optional(),
  sync_crm: z.boolean().default(true),
  move_to_status: z.string().min(1).max(30).default("contatado"),
});

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { campaigns: data ?? [] };
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => campaignSettings.parse(d))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("wa_campaigns")
      .insert({
        user_id: context.userId,
        name: data.name,
        delay_min_seconds: data.delay_min_seconds,
        delay_max_seconds: data.delay_max_seconds,
        batch_size: data.batch_size,
        batch_pause_seconds: data.batch_pause_seconds,
        scheduled_at: data.scheduled_at ?? null,
        sync_crm: data.sync_crm,
        move_to_status: data.move_to_status,
        status: data.scheduled_at ? "agendado" : "rascunho",
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar campanha");
    return { campaign: created };
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            name: z.string().min(1).max(120).optional(),
            status: z.string().min(1).max(30).optional(),
            delay_min_seconds: z.number().int().min(1).max(600).optional(),
            delay_max_seconds: z.number().int().min(1).max(1800).optional(),
            batch_size: z.number().int().min(1).max(200).optional(),
            batch_pause_seconds: z.number().int().min(0).max(3600).optional(),
            scheduled_at: z.string().datetime().nullable().optional(),
            sync_crm: z.boolean().optional(),
            move_to_status: z.string().min(1).max(30).optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_campaigns")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_campaigns")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Targets / Destinatários ============

export const listTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: targets, error } = await context.supabase
      .from("wa_campaign_targets")
      .select("*")
      .eq("campaign_id", data.campaign_id)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return { targets: targets ?? [] };
  });

export const addTargetsFromCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        template_id: z.string().uuid().optional().nullable(),
        status_filter: z.array(z.string()).optional(),
        only_with_phone: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("leads").select("id, name, phone, city, category");
    if (data.status_filter && data.status_filter.length > 0) {
      q = q.in("status", data.status_filter);
    }
    if (data.only_with_phone) q = q.not("phone", "is", null);
    const { data: leads, error } = await q.limit(500);
    if (error) throw new Error(error.message);

    // Get current max order
    const { data: last } = await context.supabase
      .from("wa_campaign_targets")
      .select("order_index")
      .eq("campaign_id", data.campaign_id)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    let order = (last?.order_index ?? -1) + 1;

    const rows = (leads ?? [])
      .filter((l) => l.phone)
      .map((l) => ({
        user_id: context.userId,
        campaign_id: data.campaign_id,
        lead_id: l.id,
        template_id: data.template_id ?? null,
        phone: l.phone as string,
        name: l.name,
        company: null as string | null,
        city: l.city,
        order_index: order++,
      }));

    if (rows.length === 0) return { added: 0 };
    const { error: insErr } = await context.supabase
      .from("wa_campaign_targets")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { added: rows.length };
  });

export const addManualTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        template_id: z.string().uuid().optional().nullable(),
        phone: z.string().min(8).max(20),
        name: z.string().max(120).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("wa_campaign_targets")
      .select("order_index")
      .eq("campaign_id", data.campaign_id)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const order = (last?.order_index ?? -1) + 1;

    const { error } = await context.supabase.from("wa_campaign_targets").insert({
      user_id: context.userId,
      campaign_id: data.campaign_id,
      template_id: data.template_id ?? null,
      phone: data.phone,
      name: data.name ?? null,
      order_index: order,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_campaign_targets")
      .delete()
      .eq("campaign_id", data.campaign_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_campaign_targets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markTargetSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        sync_crm: z.boolean().default(true),
        move_to_status: z.string().default("contatado"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: target, error } = await context.supabase
      .from("wa_campaign_targets")
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("lead_id")
      .single();
    if (error || !target) throw new Error(error?.message ?? "Falha");

    if (data.sync_crm && target.lead_id) {
      await context.supabase
        .from("leads")
        .update({ status: data.move_to_status })
        .eq("id", target.lead_id);
    }
    return { ok: true };
  });
