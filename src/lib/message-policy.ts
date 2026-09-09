export type DeliveryStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "dead_letter";

export function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function isCustomerServiceWindowOpen(expiresAt: string | null | undefined, now = Date.now()) {
  return !!expiresAt && new Date(expiresAt).getTime() > now;
}

export function chooseOutboundKind(args: { windowExpiresAt?: string | null; approvedTemplate?: boolean; now?: number }) {
  if (isCustomerServiceWindowOpen(args.windowExpiresAt, args.now)) return "text" as const;
  if (args.approvedTemplate) return "template" as const;
  return "blocked" as const;
}

export function retryDelaySeconds(attempt: number, baseSeconds = 15, maxSeconds = 3600) {
  return Math.min(maxSeconds, baseSeconds * 2 ** Math.max(0, attempt - 1));
}

export function suppressionKey(userId: string, channelId: string, phone: string) {
  return `${userId}:${channelId}:${normalizeWhatsAppPhone(phone)}`;
}

export function webhookEventId(kind: "message" | "status", externalId: string, status?: string, timestamp?: string) {
  return kind === "message" ? `message:${externalId}` : `status:${externalId}:${status ?? "unknown"}:${timestamp ?? ""}`;
}

export function messageJobIdempotencyKey(campaignJobKey: string, targetId: string) {
  return `${campaignJobKey}:target:${targetId}`;
}
