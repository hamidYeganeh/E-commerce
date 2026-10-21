import type { Prisma } from "../../generated/prisma/client";
import { normalizePhone } from "../identity/input";

// The customer list and its export must identify the same accounts.
export function customerSearchWhere(query = ""): Prisma.UserWhereInput {
  const q = query.slice(0, 100);
  let phone: string | undefined;
  try { phone = normalizePhone(q); } catch {}
  return {
    roles: { none: {} },
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      ...(phone ? [{ phoneNumber: phone }] : []),
    ] } : {}),
  };
}
