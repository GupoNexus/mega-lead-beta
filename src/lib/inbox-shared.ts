import { z } from "zod";

export function onlyDigits(raw: string) {
  return raw.replace(/\D/g, "");
}

export function normalizePhone(raw: string) {
  const d = onlyDigits(raw);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export const messageInputSchema = z.object({
  phone: z.string().min(8).max(25),
  body: z.string().min(1).max(8000),
  contact_name: z.string().max(160).nullable().optional(),
  external_id: z.string().max(200).nullable().optional(),
  sent_at: z.string().datetime().optional(),
});

export const outgoingSchema = messageInputSchema.extend({
  lead_id: z.string().uuid().nullable().optional(),
});

export const ingestSchema = z.object({
  messages: z.array(messageInputSchema).max(200),
});

export const sessionSchema = z.object({
  status: z.enum(["conectado", "desconectado", "aguardando_qr"]),
  phone_number: z.string().max(30).nullable().optional(),
  display_name: z.string().max(120).nullable().optional(),
  extension_version: z.string().max(20).nullable().optional(),
});

export const conversationIdSchema = z.object({
  conversation_id: z.string().uuid(),
});

export function formatPhoneBr(raw: string) {
  const d = onlyDigits(raw);
  if (d.length < 12) return raw;
  const ddd = d.slice(2, 4);
  const num = d.slice(4);
  const mid = num.length > 8 ? num.slice(0, 5) : num.slice(0, 4);
  const end = num.length > 8 ? num.slice(5) : num.slice(4);
  return `(${ddd}) ${mid}-${end}`;
}
