import type { Prisma } from "../../generated/prisma/client";
import { DomainError } from "../../shared/domain-error";
import type { PermissionKey } from "./permissions";

// userId must come from a verified server session, never from a request body.
export async function requirePermission(
  db: Prisma.TransactionClient,
  userId: string,
  permission: PermissionKey,
) {
  const user = await db.user.findFirst({
    where: {
      id: userId,
      disabledAt: null,
      roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
    },
    select: { id: true },
  });
  if (!user) throw new DomainError("FORBIDDEN", "You cannot perform this operation");
}
