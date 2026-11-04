"use client";
// ORZARYN — workspace views part 1: Dashboard, Agents, Mandates, Providers (Stage 18: 4-7)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionHeader, StatCard, Money, StateBadge, HashChip, LoadingState, EmptyState, ErrorState } from "@/components/orz/primitives";
import { AgentIdentity, MandateCard } from "@/components/orz/domain";
import { orzFetch, OrzApiError } from "@/lib/client";
import { useApp, hasPermission } from "@/lib/store";

function useMe() {
  return useApp((s) => s.session);
}
function useSetView() {
  return useApp((s) => s.setView);
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardView() {
  const session = useMe();
  const setView = useSetView();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      return (await res.json()) as { status: string; chainMode: string; paused: boolean; agentWalletSigning: string; checks: Record<string, { status: string; detail?: string }> };
    },
    refetchInterval: 15_000,
  });
  const treasury = useQuery({ queryKey: ["treasury"], queryFn: () => orzFetch<{ totals: { treasury: string; escrowed: string; pending: string } }>("/api/treasury") });
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => orzFetch<{ length: number }[]>("/api/agents") });
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: () => orzFetch<{ pending: unknown[] }>("/api/approvals") });
  const workOrders = useQuery({ queryKey: ["workorders"], queryFn: () => orzFetch<{ publicId: string; state: string; amount: string; asset: string; deadline: string; provider: { name: string }; service: { title: string }; agent: { name: string } }[]>("/api/work-orders") });

  const paused = health.data?.paused;
  return (
    <div>
      <SectionHeader
        title={`Overview — ${session?.orgs?.find((o) => o.id === session.activeOrgId)?.name ?? "organisation"}`}
        desc={`Role: ${session?.role ?? "—"} · Chain mode: ${health.data?.chainMode ?? "…"} · Agent Wallet signing: ${health.data?.agentWalletSigning ?? "…"}`}
      />
      {paused ? (
        <div role="alert" className="orz-shake mb-4 rounded-xl border border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)] bg-[var(--orz-red-bg)] p-4 text-sm text-[var(--orz-red)]">
          Emergency pause is active — new work orders are blocked platform-wide. See the Admin console.
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Treasury (testnet)" value={treasury.data ? <Money minor={treasury.data.totals.treasury} /> : "…"} sub="deployable funds" />
        <StatCard label="In escrow" value={treasury.data ? <Money minor={treasury.data.totals.escrowed} /> : "…"} sub="awaiting delivery" />
        <StatCard label="Pending approval" value={approvals.data ? approvals.data.pending.length : "…"} sub="requires human decision" accent={(approvals.data?.pending.length ?? 0) > 0} />
        <StatCard label="Registered agents" value={agents.data?.length ?? "…"} sub="active + suspended" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Recent work orders</h3>
              <Button size="sm" variant="ghost" onClick={() => setView("workorders")}>View all</Button>
            </div>
            {workOrders.isLoading ? <LoadingState /> : workOrders.data?.length ? (
              <div className="space-y-2">
                {workOrders.data.slice(0, 5).map((wo) => (
                  <button key={wo.publicId} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-[color-mix(in_srgb,var(--orz-accent)_45%,transparent)]" onClick={() => setView("workorder-detail", wo.publicId)}>
                    <span className="orz-money">{wo.publicId}</span>
                    <span className="text-muted-foreground">{wo.service.title}</span>
                    <StateBadge state={wo.state} />
                    <Money minor={wo.amount} asset={wo.asset} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No work orders yet" hint="Register an agent, grant a mandate, then request a quote in the marketplace." action={<Button size="sm" onClick={() => setView("quotes")}>Open marketplace</Button>} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">System health</h3>
            {health.isLoading ? <LoadingState label="health" /> : health.data ? (
              <ul className="space-y-2 text-sm">
                {Object.entries(health.data.checks).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <StateBadge state={v.status === "up" ? "ACTIVE" : v.status === "demo" ? "UNDER_REVIEW" : "REVOKED"} />
                  </li>
                ))}
                <li className="pt-1 text-xs text-muted-foreground">{health.data.checks.chain?.detail}</li>
              </ul>
            ) : (
              <ErrorState error={health.error} retry={() => health.refetch()} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Agents ───────────────────────────────────────────────────────────────────

export function AgentsView() {
  const session = useMe();
  const setView = useSetView();
  const qc = useQueryClient();
  const { agentKey, setAgentKey } = useApp();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", developer: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  const agents = useQuery({ queryKey: ["agents"], queryFn: () => orzFetch<Parameters<typeof AgentIdentity>[0]["agent"][]>("/api/agents") });
  const canManage = hasPermission(session, "agents.manage");

  const register = useMutation({
    mutationFn: () => orzFetch("/api/agents", { body: form }),
    onSuccess: () => {
      setRegisterOpen(false);
      setForm({ name: "", developer: "", description: "" });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });
  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => orzFetch(`/api/agents/${id}`, { method: "PATCH", body: { action: act, reason: `${act} via console` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });
  const issueKey = useMutation({
    mutationFn: (id: string) => orzFetch<{ fullKey: string; keyId: string }>(`/api/agents/${id}/keys`, { body: {} }),
    onSuccess: (d) => {
      setNewKey(d.fullKey);
      setAgentKey(d.fullKey);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });

  return (
    <div>
      <SectionHeader
        title="Agent Registry"
        desc="Every agent has stable identity, an authorised signer and scoped API keys. Revocation stops new purchases immediately."
        actions={
          canManage ? (
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger asChild><Button>Register agent</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Register agent</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label htmlFor="a-name">Agent name (id-style)</Label><Input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-") })} placeholder="atlas-02" /></div>
                  <div className="space-y-1.5"><Label htmlFor="a-dev">Developer / team</Label><Input id="a-dev" value={form.developer} onChange={(e) => setForm({ ...form, developer: e.target.value })} placeholder="AI Platform team" /></div>
                  <div className="space-y-1.5"><Label htmlFor="a-desc">Description</Label><Input id="a-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <Button className="w-full" disabled={!form.name || !form.developer || register.isPending} onClick={() => { setError(null); register.mutate(); }}>Register</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />
      {error ? <div className="mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {agents.isLoading ? <LoadingState /> : agents.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {agents.data.map((a) => (
            <AgentIdentity
              key={a.id}
              agent={a}
              canManage={canManage}
              onIssueKey={canManage ? () => { setError(null); issueKey.mutate(a.id); } : undefined}
              onAction={(act) => { setError(null); action.mutate({ id: a.id, act }); }}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No agents registered" hint="Register your first agent to start granting mandates." />
      )}

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agent API key — shown once</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Copy it now. Only a SHA-256 hash is stored server-side; this value cannot be retrieved again.</p>
          <code className="orz-money block break-all rounded-lg border border-border bg-secondary p-3 text-xs">{newKey}</code>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => navigator.clipboard?.writeText(newKey ?? "")}>Copy key</Button>
            <Button variant="outline" className="flex-1" onClick={() => setNewKey(null)}>Done</Button>
          </div>
          {agentKey ? <p className="text-xs" style={{ color: "var(--orz-accent)" }}>This browser session will use this key for agent-mode calls (marketplace + purchase).</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Mandates ─────────────────────────────────────────────────────────────────

export function MandatesView() {
  const session = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ agentId: "", perPurchaseLimit: "250", dailyLimit: "1000", weeklyLimit: "4000", monthlyLimit: "10000", aggregateBudget: "20000", approvalThreshold: "500", validDays: "30" });

  const agents = useQuery({ queryKey: ["agents"], queryFn: () => orzFetch<{ id: string; name: string; status: string }[]>("/api/agents") });
  const mandates = useQuery({ queryKey: ["mandates"], queryFn: () => orzFetch<Parameters<typeof MandateCard>[0]["mandate"][]>("/api/mandates") });
  const canManage = hasPermission(session, "mandates.manage");

  const create = useMutation({
    mutationFn: () =>
      orzFetch("/api/mandates", {
        body: {
          agentId: form.agentId,
          perPurchaseLimit: form.perPurchaseLimit,
          dailyLimit: form.dailyLimit,
          weeklyLimit: form.weeklyLimit,
          monthlyLimit: form.monthlyLimit,
          aggregateBudget: form.aggregateBudget,
          approvalThreshold: form.approvalThreshold || undefined,
          providerAllowlist: [],
          serviceCategories: [],
          validDays: Number(form.validDays),
        },
      }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["mandates"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => orzFetch(`/api/mandates/${id}`, { method: "PATCH", body: { action: "revoke", reason: "Revoked via console" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }),
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });

  return (
    <div>
      <SectionHeader
        title="Mandates"
        desc="Deterministic spending authority: limits are enforced with atomic reservation and reason-coded decisions. Default-deny."
        actions={canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New mandate</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto orz-scroll">
              <DialogHeader><DialogTitle>Grant spending mandate</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Agent</Label>
                  <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      {(agents.data ?? []).filter((a) => a.status === "ACTIVE").map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {([["perPurchaseLimit", "Per-purchase limit"], ["dailyLimit", "Daily limit"], ["weeklyLimit", "Weekly limit"], ["monthlyLimit", "Monthly limit"], ["aggregateBudget", "Aggregate budget"], ["approvalThreshold", "Approval threshold (≥)"]] as const).map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`m-${k}`}>{label} (USDC)</Label>
                      <Input id={`m-${k}`} inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label htmlFor="m-valid">Valid for (days)</Label>
                    <Input id="m-valid" inputMode="numeric" value={form.validDays} onChange={(e) => setForm({ ...form, validDays: e.target.value })} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Limits must satisfy per-purchase ≤ daily ≤ weekly ≤ monthly ≤ aggregate.</p>
                <Button className="w-full" disabled={!form.agentId || create.isPending} onClick={() => { setError(null); create.mutate(); }}>Grant mandate</Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      />
      {error ? <div className="mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {mandates.isLoading ? <LoadingState /> : mandates.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {mandates.data.map((m) => (
            <MandateCard key={m.id} mandate={m} canRevoke={canManage} onRevoke={() => { setError(null); revoke.mutate(m.id); }} />
          ))}
        </div>
      ) : (
        <EmptyState title="No mandates" hint="Grant a mandate to give an agent bounded spending authority." />
      )}
    </div>
  );
}

// ── Providers ────────────────────────────────────────────────────────────────

export function ProvidersView() {
  const session = useMe();
  const qc = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState({ name: "", description: "", walletAddress: "", contactEmail: "", website: "", categories: "DATA" });
  const [svcForm, setSvcForm] = useState({ providerId: "", title: "", description: "", category: "DATA", pricingModel: "FIXED", basePrice: "100", slaHours: "48" });

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => orzFetch<{ id: string; name: string; description: string; status: string; walletAddress: string; walletVerifiedAt: string | null; categories: string; services: { id: string; title: string; category: string; basePrice: string; status: string }[]; _count: { workOrders: number } }[]>("/api/providers"),
  });
  const canReview = hasPermission(session, "org.manage");

  const apply = useMutation({
    mutationFn: () => orzFetch("/api/providers", { body: { ...applyForm, website: applyForm.website || undefined, categories: [applyForm.categories] } }),
    onSuccess: () => { setApplyOpen(false); qc.invalidateQueries({ queryKey: ["providers"] }); },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });
  const review = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => orzFetch(`/api/providers/${id}`, { method: "PATCH", body: { action: act, note: `${act} via console` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });
  const addService = useMutation({
    mutationFn: () => orzFetch("/api/services", { body: { providerId: svcForm.providerId, title: svcForm.title, description: svcForm.description, category: svcForm.category, pricingModel: svcForm.pricingModel, basePrice: svcForm.basePrice, slaHours: Number(svcForm.slaHours) } }),
    onSuccess: () => { setSvcOpen(false); qc.invalidateQueries({ queryKey: ["providers"] }); },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Failed"),
  });

  return (
    <div>
      <SectionHeader
        title="Provider directory"
        desc="Controlled ecosystem: providers apply, get reviewed, and are approved before listings appear to buyers."
        actions={
          <div className="flex gap-2">
            {canReview ? (
              <>
                <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
                  <DialogTrigger asChild><Button variant="outline">Apply as provider</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Provider application</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5"><Label>Name</Label><Input value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label>Description</Label><Input value={applyForm.description} onChange={(e) => setApplyForm({ ...applyForm, description: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label>Settlement wallet (Solana address)</Label><Input value={applyForm.walletAddress} onChange={(e) => setApplyForm({ ...applyForm, walletAddress: e.target.value })} className="orz-money" /></div>
                      <div className="space-y-1.5"><Label>Contact email</Label><Input type="email" value={applyForm.contactEmail} onChange={(e) => setApplyForm({ ...applyForm, contactEmail: e.target.value })} /></div>
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select value={applyForm.categories} onValueChange={(v) => setApplyForm({ ...applyForm, categories: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{["DATA", "DEVELOPMENT", "CONTENT", "RESEARCH", "INTEGRATION", "OPS"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" disabled={!applyForm.name || !applyForm.walletAddress || apply.isPending} onClick={() => { setError(null); apply.mutate(); }}>Submit application</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
                  <DialogTrigger asChild><Button>Publish service</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Publish a service</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Approved provider</Label>
                        <Select value={svcForm.providerId} onValueChange={(v) => setSvcForm({ ...svcForm, providerId: v })}>
                          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                          <SelectContent>
                            {(providers.data ?? []).filter((p) => p.status === "APPROVED").map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5"><Label>Title</Label><Input value={svcForm.title} onChange={(e) => setSvcForm({ ...svcForm, title: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label>Description</Label><Input value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Category</Label>
                          <Select value={svcForm.category} onValueChange={(v) => setSvcForm({ ...svcForm, category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{["DATA", "DEVELOPMENT", "CONTENT", "RESEARCH", "INTEGRATION", "OPS"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5"><Label>Base price (USDC)</Label><Input inputMode="decimal" value={svcForm.basePrice} onChange={(e) => setSvcForm({ ...svcForm, basePrice: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>SLA (hours)</Label><Input inputMode="numeric" value={svcForm.slaHours} onChange={(e) => setSvcForm({ ...svcForm, slaHours: e.target.value })} /></div>
                      </div>
                      <Button className="w-full" disabled={!svcForm.providerId || !svcForm.title || addService.isPending} onClick={() => { setError(null); addService.mutate(); }}>Publish</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
          </div>
        }
      />
      {error ? <div className="mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {providers.isLoading ? <LoadingState /> : providers.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {providers.data.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <StateBadge state={p.status} pulse={p.status === "UNDER_REVIEW"} />
                </div>
                <p className="text-sm text-muted-foreground">{p.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  wallet <HashChip hash={p.walletAddress} />
                  {p.walletVerifiedAt ? <StateBadge state="ACTIVE" /> : <StateBadge state="UNVERIFIED" />}
                  <span>{JSON.parse(p.categories || "[]").join(", ")}</span>
                </div>
                {p.services.length > 0 ? (
                  <ul className="space-y-1.5">
                    {p.services.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                        <span className="min-w-0 truncate">{s.title}</span>
                        <span className="flex items-center gap-2"><Money minor={s.basePrice} /><StateBadge state={s.status} /></span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canReview ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.status === "SUBMITTED" ? <Button size="sm" variant="outline" onClick={() => review.mutate({ id: p.id, act: "start_review" })}>Start review</Button> : null}
                    {p.status === "UNDER_REVIEW" ? (
                      <>
                        <Button size="sm" onClick={() => review.mutate({ id: p.id, act: "approve" })}>Approve</Button>
                        <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={() => review.mutate({ id: p.id, act: "reject" })}>Reject</Button>
                      </>
                    ) : null}
                    {p.status === "APPROVED" ? (
                      <>
                        <Button size="sm" variant="outline" className="text-[var(--orz-amber)]" onClick={() => review.mutate({ id: p.id, act: "suspend" })}>Suspend</Button>
                        {!p.walletVerifiedAt ? <Button size="sm" variant="outline" onClick={() => review.mutate({ id: p.id, act: "verify_wallet" })}>Mark wallet verified</Button> : null}
                      </>
                    ) : null}
                    {p.status === "SUSPENDED" ? <Button size="sm" variant="outline" onClick={() => review.mutate({ id: p.id, act: "reinstate" })}>Reinstate</Button> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No providers yet" hint="Provider applications will appear here for review." />
      )}
    </div>
  );
}
