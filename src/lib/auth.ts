// ORZARYN — authentication & principal resolution (Stage 7).
// Principals: USER (session cookie), AGENT (API key).
// Every request resolves to a Principal or is unauthenticated.
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "./env";
import { AppError } from "./errors";
import { sessionToken, sha256, signValue, unsignValue, verifyPassword, hashPassword } from "./crypto";

export const SESSION_COOKIE = "orz_session";

export type Principal =
  | { kind: "USER"; userId: string; email: string; name: string; orgId: string | null; role: string | null }
  | { kind: "AGENT"; agentId: string; orgId: string; name: string; status: string }
  | { kind: "PROVIDER"; providerId: string; name: string; status: string };

// ── users ────────────────────────────────────────────────────────────────────

export async function signUpUser(input: { email: string; name: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("VALIDATION_ERROR", "Invalid email");
  if (input.password.length < 10) throw new AppError("VALIDATION_ERROR", "Password must be at least 10 characters");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists");
  const user = await db.user.create({
    data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password) },
  });
  return user;
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") throw new AppError("UNAUTHENTICATED", "Invalid credentials");
  const okPw = await verifyPassword(input.password, user.passwordHash);
  if (!okPw) throw new AppError("UNAUTHENTICATED", "Invalid credentials");
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0 } });
  return user;
}

export async function startSession(userId: string, meta: { ip?: string; userAgent?: string; activeOrgId?: string }) {
  const tok = sessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
  await db.session.create({
    data: {
      userId,
      tokenHash: tok.hash,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
      activeOrgId: meta.activeOrgId,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signValue(tok.raw), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return { expiresAt };
}

export async function endSession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const token = unsignValue(raw);
    if (token) {
      await db.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
    }
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

async function userFromCookies(): Promise<Principal | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const token = unsignValue(raw);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status !== "ACTIVE") return null;
  // resolve the active-org role server-side on every request (RBAC source of truth)
  let role: string | null = null;
  if (session.activeOrgId) {
    const membership = await db.membership.findUnique({
      where: { userId_orgId: { userId: session.user.id, orgId: session.activeOrgId } },
    });
    role = membership?.role ?? null;
    if (!membership) return { ...p0(session), orgId: null, role: null };
  }
  return {
    kind: "USER",
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgId: session.activeOrgId,
    role,
  };
}

function p0(session: { user: { id: string; email: string; name: string } }) {
  return { kind: "USER" as const, userId: session.user.id, email: session.user.email, name: session.user.name };
}

// ── agents ───────────────────────────────────────────────────────────────────

export async function agentFromApiKey(rawKey: string | null): Promise<Principal | null> {
  if (!rawKey || !rawKey.includes("_")) return null;
  const [keyIdPart] = rawKey.split("_");
  if (keyIdPart !== "ozk") return null;
  const dot = rawKey.indexOf(".");
  if (dot < 0) return null;
  const keyId = rawKey.slice(0, dot);
  const secret = rawKey.slice(dot + 1);
  const record = await db.apiKey.findUnique({ where: { keyId }, include: { agent: true } });
  if (!record || record.status !== "ACTIVE" || record.agent.status === "REVOKED") return null;
  if (sha256(secret) !== record.secretHash) return null;
  await db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return {
    kind: "AGENT",
    agentId: record.agentId,
    orgId: record.agent.orgId,
    name: record.agent.name,
    status: record.agent.status,
  };
}

// ── providers (portal sessions reuse user sessions + provider claim) ─────────

export async function resolvePrincipal(): Promise<Principal | null> {
  const user = await userFromCookies();
  if (user) return user;
  return null;
}

export async function requireUser(): Promise<Extract<Principal, { kind: "USER" }>> {
  const p = await resolvePrincipal();
  if (!p || p.kind !== "USER") throw new AppError("UNAUTHENTICATED", "Sign-in required");
  return p;
}

export async function requireOrgUser(): Promise<Extract<Principal, { kind: "USER" }> & { orgId: string; role: string }> {
  const p = await requireUser();
  if (!p.orgId || !p.role) throw new AppError("FORBIDDEN", "No organisation context");
  return { ...p, orgId: p.orgId, role: p.role };
}

export async function setActiveOrg(userId: string, orgId: string) {
  // verify membership
  const m = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!m) throw new AppError("FORBIDDEN", "Not a member of this organisation");
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return;
  const token = unsignValue(raw);
  if (!token) return;
  await db.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { activeOrgId: orgId },
  });
}
