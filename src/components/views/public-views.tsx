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
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:px-4 focus:py-2">
        Skip to main content
      </a>
      <header className="flex items-center justify-between px-6 py-4">
        <LogoHorizontal size={26} />
        <nav aria-label="Primary" className="flex gap-2">
          <Button variant="ghost" onClick={() => setView("auth")}>Sign in</Button>
          <Button onClick={() => setView("auth")}>Enter console</Button>
        </nav>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
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
        <section aria-label="What ORZARYN does" className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 text-left">
          <h2 className="text-sm font-semibold">What is ORZARYN?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ORZARYN is the control plane for <strong>agent procurement</strong>: businesses register OpenAI-style AI
            agents, grant each one a <strong>cryptographic spending mandate</strong> (hard limits + provider allowlist +
            approval threshold), and the agent buys discrete services from approved providers through a quote →
            policy-check → work-order → escrow → evidence → release pipeline. Settlement is USDC on Solana Devnet;
            funds are released only on buyer acceptance of the evidence hash. Docs: <a className="underline" href="/llms.txt">llms.txt</a>,
            <a className="underline" href="/llms-full.txt"> llms-full.txt</a>.
          </p>
        </section>
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
        <section aria-label="How it works" className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 text-left">
          <h2 className="text-sm font-semibold">How it works</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Register an agent (Ed25519 signer + API key) and grant a mandate with limits.</li>
            <li>Agent discovers a permitted service, requests a quote (terms hash), submits a proposal.</li>
            <li>Policy engine returns <code>APPROVE</code> (auto-reserve), <code>REQUIRES_APPROVAL</code> (human queue), or <code>DENY</code> with reason codes.</li>
            <li>Work order is funded into escrow; provider delivers evidence; buyer accepts → funds release, or rejects/disputes → refund.</li>
          </ol>
        </section>
        <section aria-label="Comparison" className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 text-left">
          <h2 className="text-sm font-semibold">ORZARYN vs. alternatives</h2>
          <div className="mt-2 overflow-x-auto text-sm text-muted-foreground">
            <table className="w-full text-left">
              <thead><tr><th className="py-1 pr-3">Capability</th><th className="py-1 pr-3">ORZARYN</th><th className="py-1">x402 / AP2 / ERC-8183</th></tr></thead>
              <tbody>
                <tr><td className="py-1 pr-3">Mandate engine</td><td className="py-1 pr-3">Yes (deterministic)</td><td className="py-1">AP2 VDCs; x402 wallets partial</td></tr>
                <tr><td className="py-1 pr-3">Escrow on acceptance</td><td className="py-1 pr-3">Yes (release-on-acceptance)</td><td className="py-1">x402: no refunds/disputes; ERC-8183: standard draft</td></tr>
                <tr><td className="py-1 pr-3">Solana USDC</td><td className="py-1 pr-3">Yes (Devnet)</td><td className="py-1">x402 yes; AP2/ERC-8183 no/EVM</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section aria-label="Frequently asked questions" className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 text-left">
          <h2 className="text-sm font-semibold">Frequently asked questions</h2>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">How does the escrow work?</summary><p className="mt-1 text-sm text-muted-foreground">Funds move proposed → reserved → escrowed → released/refunded in a double-entry ledger. Release requires buyer acceptance of the evidence hash; reject/dispute refunds to treasury.</p></details>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Who can use it?</summary><p className="mt-1 text-sm text-muted-foreground">Ops/AI-platform leaders at 50–2,000-person companies running agents in production, finance controllers, agent platform engineers, and verified service providers accepting USDC.</p></details>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Which chain?</summary><p className="mt-1 text-sm text-muted-foreground">Solana only (Devnet, USDC via Alchemy). Anchor escrow source exists but is uncompiled and not deployed; no mainnet settlement in this build.</p></details>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">How do agents connect?</summary><p className="mt-1 text-sm text-muted-foreground">API key + signed challenge via <code>POST /api/mcp</code> with narrow tools (<code>discover_services</code>, <code>request_quote</code>, <code>submit_proposal</code>, …). See <a className="underline" href="/llms-full.txt">llms-full.txt</a>.</p></details>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">What license?</summary><p className="mt-1 text-sm text-muted-foreground">Apache-2.0 (explicit patent grant, intentionally not MIT).</p></details>
        </section>
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
