import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: { handlers: { GET: async () => Response.json({
    ok: true,
    service: "mega-lead-backend",
    version: "1.1.0",
    capabilities: {
      supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_PUBLISHABLE_KEY,
      serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      googlePlaces: !!process.env.GOOGLE_PLACES_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      meta: !!process.env.META_APP_ID && !!process.env.META_CONFIG_ID && !!process.env.META_APP_SECRET,
      tokenEncryption: !!(process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY_V1),
      worker: !!process.env.WORKER_CRON_SECRET,
    },
    time: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } }) } },
});
