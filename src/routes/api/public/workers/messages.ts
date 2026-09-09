import { createFileRoute } from "@tanstack/react-router";
import { retryDelaySeconds } from "@/lib/message-policy";
export const Route = createFileRoute("/api/public/workers/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WORKER_CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any,
          now = new Date().toISOString();
        const { data: jobs, error } = await db
          .from("wa_message_jobs")
          .select("*")
          .in("status", ["queued", "retry"])
          .lte("next_attempt_at", now)
          .order("next_attempt_at")
          .limit(25);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        let completed = 0,
          failed = 0,
          skipped = 0;
        for (const job of jobs ?? []) {
          const { data: locked } = await db
            .from("wa_message_jobs")
            .update({ status: "sending", locked_at: now, attempts: job.attempts + 1 })
            .eq("id", job.id)
            .in("status", ["queued", "retry"])
            .select("*")
            .maybeSingle();
          if (!locked) {
            skipped++;
            continue;
          }
          try {
            const { data: channel } = await db
              .from("wa_channels")
              .select("rate_limit_per_minute")
              .eq("id", job.channel_id)
              .single();
            const since = new Date(Date.now() - 60000).toISOString(),
              { count } = await db
                .from("wa_messages")
                .select("id", { count: "exact", head: true })
                .eq("channel_id", job.channel_id)
                .eq("direction", "saida")
                .gte("sent_at", since);
            if ((count ?? 0) >= (channel?.rate_limit_per_minute ?? 30)) {
              await db
                .from("wa_message_jobs")
                .update({
                  status: "retry",
                  next_attempt_at: new Date(Date.now() + 60000).toISOString(),
                  locked_at: null,
                })
                .eq("id", job.id);
              skipped++;
              continue;
            }
            if (job.kind === "ai_reply") {
              const { createAiReply, sendCloudMessage } =
                await import("@/lib/whatsapp-cloud.server");
              const { data: conv } = await db
                .from("wa_conversations")
                .select("*,wa_campaigns(*)")
                .eq("id", job.conversation_id)
                .single();
              if (!conv || conv.automation_status !== "ia") throw new Error("Automação pausada");
              const reply = await createAiReply({
                userId: job.user_id,
                conversationId: conv.id,
                inbound: job.payload.inbound,
                campaign: conv.wa_campaigns,
              });
              await sendCloudMessage({
                userId: job.user_id,
                channelId: job.channel_id,
                conversationId: conv.id,
                phone: conv.phone,
                body: reply,
                campaignId: conv.campaign_id,
              });
            } else {
              const { sendCloudMessage } = await import("@/lib/whatsapp-cloud.server");
              await sendCloudMessage({
                userId: job.user_id,
                channelId: job.channel_id,
                campaignId: job.campaign_id,
                ...job.payload,
              });
              if (job.target_id)
                await db
                  .from("wa_campaign_targets")
                  .update({
                    sent: true,
                    sent_at: new Date().toISOString(),
                    journey_status: "aguardando_resposta",
                    last_error: null,
                  })
                  .eq("id", job.target_id);
            }
            await db
              .from("wa_message_jobs")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                locked_at: null,
                last_error: null,
              })
              .eq("id", job.id);
            completed++;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e),
              dead = locked.attempts >= locked.max_attempts;
            await db
              .from("wa_message_jobs")
              .update({
                status: dead ? "dead_letter" : "retry",
                next_attempt_at: new Date(
                  Date.now() + retryDelaySeconds(locked.attempts) * 1000,
                ).toISOString(),
                last_error: message,
                locked_at: null,
              })
              .eq("id", job.id);
            if (job.target_id)
              await db
                .from("wa_campaign_targets")
                .update({ journey_status: dead ? "erro" : "retry", last_error: message })
                .eq("id", job.target_id);
            if (dead)
              await db
                .from("wa_notifications")
                .insert({
                  user_id: job.user_id,
                  type: "message_failed",
                  title: "Mensagem não enviada",
                  body: message,
                  entity_id: job.id,
                });
            failed++;
          }
        }
        return Response.json({ processed: (jobs ?? []).length, completed, failed, skipped });
      },
    },
  },
});
