import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const apiVersion = "v23.0";

export const getConnectionHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data } = await db.from("wa_channels")
      .select("id,provider,name,status,mode,phone_number_id,business_account_id,display_phone,permissions,last_verified_at,last_error,rate_limit_per_minute,updated_at")
      .eq("user_id", context.userId).order("created_at");
    const backendUrl = process.env.PUBLIC_BACKEND_URL || process.env.SITE_URL || "";
    return {
      channels: data ?? [], backendUrl,
      meta: {
        configured: !!process.env.META_APP_ID && !!process.env.META_CONFIG_ID && !!process.env.META_APP_SECRET,
        appId: process.env.META_APP_ID || null,
        configId: process.env.META_CONFIG_ID || null,
        redirectUri: process.env.META_REDIRECT_URI || null,
      },
      qr: { enabled: process.env.ENABLE_UNOFFICIAL_QR_CONNECTOR === "true", official: false },
    };
  });

const embeddedInput = z.object({ code: z.string().min(8).max(4096), wabaId: z.string().min(3).max(100), phoneNumberId: z.string().min(3).max(100), displayPhone: z.string().max(40).optional(), name: z.string().max(120).optional() });

export const completeEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => embeddedInput.parse(d))
  .handler(async ({ data, context }) => {
    const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET, redirectUri = process.env.META_REDIRECT_URI;
    if (!appId || !appSecret || !process.env.META_CONFIG_ID) throw new Error("Embedded Signup não configurado no backend");
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code: data.code });
    if (redirectUri) params.set("redirect_uri", redirectUri);
    const tokenRes = await fetch(`https://graph.facebook.com/${apiVersion}/oauth/access_token?${params}`);
    const tokenJson = await tokenRes.json() as any;
    if (!tokenRes.ok || !tokenJson.access_token) throw new Error(tokenJson?.error?.message || "Falha ao trocar código Meta");
    const token = String(tokenJson.access_token);
    const debugRes = await fetch(`https://graph.facebook.com/${apiVersion}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`);
    const debug = await debugRes.json() as any;
    if (!debugRes.ok || !debug?.data?.is_valid) throw new Error("Token Meta inválido");
    const phoneRes = await fetch(`https://graph.facebook.com/${apiVersion}/${data.phoneNumberId}?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`);
    const phone = await phoneRes.json() as any;
    if (!phoneRes.ok) throw new Error(phone?.error?.message || "Número não acessível pelo token");
    const subRes = await fetch(`https://graph.facebook.com/${apiVersion}/${data.wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!subRes.ok) { const e = await subRes.json() as any; throw new Error(e?.error?.message || "Falha ao inscrever webhook no WABA"); }
    const { encryptSecret, activeEncryptionVersion } = await import("./secrets.server");
    const db = context.supabase as any;
    const row = {
      user_id: context.userId, provider: "meta", mode: "live", status: "connected", name: data.name || phone.verified_name || phone.display_phone_number,
      phone_number_id: data.phoneNumberId, business_account_id: data.wabaId, display_phone: data.displayPhone || phone.display_phone_number,
      access_token_encrypted: encryptSecret(token), token_key_version: activeEncryptionVersion(),
      token_expires_at: tokenJson.expires_in ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString() : null,
      permissions: debug?.data?.scopes ?? [], last_verified_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    };
    const { data: channel, error } = await db.from("wa_channels").upsert(row, { onConflict: "user_id,phone_number_id" }).select("id,status,display_phone").single();
    if (error) throw new Error(error.message);
    return { channel };
  });

export const testMetaChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: channel } = await db.from("wa_channels").select("*").eq("id", data.channelId).eq("user_id", context.userId).single();
    if (!channel?.access_token_encrypted) throw new Error("Canal sem token");
    const { decryptSecret } = await import("./secrets.server");
    const token = decryptSecret(channel.access_token_encrypted);
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${channel.phone_number_id}?fields=id,display_phone_number,quality_rating&access_token=${encodeURIComponent(token)}`);
    const body = await res.json() as any;
    await db.from("wa_channels").update({ status: res.ok ? "connected" : "error", last_verified_at: res.ok ? new Date().toISOString() : channel.last_verified_at, last_error: res.ok ? null : body?.error?.message }).eq("id", channel.id);
    if (!res.ok) throw new Error(body?.error?.message || "Canal indisponível");
    return { ok: true, displayPhone: body.display_phone_number, quality: body.quality_rating };
  });
