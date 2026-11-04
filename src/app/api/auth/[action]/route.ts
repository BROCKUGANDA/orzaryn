// ORZARYN — auth endpoints: signup | login | logout | switch-org (POST), me (GET)
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { endSession, loginUser, resolvePrincipal, setActiveOrg, startSession, signUpUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { permissionsOf } from "@/lib/rbac";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export const POST = api(
  async (ctx) => {
    const action = ctx.req.nextUrl?.pathname?.split("/").pop() ?? "";
    const ip = ctx.req.headers.get("x-forwarded-for") ?? "local";

    // strict rate limits on auth endpoints
    const rl = rateLimit(`auth:${ip}`, { capacity: 10, refillPerMinute: 10 });
    if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many attempts; try again shortly");

    if (action === "signup") {
      const b = await ctx.body<{ email: string; name: string; password: string }>();
      const user = await signUpUser(b);
      await startSession(user.id, { ip, userAgent: ctx.req.headers.get("user-agent") ?? undefined });
      await audit({ actorType: "USER", actorId: user.id, action: "auth.signup", resourceType: "user", resourceId: user.id, ip, requestId: ctx.requestId });
      return ok({ user: { id: user.id, email: user.email, name: user.name } });
    }
    if (action === "login") {
      const b = await ctx.body<{ email: string; password: string }>();
      const user = await loginUser(b);
      const memberships = await db.membership.findMany({ where: { userId: user.id } });
      const activeOrgId = memberships.length === 1 ? memberships[0].orgId : null;
      const membership = memberships.find((m) => m.orgId === activeOrgId);
      await startSession(user.id, { ip, userAgent: ctx.req.headers.get("user-agent") ?? undefined, activeOrgId: activeOrgId ?? undefined });
      await audit({ orgId: activeOrgId, actorType: "USER", actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, ip, requestId: ctx.requestId });
      return ok({
        user: { id: user.id, email: user.email, name: user.name },
        orgId: activeOrgId,
        role: membership?.role ?? null,
      });
    }
    if (action === "logout") {
      const p = await resolvePrincipal();
      if (p && p.kind === "USER") await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "auth.logout", resourceType: "user", resourceId: p.userId, requestId: ctx.requestId });
      await endSession();
      return ok({ loggedOut: true });
    }
    if (action === "switch-org") {
      const p = await resolvePrincipal();
      if (!p || p.kind !== "USER") throw new AppError("UNAUTHENTICATED", "Sign-in required");
      const b = await ctx.body<{ orgId: string }>();
      await setActiveOrg(p.userId, b.orgId);
      const membership = await db.membership.findUnique({
        where: { userId_orgId: { userId: p.userId, orgId: b.orgId } },
      });
      return ok({ orgId: b.orgId, role: membership?.role ?? null });
    }
    throw new AppError("NOT_FOUND", "Unknown auth action");
  },
  { limit: { capacity: 20, refillPerMinute: 20 } },
);

export const GET = api(async (ctx) => {
  const action = ctx.req.nextUrl?.pathname?.split("/").pop() ?? "";
  if (action !== "me") throw new AppError("NOT_FOUND", "Unknown auth endpoint");
  const p = await resolvePrincipal();
  if (!p || p.kind !== "USER") return ok({ user: null });
  const memberships = await db.membership.findMany({
    where: { userId: p.userId },
    include: { org: { select: { id: true, name: true, slug: true, status: true } } },
  });
  const activeOrg = memberships.find((m) => m.orgId === p.orgId) ?? null;
  return ok({
    user: { id: p.userId, email: p.email, name: p.name },
    orgs: memberships.map((m) => ({ ...m.org, role: m.role })),
    activeOrgId: activeOrg?.org.id ?? null,
    role: activeOrg?.role ?? null,
    permissions: activeOrg ? permissionsOf(activeOrg.role) : [],
  });
});
