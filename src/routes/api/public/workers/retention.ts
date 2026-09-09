import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/workers/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WORKER_CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any,
          { data: settings } = await db
            .from("user_privacy_settings")
            .select("user_id,retention_days");
        let users = 0;
        for (const s of settings ?? []) {
          const cutoff = new Date(Date.now() - s.retention_days * 86400000).toISOString();
          await db.from("wa_messages").delete().eq("user_id", s.user_id).lt("sent_at", cutoff);
          await db.from("wa_webhook_events").delete().lt("received_at", cutoff);
          users++;
        }
        return Response.json({ ok: true, users });
      },
    },
  },
});
