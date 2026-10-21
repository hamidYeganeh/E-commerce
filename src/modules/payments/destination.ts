// Shared by both browser handoffs. Destinations are provider invoices, never arbitrary links.
export function paymentDestination(value: unknown) {
  if (typeof value !== "string") throw new Error("INVALID_PAYMENT_DESTINATION");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !["payment.zarinpal.com", "sandbox.zarinpal.com"].includes(url.hostname) ||
      !/^\/pg\/StartPay\/[AS][a-zA-Z0-9]{20,80}$/.test(url.pathname)) throw new Error("INVALID_PAYMENT_DESTINATION");
  return url.href;
}
