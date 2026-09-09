import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  conversationIdSchema,
  ingestSchema,
  normalizePhone,
  outgoingSchema,
  sessionSchema,
} from "./inbox-shared";
import { z } from "zod";

export const getWaSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_sessions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { session: data ?? null };
  });

export const saveWaSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wa_sessions").upsert(
      {
        user_id: context.userId,
        status: data.status,
        phone_number: data.phone_number ?? null,
        display_name: data.display_name ?? null,
        extension_version: data.extension_version ?? null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { conversations: data ?? [] };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => conversationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("sent_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => conversationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid(), status: z.enum(["ia", "humano"]), assigned_to: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const patch = { automation_status: data.status, handoff_status: data.status === "humano" ? "assigned" : "resolved", assigned_to: data.assigned_to ?? null, handoff_at: data.status === "humano" ? new Date().toISOString() : null };
    const { error } = await db.from("wa_conversations").update(patch).eq("id", data.conversation_id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await db.from("wa_handoff_events").insert({ user_id: context.userId, conversation_id: data.conversation_id, event: data.status === "humano" ? "assigned" : "resolved", actor_id: context.userId });
    return { ok: true };
  });

export const recordOutgoing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => outgoingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { ensureConversation, touchConversation } = await import("./inbox.server");
    const phone = normalizePhone(data.phone);
    const when = data.sent_at ?? new Date().toISOString();

    const conversationId = await ensureConversation(context, {
      phone,
      contactName: data.contact_name ?? null,
      leadId: data.lead_id ?? null,
    });

    const { error } = await context.supabase.from("wa_messages").insert({
      user_id: context.userId,
      conversation_id: conversationId,
      direction: "saida",
      body: data.body,
      status: "enviado",
      external_id: data.external_id ?? null,
      sent_at: when,
    });
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);

    await touchConversation(context, {
      conversationId,
      body: data.body,
      when,
      direction: "saida",
    });

    return { ok: true, conversation_id: conversationId };
  });

export const ingestIncoming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ingestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { ensureConversation, touchConversation, getConversationLead } = await import(
      "./inbox.server"
    );
    let saved = 0;
    for (const m of data.messages) {
      const phone = normalizePhone(m.phone);
      const when = m.sent_at ?? new Date().toISOString();
      const conversationId = await ensureConversation(context, {
        phone,
        contactName: m.contact_name ?? null,
        leadId: null,
      });

      const { error } = await context.supabase.from("wa_messages").insert({
        user_id: context.userId,
        conversation_id: conversationId,
        direction: "entrada",
        body: m.body,
        status: "recebido",
        external_id: m.external_id ?? null,
        sent_at: when,
      });
      if (error) continue; // duplicada — já capturada antes
      saved++;

      await touchConversation(context, {
        conversationId,
        body: m.body,
        when,
        direction: "entrada",
        incrementUnread: true,
      });

      const leadId = await getConversationLead(context, conversationId);
      if (leadId) {
        await context.supabase
          .from("leads")
          .update({ status: "em_negociacao" })
          .eq("id", leadId)
          .in("status", ["novo", "contatado"]);
      }
    }
    return { saved };
  });
