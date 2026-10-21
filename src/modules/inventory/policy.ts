import { DomainError } from "../../shared/domain-error";

export function availableQuantity(onHand: number, reserved: number): number {
  if (![onHand, reserved].every(Number.isSafeInteger) || reserved < 0 || onHand < reserved) {
    throw new DomainError("INVALID_STOCK", "Stock must satisfy 0 <= reserved <= onHand");
  }
  return onHand - reserved;
}
