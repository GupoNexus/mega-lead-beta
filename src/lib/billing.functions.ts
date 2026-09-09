import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const checkoutInput = z.object({
  plan: z.enum(["diario", "mensal", "trimestral", "anual"]),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(255),
  document: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11, { message: "CPF inválido" }),
});

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkoutInput.parse(data))
  .handler(async ({ data, context }) => {
    const { getPlan } = await import("./plans");
    const { createPixTransaction } = await import("./velani.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const plan = getPlan(data.plan);
    if (!plan) throw new Error("Plano inválido");

    const origin = process.env["SITE_URL"] ?? "https://megalead.lovable.app";
    const externalId = `lm-${context.userId.slice(0, 8)}-${Date.now()}`;

    const tx = await createPixTransaction({
      amountCents: plan.priceCents,
      title: `Mega Lead ${plan.name}`,
      externalId,
      postbackUrl: `${origin}/api/public/webhooks/velani`,
      customer: { name: data.name, email: data.email, document: data.document },
    });

    if (!tx.id) throw new Error("Não foi possível gerar o PIX. Tente novamente.");

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: context.userId,
        plan: plan.id,
        amount_cents: plan.priceCents,
        status: "pending",
        transaction_id: tx.id,
        external_id: externalId,
        pix_code: tx.pixQrCode ?? null,
        pix_image: tx.pixQrCodeImage ?? null,
        customer_name: data.name,
        customer_email: data.email,
        customer_document: data.document,
        expires_at: tx.expiresAt ?? null,
        raw: tx as never,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return {
      paymentId: row.id,
      transactionId: tx.id,
      pixCode: tx.pixQrCode ?? null,
      pixImage: tx.pixQrCodeImage ?? null,
      expiresAt: tx.expiresAt ?? null,
      amountCents: plan.priceCents,
      planName: plan.name,
    };
  });

export const checkPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTransaction } = await import("./velani.server");
    const { activatePayment } = await import("./billing.server");

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, status, transaction_id")
      .eq("id", data.paymentId)
      .maybeSingle();

    if (!payment || payment.user_id !== context.userId) throw new Error("Pagamento não encontrado");
    if (payment.status === "paid") return { status: "paid" as const };
    if (!payment.transaction_id) return { status: payment.status };

    const tx = await getTransaction(payment.transaction_id);
    const status = String(tx.status ?? "").toLowerCase();

    if (status === "paid" || status === "approved" || status === "completed") {
      await activatePayment(payment.transaction_id, tx);
      return { status: "paid" as const };
    }

    return { status: status || "pending" };
  });

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const active = !!data && new Date(data.expires_at).getTime() > Date.now();
    return { subscription: data ?? null, active };
  });

export const getMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("payments")
      .select("id, plan, amount_cents, status, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return { payments: data ?? [] };
  });

export const adminListSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ status: z.string().max(20).optional(), search: z.string().max(120).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores");

    let query = context.supabase
      .from("payments")
      .select(
        "id, user_id, plan, amount_cents, status, customer_name, customer_email, customer_document, transaction_id, created_at, paid_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.search) query = query.ilike("customer_email", `%${data.search}%`);

    const { data: payments, error } = await query;
    if (error) throw new Error(error.message);

    const { data: subs } = await context.supabase
      .from("subscriptions")
      .select("user_id, plan, status, expires_at")
      .order("expires_at", { ascending: false })
      .limit(300);

    const list = payments ?? [];
    const paid = list.filter((p) => p.status === "paid");
    const now = Date.now();

    return {
      payments: list,
      subscriptions: subs ?? [],
      stats: {
        total: list.length,
        paidCount: paid.length,
        revenueCents: paid.reduce((s, p) => s + p.amount_cents, 0),
        pendingCount: list.filter((p) => p.status === "pending").length,
        activeSubs: (subs ?? []).filter((s) => new Date(s.expires_at).getTime() > now).length,
      },
    };
  });

export const TRIAL_MINUTES = 30;

export const getAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Acesso liberado para todos — sem trial nem exigência de plano.
    return {
      subscribed: true,
      unlimited: true,
      plan: sub?.plan ?? "ilimitado",
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      trialActive: false,
      allowed: true,
    };
  });

