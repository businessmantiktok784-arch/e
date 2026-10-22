// The optional public recipient must be copied from the verified web
// VITE_WHATSAPP_NUMBER configuration by the operator, never hard-coded here.
export function buildWhatsAppStartUrl(configuredNumber = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER): string {
  const number = configuredNumber?.replace(/\D/g, '') ?? '';
  // wa.me requires an international number without a leading plus sign.
  // Invalid optional config must not turn a partial value into a wrong contact.
  return number.length >= 7 && number.length <= 15 ? `https://wa.me/${number}?text=START` : 'https://wa.me/?text=START';
}
export function hasConfiguredWhatsAppRecipient(configuredNumber = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER): boolean {
  const digits = configuredNumber?.replace(/\D/g, '') ?? '';
  return digits.length >= 7 && digits.length <= 15;
}
