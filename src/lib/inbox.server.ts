import { onlyDigits } from "./inbox-shared";

type Ctx = {
  // Supabase client from requireSupabaseAuth middleware (RLS as the user)
  supabase: any;
  userId: string;
};

export async function findLeadByPhone(context: Ctx, phone: string): Promise<string | null> {
  const tail = phone.slice(-8);
  if (tail.length < 8) return null;
  const { data } = await context.supabase
    .from("leads")
    .select("id, phone")
    .not("phone", "is", null)
    .limit(2000);
  const match = (data ?? []).find(
    (l: { id: string; phone: string | null }) => l.phone && onlyDigits(l.phone).endsWith(tail),
  );
  return match?.id ?? null;
}

export async function ensureConversation(
  context: Ctx,
  args: { phone: string; contactName: string | null; leadId: string | null },
): Promise<string> {
  const { data: existing } = await context.supabase
    .from("wa_conversations")
    .select("id, lead_id, contact_name")
    .eq("user_id", context.userId)
    .eq("phone", args.phone)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.lead_id) {
      const leadId = args.leadId ?? (await findLeadByPhone(context, args.phone));
      if (leadId) patch["lead_id"] = leadId;
    }
    if (!existing.contact_name && args.contactName) patch["contact_name"] = args.contactName;
    if (Object.keys(patch).length > 0) {
      await context.supabase.from("wa_conversations").update(patch).eq("id", existing.id);
    }
    return existing.id as string;
  }

  const leadId = args.leadId ?? (await findLeadByPhone(context, args.phone));
  const { data: created, error } = await context.supabase
    .from("wa_conversations")
    .insert({
      user_id: context.userId,
      phone: args.phone,
      contact_name: args.contactName,
      lead_id: leadId,
      unread_count: 0,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Falha ao criar conversa");
  return created.id as string;
}

export async function touchConversation(
  context: Ctx,
  args: {
    conversationId: string;
    body: string;
    when: string;
    direction: "entrada" | "saida";
    incrementUnread?: boolean;
  },
) {
  const patch: Record<string, unknown> = {
    last_message: args.body.slice(0, 400),
    last_message_at: args.when,
    last_direction: args.direction,
    updated_at: new Date().toISOString(),
  };
  if (args.incrementUnread) {
    const { data: conv } = await context.supabase
      .from("wa_conversations")
      .select("unread_count")
      .eq("id", args.conversationId)
      .maybeSingle();
    patch["unread_count"] = (conv?.unread_count ?? 0) + 1;
  }
  await context.supabase.from("wa_conversations").update(patch).eq("id", args.conversationId);
}

export async function getConversationLead(
  context: Ctx,
  conversationId: string,
): Promise<string | null> {
  const { data } = await context.supabase
    .from("wa_conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.lead_id ?? null;
}
