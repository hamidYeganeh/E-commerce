import { authenticatedApi } from "@/modules/identity/api";

export async function GET(request: Request) {
  return authenticatedApi(request, async (identity) => Response.json({ user: identity.user, roles: identity.roles, permissions: identity.permissions }), { staff: true });
}
