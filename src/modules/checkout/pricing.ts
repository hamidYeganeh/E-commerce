import { DomainError } from "../../shared/domain-error";

export function calculateTotals(
  items: ReadonlyArray<{ unitPriceRial: bigint; quantity: number }>,
  discountRial = 0n,
  shippingRial = 0n,
) {
  if (!items.length) throw new DomainError("EMPTY_CART", "Cart must contain an item");
  let subtotalRial = 0n;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.unitPriceRial < 0n) {
      throw new DomainError("INVALID_LINE", "Invalid price or quantity");
    }
    subtotalRial += item.unitPriceRial * BigInt(item.quantity);
  }
  if (discountRial < 0n || discountRial > subtotalRial || shippingRial < 0n) {
    throw new DomainError("INVALID_TOTALS", "Invalid discount or shipping amount");
  }
  return { subtotalRial, discountRial, shippingRial, totalRial: subtotalRial - discountRial + shippingRial };
}
