"use client";
// ORZARYN — public views: Home, Auth, Onboarding (Stage 18: 1-3)
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Emblem, LogoHorizontal } from "@/components/brand/brand";
import { SectionHeader, ErrorState } from "@/components/orz/primitives";
import { orzFetch, OrzApiError } from "@/lib/client";
import { useApp, type SessionState, type ViewKey } from "@/lib/store";

export function HomeView() {
  const setView = useApp((s) => s.setView);
  return (
    <div className="orz-grid-bg flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <LogoHorizontal size={26} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setView("auth")}>Sign in</Button>
          <Button onClick={() => setView("auth")}>Enter console</Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div className="orz-glow inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--orz-accent)" }} aria-hidden />
          Controlled autonomy for agent procurement · USDC on Solana (testnet)
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          Authority, bounded.
          <br />
          <span style={{ color: "var(--orz-accent)" }}>Settlement, proven.</span>
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          ORZARYN is the procurement and settlement control plane for AI agents. Register agents, grant spending
          mandates, approve purchases by exception — funds sit in escrow and are released only when your team accepts
          the delivered evidence.
        </p>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {[
            { t: "Mandates", d: "Per-purchase, daily, weekly, monthly and aggregate limits with atomic budget reservation and reason-coded decisions." },
            { t: "Escrowed work orders", d: "Immutable terms hashes, delivery deadlines, evidence review and release-on-acceptance settlement." },
            { t: "Auditable by design", d: "Every action is attributed to a verified principal; ledger states are separated and reconciled." },
          ].map((f) => (
            <Card key={f.t}>
              <CardContent className="p-5 text-left">
                <div className="font-semibold" style={{ fontFamily: "var(--font-space-grotesk)" }}>{f.t}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={() => setView("auth")}>Enter console</Button>
          <Button size="lg" variant="outline" onClick={() => setView("developers")}>Developer API</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Staging environment. Testnet USDC only. Chain operations run in honestly-labelled DEMO mode unless live
          Alchemy credentials are configured.
        </p>
      </main>
      <footer className="mt-auto border-t border-border px-6 py-4 text-center text-xs text-muted-foreground" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        ORZARYN · Controlled autonomy · orzaryn.svalley.tech · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export function AuthView() {
  const { setView, setSession } = useApp();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("demo-owner@orzaryn.test");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("DemoOwner#2026");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body = mode === "login" ? { email, password } : { email, name, password };
      await orzFetch(path, { body });
      const me = await orzFetch<SessionState>("/api/auth/me");
      setSession(me);
      qc.invalidateQueries();
      setView(me.activeOrgId ? "dashboard" : "onboarding");
    } catch (err) {
      setError(err instanceof OrzApiError ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="orz-grid-bg flex min-h-screen flex-col">
      <header className="px-6 py-4">
        <button onClick={() => setView("home")} aria-label="Back to home">
          <LogoHorizontal size={24} />
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <Card className="orz-glow">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <Emblem size={28} />
              <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                {mode === "login" ? "Sign in to the console" : "Create your account"}
              </h1>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} />
                {mode === "signup" ? <p className="text-xs text-muted-foreground">At least 10 characters.</p> : null}
              </div>
              {error ? <ErrorState error={new Error(error)} /> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <div className="mt-4 flex justify-between text-sm">
              <button className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
                {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
              <button className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setView("home")}>
                Back
              </button>
            </div>
            <p className="mt-4 rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
              Staging demo accounts: <span className="orz-money">demo-owner@orzaryn.test / DemoOwner#2026</span> ·
              treasurer and approver accounts exist with parallel credentials.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function OnboardingView() {
  const { setSession, setView, session } = useApp();
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const org = await orzFetch<{ id: string }>("/api/orgs", { body: { name: orgName, slug } });
      await orzFetch("/api/auth/switch-org", { body: { orgId: org.id } });
      const me = await orzFetch<SessionState>("/api/auth/me");
      setSession(me);
      setView("dashboard");
    } catch (err) {
      setError(err instanceof OrzApiError ? err.message : "Failed to create organisation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <SectionHeader title="Create your organisation" desc="The organisation owns agents, mandates, treasury and work orders." />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={createOrg} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organisation name</Label>
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required minLength={2} placeholder="Acme Robotics" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Workspace slug</Label>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required placeholder="acme-robotics" pattern="[a-z0-9][a-z0-9-]*" />
            </div>
            {error ? <ErrorState error={new Error(error)} /> : null}
            <Button type="submit" className="w-full" disabled={busy || !orgName || !slug}>
              {busy ? "Creating…" : "Create organisation"}
            </Button>
            {session?.orgs?.length ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => setView("dashboard")}>
                Use existing organisation instead
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Next steps after creation: register an agent, issue its API key, grant a spending mandate, and fund the
        testnet treasury.
      </p>
    </div>
  );
}
