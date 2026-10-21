export function priceToman(rial: string) {
  const value = BigInt(rial);
  const fraction = value % 10n;
  return `${(value / 10n).toLocaleString("fa-IR")}${fraction ? `٫${fraction.toLocaleString("fa-IR")}` : ""}`;
}
export const statusNames = { DRAFT: "پیش‌نویس", ACTIVE: "منتشرشده", ARCHIVED: "بایگانی" };
export function tomanInput(rial: string) { const n = BigInt(rial || "0"); return `${n / 10n}${n % 10n ? `.${n % 10n}` : ""}`; }
export function rialInput(toman: string) { if (!/^\d{0,15}(\.\d?)?$/.test(toman)) return null; const [whole, fraction] = toman.split("."); return (BigInt(whole || "0") * 10n + BigInt(fraction || "0")).toString(); }
