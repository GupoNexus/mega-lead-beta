import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const exportTables = [
  "profiles",
  "leads",
  "scrape_jobs",
  "wa_channels",
  "wa_campaigns",
  "wa_campaign_targets",
  "wa_conversations",
  "wa_messages",
  "wa_suppressions",
  "wa_consent_events",
  "wa_handoff_events",
];
export const getPrivacySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any,
      { data } = await db
        .from("user_privacy_settings")
        .select("retention_days")
        .eq("user_id", context.userId)
        .maybeSingle();
    return { retentionDays: data?.retention_days ?? 365 };
  });
export const savePrivacySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ retentionDays: z.number().int().min(30).max(3650) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any,
      { error } = await db
        .from("user_privacy_settings")
        .upsert({
          user_id: context.userId,
          retention_days: data.retentionDays,
          updated_at: new Date().toISOString(),
        });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any,
      result: Record<string, any> = {
        exportedAt: new Date().toISOString(),
        userId: context.userId,
      };
    for (const table of exportTables) {
      const query = db.from(table).select("*");
      const { data, error } =
        table === "profiles"
          ? await query.eq("id", context.userId)
          : await query.eq("user_id", context.userId);
      result[table] = error ? { error: String(error.message) } : (data ?? []);
    }
    return result as any;
  });
export const deleteMyBusinessData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ confirmation: z.literal("EXCLUIR MEUS DADOS") }).parse(d))
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    for (const table of [
      "wa_notifications",
      "wa_consent_events",
      "wa_suppressions",
      "wa_message_jobs",
      "wa_campaign_jobs",
      "wa_messages",
      "wa_conversations",
      "wa_campaign_targets",
      "wa_campaigns",
      "wa_templates",
      "wa_channels",
      "scrape_jobs",
      "leads",
    ]) {
      await db.from(table).delete().eq("user_id", context.userId);
    }
    return {
      ok: true,
      note: "Dados operacionais excluídos. Exclusão da conta Auth requer processo administrativo do backend.",
    };
  });
