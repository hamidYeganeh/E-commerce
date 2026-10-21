import { authenticatedApi } from "@/modules/identity/api";
import { getDatabase } from "@/infrastructure/database/server";

export async function GET(request: Request) {
  return authenticatedApi(request, async (identity) => {
    const sessions = await getDatabase().session.findMany({
      where: { userId: identity.user.id, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true }, orderBy: { createdAt: "desc" }, take: 100,
    });
    return Response.json({ sessions: sessions.map((session) => ({ ...session, current: session.id === identity.sessionId })) });
  });
}

export async function DELETE(request: Request) {
  return authenticatedApi(request, async (identity) => {
    // This slice only offers "sign out everywhere"; no untrusted userId/token is accepted.
    await getDatabase().$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: identity.user.id } });
      await tx.auditLog.create({ data: { actorId: identity.user.id, action: "identity.sessions_revoked", entityType: "User", entityId: identity.user.id } });
    });
    return Response.json({ status: true });
  });
}
