import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { TablesInsert } from "@/integrations/supabase/types";

export const getCloudChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("wa_channels").select("id, mode, phone_number_id, business_account_id, display_phone, ai_enabled, ai_model, updated_at")
      .eq("user_id", context.userId).limit(1).maybeSingle();
    return { channel: data ?? { mode: "demo", ai_enabled: true, ai_model: "gpt-4.1-mini" } };
  });

export const saveCloudChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    mode: z.enum(["demo", "live"]),
    phone_number_id: z.string().max(100).optional().nullable(),
    business_account_id: z.string().max(100).optional().nullable(),
    display_phone: z.string().max(40).optional().nullable(),
    access_token: z.string().max(1000).optional().nullable(),
    verify_token: z.string().max(200).optional().nullable(),
    ai_enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const row: TablesInsert<"wa_channels"> = {
      user_id: context.userId,
      mode: data.mode,
      phone_number_id: data.phone_number_id || null,
      business_account_id: data.business_account_id || null,
      display_phone: data.display_phone || null,
      ai_enabled: data.ai_enabled,
      updated_at: new Date().toISOString(),
    };
    if (data.access_token) {
      const { encryptSecret } = await import("./secrets.server");
      row.access_token_encrypted = encryptSecret(data.access_token);
    }
    if (data.verify_token) row.verify_token = data.verify_token;
    const { error } = await context.supabase.from("wa_channels").upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveJourneyScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    campaign_id: z.string().uuid(),
    objective: z.string().min(10).max(1000),
    opening_message: z.string().min(5).max(4000),
    agent_instructions: z.string().min(10).max(4000),
    auto_reply: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { campaign_id, ...patch } = data;
    const { error } = await context.supabase.from("wa_campaigns").update(patch).eq("id", campaign_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const launchJourneyTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: target, error } = await context.supabase.from("wa_campaign_targets")
      .select("*, wa_campaigns(*)").eq("id", data.target_id).single();
    if (error || !target) throw new Error(error?.message ?? "Contato não encontrado");
    const campaign = (target as any).wa_campaigns;
    const template = campaign.opening_message || "Olá, {nome}! Posso fazer uma pergunta rápida?";
    const body = template
      .replaceAll("{nome}", target.name || "tudo bem")
      .replaceAll("{empresa}", target.company || target.name || "")
      .replaceAll("{cidade}", target.city || "");
    const { sendCloudMessage } = await import("./whatsapp-cloud.server");
    try {
      const result = await sendCloudMessage({
        userId: context.userId, channelId: campaign.channel_id, phone: target.phone, body,
        contactName: target.name, leadId: target.lead_id, campaignId: target.campaign_id,
      });
      await context.supabase.from("wa_campaign_targets").update({
        sent: true, sent_at: new Date().toISOString(), journey_status: "aguardando_resposta", last_error: null,
      }).eq("id", target.id);
      if (target.lead_id) await context.supabase.from("leads").update({ status: "contatado" }).eq("id", target.lead_id);
      return { ok: true, mode: result.mode };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha no envio";
      await context.supabase.from("wa_campaign_targets").update({ journey_status: "erro", last_error: message }).eq("id", target.id);
      throw cause;
    }
  });

export const simulateJourneyReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase.from("wa_conversations").select("*, wa_campaigns(*)")
      .eq("id", data.conversation_id).single();
    if (!conv) throw new Error("Conversa não encontrada");
    const conversation = conv as any;
    const now = new Date().toISOString();
    await context.supabase.from("wa_messages").insert({ user_id: context.userId, conversation_id: conversation.id, direction: "entrada", body: data.body, status: "recebido", sent_at: now });
    const normalized = data.body.toLocaleLowerCase("pt-BR");
    const campaign = conversation.wa_campaigns;
    const optOut = (campaign?.opt_out_keywords ?? ["sair", "parar", "não quero"]).some((k: string) => normalized.includes(k));
    const handoff = (campaign?.handoff_keywords ?? ["humano", "atendente"]).some((k: string) => normalized.includes(k));
    if (optOut || handoff) {
      await context.supabase.from("wa_conversations").update({
        automation_status: optOut ? "opt_out" : "humano",
        opted_out_at: optOut ? now : null,
        handoff_at: handoff ? now : null,
        last_message: data.body, last_message_at: now, last_direction: "entrada", unread_count: (conversation.unread_count ?? 0) + 1,
      }).eq("id", conversation.id);
      return { ok: true, action: optOut ? "opt_out" : "handoff" };
    }
    const { createAiReply, sendCloudMessage } = await import("./whatsapp-cloud.server");
    const reply = await createAiReply({ userId: context.userId, conversationId: conversation.id, inbound: data.body, campaign });
    await sendCloudMessage({ userId: context.userId, channelId: (conversation as any).channel_id, phone: conversation.phone, body: reply, contactName: conversation.contact_name, leadId: conversation.lead_id, campaignId: conversation.campaign_id });
    return { ok: true, action: "ai_reply", reply };
  });

export const sendManualCloudMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conversation } = await context.supabase.from("wa_conversations")
      .select("*").eq("id", data.conversation_id).single();
    if (!conversation) throw new Error("Conversa não encontrada");
    const { sendCloudMessage } = await import("./whatsapp-cloud.server");
    const result = await sendCloudMessage({
      userId: context.userId,
      channelId: (conversation as any).channel_id,
      phone: conversation.phone,
      body: data.body,
      contactName: conversation.contact_name,
      leadId: conversation.lead_id,
      campaignId: conversation.campaign_id,
    });
    await context.supabase.from("wa_conversations").update({
      automation_status: "humano", handoff_at: new Date().toISOString(),
    }).eq("id", conversation.id);
    return { ok: true, mode: result.mode };
  });
