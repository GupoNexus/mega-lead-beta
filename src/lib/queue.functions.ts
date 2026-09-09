import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const enqueueCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      { data: campaign } = await db
        .from("wa_campaigns")
        .select("*,wa_channels(*),wa_templates(*)")
        .eq("id", data.campaignId)
        .eq("user_id", context.userId)
        .single();
    if (!campaign?.channel_id) throw new Error("Selecione um canal Meta");
    if (campaign.wa_channels?.status !== "connected") throw new Error("Canal Meta não validado");
    const template = campaign.wa_templates;
    if (!template || template.meta_status !== "APPROVED")
      throw new Error("Selecione um template Meta aprovado para a primeira abordagem");
    const { data: targets } = await db
      .from("wa_campaign_targets")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("sent", false)
      .order("order_index");
    if (!targets?.length) return { queued: 0 };
    const jobKey = `campaign:${campaign.id}:${crypto.randomUUID()}`,
      scheduled =
        campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()
          ? campaign.scheduled_at
          : new Date().toISOString();
    const { data: job, error } = await db
      .from("wa_campaign_jobs")
      .insert({
        user_id: context.userId,
        campaign_id: campaign.id,
        channel_id: campaign.channel_id,
        status: "scheduled",
        scheduled_at: scheduled,
        idempotency_key: jobKey,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const base = new Date(scheduled).getTime(),
      min = Math.max(1, campaign.delay_min_seconds),
      max = Math.max(min, campaign.delay_max_seconds),
      batch = Math.max(1, campaign.batch_size),
      pause = Math.max(0, campaign.batch_pause_seconds);
    const rows = targets.map((t: any, i: number) => {
      const within = i % batch,
        batchNo = Math.floor(i / batch),
        delay = within * (min + Math.floor(Math.random() * (max - min + 1))) + batchNo * pause;
      return {
        user_id: context.userId,
        campaign_job_id: job.id,
        campaign_id: campaign.id,
        target_id: t.id,
        channel_id: campaign.channel_id,
        kind: "outbound",
        payload: {
          phone: t.phone,
          contactName: t.name,
          leadId: t.lead_id,
          body: campaign.opening_message,
          template: { name: template.meta_name, language: template.language, components: [] },
        },
        status: "queued",
        next_attempt_at: new Date(base + delay * 1000).toISOString(),
        idempotency_key: `${jobKey}:target:${t.id}`,
      };
    });
    const { error: insertError } = await db.from("wa_message_jobs").insert(rows);
    if (insertError) throw new Error(insertError.message);
    await db.from("wa_campaigns").update({ status: "queued" }).eq("id", campaign.id);
    return { queued: rows.length, jobId: job.id };
  });

export const cancelCampaignJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      now = new Date().toISOString();
    await db
      .from("wa_campaign_jobs")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("id", data.jobId)
      .eq("user_id", context.userId);
    await db
      .from("wa_message_jobs")
      .update({ status: "cancelled" })
      .eq("campaign_job_id", data.jobId)
      .eq("user_id", context.userId)
      .in("status", ["queued", "retry"]);
    return { ok: true };
  });
