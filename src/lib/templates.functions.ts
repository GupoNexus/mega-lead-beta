import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const configureCampaignDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        campaignId: z.string().uuid(),
        channelId: z.string().uuid(),
        templateId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      { data: channel } = await db
        .from("wa_channels")
        .select("id,status")
        .eq("id", data.channelId)
        .eq("user_id", context.userId)
        .single(),
      { data: template } = await db
        .from("wa_templates")
        .select("id,meta_status,channel_id")
        .eq("id", data.templateId)
        .eq("user_id", context.userId)
        .single();
    if (channel?.status !== "connected") throw new Error("Canal não validado");
    if (template?.meta_status !== "APPROVED" || template.channel_id !== data.channelId)
      throw new Error("Template aprovado inválido");
    const { error } = await db
      .from("wa_campaigns")
      .update({ channel_id: data.channelId, opening_template_id: data.templateId })
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const syncMetaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      { data: channel } = await db
        .from("wa_channels")
        .select("*")
        .eq("id", data.channelId)
        .eq("user_id", context.userId)
        .single();
    if (!channel?.access_token_encrypted || !channel.business_account_id)
      throw new Error("Canal Meta incompleto");
    const { decryptSecret } = await import("./secrets.server");
    const token = decryptSecret(channel.access_token_encrypted),
      res = await fetch(
        `https://graph.facebook.com/v23.0/${channel.business_account_id}/message_templates?fields=id,name,status,language,category,components,quality_score&limit=250`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message || "Falha ao sincronizar templates");
    const rows = (json.data ?? []).map((t: any) => ({
      user_id: context.userId,
      channel_id: data.channelId,
      name: t.name,
      body: t.components?.find((c: any) => c.type === "BODY")?.text || t.name,
      meta_name: t.name,
      language: t.language,
      meta_status: t.status,
      category: t.category,
      components: t.components || [],
      quality_score: typeof t.quality_score === "string" ? t.quality_score : t.quality_score?.score,
      last_synced_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await db.from("wa_templates").delete().eq("channel_id", data.channelId);
      const { error } = await db.from("wa_templates").insert(rows);
      if (error) throw new Error(error.message);
    }
    return {
      count: rows.length,
      approved: rows.filter((r: any) => r.meta_status === "APPROVED").length,
    };
  });
export const listApprovedTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      { data: rows, error } = await db
        .from("wa_templates")
        .select("id,meta_name,language,category,components,quality_score")
        .eq("channel_id", data.channelId)
        .eq("meta_status", "APPROVED")
        .order("meta_name");
    if (error) throw new Error(error.message);
    return { templates: rows ?? [] };
  });
