/** Contas de cortesia: e-mails terminados em "99" antes do @ têm acesso ilimitado. */
export function isUnlimitedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return local.endsWith("99");
}
