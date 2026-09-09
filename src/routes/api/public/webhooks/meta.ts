import { createFileRoute } from "@tanstack/react-router";
import { normalizeWhatsAppPhone } from "@/lib/message-policy";

async function validSignature(request: Request, raw: string) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  const received = request.headers.get("x-hub-signature-256")?.replace(/^sha256=/, "");
  if (!received) return false;
  const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    expected = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
const messageText = (m: any) =>
  m.text?.body ||
  m.button?.text ||
  m.interactive?.button_reply?.title ||
  m.interactive?.list_reply?.title ||
  m.image?.caption ||
  m.document?.caption ||
  `[${m.type || "mensagem"}]`;

export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url),
          challenge = url.searchParams.get("hub.challenge"),
          token = url.searchParams.get("hub.verify_token");
        if (!challenge || !token) return new Response("Missing verification", { status: 400 });
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
        return expected && token === expected
          ? new Response(challenge)
          : new Response("Invalid token", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!(await validSignature(request, raw)))
          return new Response(
            process.env.META_APP_SECRET ? "Invalid signature" : "META_APP_SECRET missing",
            { status: process.env.META_APP_SECRET ? 401 : 503 },
          );
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        for (const entry of payload.entry ?? [])
          for (const change of entry.changes ?? []) {
            const value = change.value ?? {},
              phoneNumberId = value.metadata?.phone_number_id;
            if (!phoneNumberId) continue;
            const { data: channel } = await db
              .from("wa_channels")
              .select("*")
              .eq("phone_number_id", phoneNumberId)
              .eq("mode", "live")
              .maybeSingle();
            if (!channel) continue;
            for (const status of value.statuses ?? []) {
              const eventId = `status:${status.id}:${status.status}:${status.timestamp || ""}`,
                { error: dedupe } = await db.from("wa_webhook_events").insert({
                  id: eventId,
                  channel_id: channel.id,
                  event_type: "status",
                  payload: status,
                  status: "processed",
                  processed_at: new Date().toISOString(),
                });
              if (dedupe) continue;
              const patch: any = { status: status.status };
              if (status.status === "delivered")
                patch.delivered_at = new Date(Number(status.timestamp) * 1000).toISOString();
              if (status.status === "read")
                patch.read_at = new Date(Number(status.timestamp) * 1000).toISOString();
              if (status.status === "failed") {
                patch.error_code = String(status.errors?.[0]?.code || "");
                patch.error_message = status.errors?.[0]?.title || status.errors?.[0]?.message;
              }
              await db
                .from("wa_messages")
                .update(patch)
                .eq("external_id", status.id)
                .eq("channel_id", channel.id);
              if (status.status === "failed")
                await db.from("wa_notifications").insert({
                  user_id: channel.user_id,
                  type: "message_failed",
                  title: "Falha de entrega",
                  body: patch.error_message,
                });
            }
            for (const inbound of value.messages ?? []) {
              const eventId = `message:${inbound.id}`,
                { error: dedupe } = await db.from("wa_webhook_events").insert({
                  id: eventId,
                  channel_id: channel.id,
                  event_type: "message",
                  payload: inbound,
                  status: "processing",
                });
              if (dedupe) continue;
              const phone = normalizeWhatsAppPhone(inbound.from),
                body = messageText(inbound),
                when = new Date(Number(inbound.timestamp) * 1000 || Date.now()).toISOString(),
                windowExpires = new Date(new Date(when).getTime() + 24 * 3600 * 1000).toISOString();
              let { data: conversation } = await db
                .from("wa_conversations")
                .select("*,wa_campaigns(*)")
                .eq("channel_id", channel.id)
                .eq("phone", phone)
                .maybeSingle();
              if (!conversation) {
                const contact = value.contacts?.find(
                  (c: any) => normalizeWhatsAppPhone(c.wa_id || "") === phone,
                );
                const { data: created } = await db
                  .from("wa_conversations")
                  .insert({
                    user_id: channel.user_id,
                    channel_id: channel.id,
                    phone,
                    contact_name: contact?.profile?.name,
                    last_message: body,
                    last_message_at: when,
                    last_direction: "entrada",
                    unread_count: 1,
                    customer_service_window_expires_at: windowExpires,
                    automation_status: "humano",
                    handoff_status: "pending",
                  })
                  .select("*")
                  .single();
                conversation = created;
              }
              if (!conversation) continue;
              await db.from("wa_messages").insert({
                user_id: channel.user_id,
                channel_id: channel.id,
                conversation_id: conversation.id,
                direction: "entrada",
                body,
                message_type: inbound.type || "text",
                status: "received",
                external_id: inbound.id,
                sent_at: when,
              });
              const campaign = conversation.wa_campaigns,
                normalized = body.toLocaleLowerCase("pt-BR"),
                optOut = (
                  campaign?.opt_out_keywords ?? [
                    "sair",
                    "parar",
                    "cancelar",
                    "não quero",
                    "nao quero",
                  ]
                ).some((k: string) => normalized.includes(k)),
                handoff = (campaign?.handoff_keywords ?? ["humano", "atendente", "pessoa"]).some(
                  (k: string) => normalized.includes(k),
                );
              await db
                .from("wa_conversations")
                .update({
                  last_message: body,
                  last_message_at: when,
                  last_direction: "entrada",
                  unread_count: (conversation.unread_count ?? 0) + 1,
                  customer_service_window_expires_at: windowExpires,
                  automation_status: optOut
                    ? "opt_out"
                    : handoff
                      ? "humano"
                      : conversation.automation_status,
                  opted_out_at: optOut ? when : conversation.opted_out_at,
                  handoff_at: handoff ? when : conversation.handoff_at,
                  handoff_status: handoff ? "pending" : conversation.handoff_status,
                })
                .eq("id", conversation.id);
              if (optOut) {
                await db.from("wa_suppressions").upsert(
                  {
                    user_id: channel.user_id,
                    channel_id: channel.id,
                    phone,
                    reason: "opt_out",
                    source: "whatsapp_inbound",
                  },
                  { onConflict: "user_id,channel_id,phone" },
                );
                await db.from("wa_consent_events").insert({
                  user_id: channel.user_id,
                  channel_id: channel.id,
                  phone,
                  event: "withdrawn",
                  source: "whatsapp_inbound",
                  legal_basis: "withdrawal",
                  evidence: { message_id: inbound.id },
                });
              }
              if (handoff) {
                await db.from("wa_handoff_events").insert({
                  user_id: channel.user_id,
                  conversation_id: conversation.id,
                  event: "requested",
                  metadata: { message_id: inbound.id },
                });
                await db.from("wa_notifications").insert({
                  user_id: channel.user_id,
                  type: "handoff",
                  title: "Atendimento humano solicitado",
                  body: `${conversation.contact_name || phone} pediu atendimento`,
                  entity_id: conversation.id,
                });
              }
              if (
                !optOut &&
                !handoff &&
                campaign?.auto_reply !== false &&
                channel.ai_enabled &&
                conversation.automation_status !== "humano"
              )
                await db.from("wa_message_jobs").insert({
                  user_id: channel.user_id,
                  campaign_id: conversation.campaign_id,
                  channel_id: channel.id,
                  conversation_id: conversation.id,
                  kind: "ai_reply",
                  payload: { inbound },
                  status: "queued",
                  next_attempt_at: new Date().toISOString(),
                  idempotency_key: `ai:${inbound.id}`,
                });
              await db
                .from("wa_webhook_events")
                .update({ status: "processed", processed_at: new Date().toISOString() })
                .eq("id", eventId);
            }
          }
        return Response.json({ received: true });
      },
    },
  },
});
