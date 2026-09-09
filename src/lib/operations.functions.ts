import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const getMessagingMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const counts: { sent: number; delivered: number; read: number; failed: number } = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };
    for (const status of Object.keys(counts) as Array<keyof typeof counts>) {
      const { count } = await db
        .from("wa_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("direction", "saida")
        .eq("status", status);
      counts[status] = count ?? 0;
    }
    const { count: inbound } = await db
        .from("wa_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("direction", "entrada"),
      { count: optOut } = await db
        .from("wa_suppressions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
      { count: handoff } = await db
        .from("wa_conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .neq("handoff_status", "none");
    return { ...counts, inbound: inbound ?? 0, optOut: optOut ?? 0, handoff: handoff ?? 0 };
  });
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any,
      { data } = await db
        .from("wa_notifications")
        .select("*")
        .eq("user_id", context.userId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
    return { notifications: data ?? [] };
  });
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await db
      .from("wa_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });
