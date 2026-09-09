import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Brazilian mobile/landline without country code: 10 or 11 digits
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function openWhatsApp(phone: string, message?: string) {
  if (window.megaLeadDesktop?.whatsapp) {
    const search = new URLSearchParams({ phone: formatWhatsAppNumber(phone) });
    if (message) search.set("text", message);
    window.location.assign("/inbox?" + search.toString());
    return;
  }
  const url = message
    ? `https://wa.me/${formatWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${formatWhatsAppNumber(phone)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
