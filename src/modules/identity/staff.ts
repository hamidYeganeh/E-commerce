import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";

const staffSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(2).max(100), role: z.string().min(1),
  password: z.string().min(12).max(128),
});

// Local operator entry point only. No public signup or promotion-by-email endpoint.
export async function createStaffAccount(db: PrismaClient, input: z.input<typeof staffSchema>) {
  const data = staffSchema.parse(input);
  const password = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { key: data.role } });
    const user = await tx.user.create({ data: {
      name: data.name, email: data.email,
      roles: { create: { roleId: role.id } },
    } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "identity.staff_provisioned_locally", entityType: "User", entityId: user.id, changes: { role: data.role } } });
    return { id: user.id, email: user.email };
  });
}
