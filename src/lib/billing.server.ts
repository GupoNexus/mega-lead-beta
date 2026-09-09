import { getPlan } from "./plans";

/** Marca um pagamento como pago e ativa/estende a assinatura do usuário. */
export async function activatePayment(transactionId: string, raw: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (!payment) return { ok: false as const, reason: "payment_not_found" };
  if (payment.status === "paid") return { ok: true as const, already: true };

  await supabaseAdmin
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString(), raw: raw as never })
    .eq("id", payment.id);

  const plan = getPlan(payment.plan);
  const days = plan?.days ?? 30;

  const { data: current } = await supabaseAdmin
    .from("subscriptions")
    .select("expires_at")
    .eq("user_id", payment.user_id)
    .maybeSingle();

  const now = Date.now();
  const base =
    current?.expires_at && new Date(current.expires_at).getTime() > now
      ? new Date(current.expires_at).getTime()
      : now;
  const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: payment.user_id,
      plan: payment.plan,
      status: "active",
      expires_at: expiresAt,
      last_payment_id: payment.id,
    },
    { onConflict: "user_id" },
  );

  return { ok: true as const, expiresAt };
}
