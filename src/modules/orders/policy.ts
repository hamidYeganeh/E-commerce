import { DomainError } from "../../shared/domain-error";
import type { OrderStatus } from "../../generated/prisma/enums";

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  AWAITING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
  context: { paymentVerified?: boolean; allDelivered?: boolean; anyShipped?: boolean } = {},
) {
  if (!transitions[from].includes(to)) throw new DomainError("INVALID_ORDER_TRANSITION", `${from} cannot become ${to}`);
  if (to === "CONFIRMED" && !context.paymentVerified) throw new DomainError("PAYMENT_NOT_VERIFIED", "Confirmation requires verified payment");
  if (to === "COMPLETED" && !context.allDelivered) throw new DomainError("NOT_DELIVERED", "Completion requires delivery of all items");
  if (to === "CANCELLED" && context.anyShipped) throw new DomainError("ALREADY_SHIPPED", "Shipped items require the returns workflow");
}
