import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { z } from "zod";
import { asciiDigits, phoneSchema } from "../identity/input";
import { DomainError } from "../../shared/domain-error";

const date = z.string().transform(asciiDigits).refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1000 && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value));
const filtersSchema = z.object({
  q: z.string().trim().max(50).transform(asciiDigits).default(""),
  phone: z.union([z.literal(""), phoneSchema]).default(""),
  status: z.enum(["", "AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]).default(""),
  payment: z.enum(["", "review"]).default(""),
  shipment: z.enum(["", "PACKED", "SHIPPED", "DELIVERED"]).default(""),
  from: date.default(""), to: date.default(""),
  page: z.string().transform(asciiDigits).pipe(z.string().regex(/^\d{1,6}$/)).transform(Number).pipe(z.number().int().min(1).max(100000)).default(1),
}).refine(value => !value.from || !value.to || value.from <= value.to);

async function reader(tx: Prisma.TransactionClient, actorId: string) {
  const user = await tx.user.findFirst({ where: { id: actorId, disabledAt: null }, select: { roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } } } });
  const permissions = new Set(user?.roles.flatMap(r => r.role.permissions.map(p => p.permission.key)));
  if (!permissions.has("orders.read")) throw new DomainError("FORBIDDEN", "دسترسی به سفارش‌ها مجاز نیست.");
  return { customers: permissions.has("customers.read"), payments: permissions.has("payments.read"), address: permissions.has("customers.read") || permissions.has("shipments.write") };
}

export async function listAdminOrders(db: PrismaClient, actorId: string, input: unknown) {
  return db.$transaction(async tx => {
    const access = await reader(tx, actorId);
    const parsed = filtersSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("INVALID_FILTERS", "فیلترها را بررسی کنید؛ تاریخ باید میلادی و بازهٔ تاریخ معتبر باشد.");
    const filters = parsed.data;
    if ((filters.phone && !access.customers) || (filters.payment && !access.payments)) throw new DomainError("FORBIDDEN", "مجوز استفاده از این فیلتر را ندارید.");
    // PostgreSQL owns timezone conversion, including historical daylight-saving
    // rules. The inclusive calendar end becomes the NEXT local midnight.
    // Return UTC timestamp values explicitly, independent of DB session timezone.
    const [bounds] = filters.from || filters.to ? await tx.$queryRaw<{ start: Date | null; end: Date | null }[]>`SELECT (${filters.from || null}::date::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC' AS start, ((${filters.to || null}::date + 1)::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC' AS end` : [{ start: null, end: null }];
    const number = /^\d{1,10}$/.test(filters.q) && Number(filters.q) <= 2147483647 ? Number(filters.q) : undefined;
    const base: Prisma.OrderWhereInput = { AND: [
      ...(filters.q ? [{ OR: [{ user: { name: { contains: filters.q, mode: "insensitive" as const } } }, ...(number !== undefined ? [{ number }] : [])] }] : []),
      ...(filters.phone ? [{ OR: [{ user: { phoneNumber: filters.phone } }, { address: { phoneNumber: filters.phone } }] }] : []),
      ...(filters.payment ? [{ payments: { some: { status: "NEEDS_REVIEW" as const } } }] : []),
      ...(filters.shipment ? [{shipments:{some:{status:filters.shipment}}}] : []),
      ...(bounds.start || bounds.end ? [{ createdAt: { ...(bounds.start ? { gte: bounds.start } : {}), ...(bounds.end ? { lt: bounds.end } : {}) } }] : []),
    ] };
    const where: Prisma.OrderWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
    const total = await tx.order.count({ where });
    const orders = await tx.order.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * 20, take: 20, select: { id: true, number: true, status: true, totalRial: true, createdAt: true, user: { select: { name: true } }, _count: { select: { items: true } } } });
    // Metrics retain all filters except the selected Order status.
    const counts = await tx.order.groupBy({ by: ["status"], where: base, _count: true });
    return { filters, total, orders, counts };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getAdminOrder(db: PrismaClient, actorId: string, id: string) {
  return db.$transaction(async tx => {
    const access = await reader(tx, actorId);
    const order = await tx.order.findUnique({ where: { id }, select: {
      id: true, number: true, status: true, version: true, createdAt: true,giftMessage:true,
      subtotalRial: true, discountRial: true, shippingRial: true, totalRial: true,
      ...(access.address ? { customerNote: true, address: { select: { recipientName: true, phoneNumber: true, province: true, city: true, addressLine: true, postalCode: true } } } : {}),
      user: { select: { name: true } },
      items: { select: { id: true, productName: true, variantName: true, sku: true, quantity: true, unitPriceRial: true, totalRial: true } },
      shipments: { select: { id: true, status: true, carrier: true, trackingNumber: true,items:{select:{orderItemId:true,quantity:true}} } },
      events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, type: true, note: true, createdAt: true } },
    } });
    if (!order) return null;
    const payments = access.payments ? await tx.paymentAttempt.findMany({ where: { orderId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, provider: true, status: true, amountRial: true, transactionId: true, verifiedAt: true, createdAt: true, updatedAt: true, failureCode: true } }) : null;
    return { ...order, payments: payments?.map(p => ({
      id: p.id, provider: (p.provider === "zarinpal"||p.provider.startsWith("zarinpal:")) ? "zarinpal" as const : p.provider === "zarinpal-sandbox" ? "sandbox" as const : p.provider==="coupon"?"coupon" as const:"other" as const,
      status: p.status, amountRial: p.amountRial.toString(), transactionId: p.transactionId && /^\d{1,100}$/.test(p.transactionId) ? p.transactionId : null,
      verifiedAt: p.verifiedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
      reason: p.status === "NEEDS_REVIEW" ? p.failureCode === "MISSING_AUTHORITY_RECONCILE_MANUALLY" ? "manual" as const : "uncertain" as const : p.status === "FAILED" ? "failed" as const : null,
    })) ?? null };
  }, { isolationLevel: "RepeatableRead" });
}
export type AdminOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;
