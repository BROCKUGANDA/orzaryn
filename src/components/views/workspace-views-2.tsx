"use client";
// ORZARYN — workspace views part 2: Marketplace/Quotes, Purchase, Approvals,
// Work orders list, Work order detail (Stage 18: 8-12)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader, Money, StateBadge, HashChip, LoadingState, EmptyState, ErrorState, StatCard } from "@/components/orz/primitives";
import { StatusTimeline, ReceiptPanel } from "@/components/orz/domain";
import { orzFetch, OrzApiError } from "@/lib/client";
import { useApp, hasPermission } from "@/lib/store";

// ── Marketplace (discovery + quotes) ─────────────────────────────────────────

export function QuotesView() {
  const { agentKey, setView } = useApp();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ["services"],
    queryFn: () => orzFetch<{ id: string; title: string; description: string; category: string; basePrice: string; asset: string; slaHours: number; provider: { name: string; status: string } }[]>("/api/services"),
  });
  const agentKeyQ = useApp((s) => s.agentKey);

  const requestQuote = useMutation({
    mutationFn: (serviceId: string): Promise<{ quoteId: string }> => {
      if (!agentKeyQ) {
        return Promise.reject(new OrzApiError("UNAUTHENTICATED", "Issue an agent API key first (Agent Registry → Issue key) — quotes bind to the agent's mandates."));
      }
      return orzFetch<{ quoteId: string; amountMinor: string }>("/api/quotes", { body: { serviceId }, agentKey: agentKeyQ });
    },
    onSuccess: (d) => {
      const qid = (d as { quoteId?: string; publicId?: string }).quoteId ?? (d as { publicId?: string }).publicId;
      setResult(`Quote ${qid} issued`);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["open-quotes"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Quote request failed"),
  });

  return (
    <div>
      <SectionHeader
        title="Service marketplace"
        desc={
          agentKey
            ? "Agent-mode: quotes are requested with your agent's API key and will be bound to its mandates."
            : "No agent key in this session — issuing a key in the Agent Registry enables agent-mode quoting."
        }
        actions={<Button variant="outline" onClick={() => setView("agents")}>Agent keys</Button>}
      />
      {error ? <div className="mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {result ? (
        <div role="status" className="orz-pulse-once mb-3 rounded-xl border border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)] bg-[var(--orz-accent-dim)]/10 p-3 text-sm">{result} — proceed to Purchase to propose the work order.</div>
      ) : null}
      {services.isLoading ? <LoadingState /> : services.data?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.data.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{s.title}</span>
                  <StateBadge state={s.provider.status === "APPROVED" ? "LISTED" : "UNVERIFIED"} />
                </div>
                <p className="flex-1 text-sm text-muted-foreground">{s.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{s.provider.name} · {s.category} · SLA {s.slaHours}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <Money minor={s.basePrice} asset={s.asset} className="text-lg font-semibold" />
                  <Button size="sm" disabled={requestQuote.isPending} onClick={() => { setError(null); setResult(null); requestQuote.mutate(s.id); }}>
                    Request quote
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No listed services" hint="Approved providers publish services here." />
      )}
    </div>
  );
}

// ── Purchase proposal ────────────────────────────────────────────────────────

export function PurchaseView() {
  const { agentKey } = useApp();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ state?: string; decision?: string; reasonCodes?: string[]; workOrderId?: string } | null>(null);

  const quotes = useQuery({
    queryKey: ["open-quotes"],
    queryFn: () => orzFetch<{ publicId: string; amount: string; asset: string; status: string; expiresAt: string; termsHash: string; service: { title: string }; provider: { name: string }; agent: { name: string } }[]>("/api/quotes"),
  });
  const open = (quotes.data ?? []).filter((q) => q.status === "ISSUED" && new Date(q.expiresAt).getTime() > Date.now());

  const propose = useMutation({
    mutationFn: (quotePublicId: string) =>
      orzFetch<{ workOrder: { publicId: string; state: string }; policy: { decision: string; reasonCodes: string[] } }>("/api/work-orders", {
        body: { quotePublicId },
        agentKey: agentKey ?? undefined,
        idempotencyKey: `propose-${quotePublicId}-${Date.now()}`,
      }),
    onSuccess: (d) => {
      setDecision({ state: d.workOrder.state, decision: d.policy.decision, reasonCodes: d.policy.reasonCodes, workOrderId: d.workOrder.publicId });
      qc.invalidateQueries({ queryKey: ["open-quotes"] });
      qc.invalidateQueries({ queryKey: ["workorders"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["mandates"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Proposal failed"),
  });

  return (
    <div>
      <SectionHeader title="Purchase proposal" desc="Proposals run the deterministic policy engine: auto-approve within mandate, escalate at the approval threshold, deny with reason codes." />
      {decision ? (
        <div role="status" className={`orz-pulse-once mb-4 rounded-xl border p-4 text-sm ${decision.decision === "DENY" ? "border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)] bg-[var(--orz-red-bg)]" : "border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)] bg-[var(--orz-accent-dim)]/10"}`}>
          <div className="font-semibold">Policy decision: {decision.decision ?? "—"} {decision.state ? `· work order ${decision.workOrderId} (${decision.state})` : ""}</div>
          {decision.reasonCodes?.length ? <div className="orz-money mt-1 text-xs">reason codes: {decision.reasonCodes.join(", ")}</div> : null}
        </div>
      ) : null}
      {error ? <div className="orz-shake mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {quotes.isLoading ? <LoadingState /> : open.length ? (
        <div className="space-y-2">
          {open.map((q) => (
            <Card key={q.publicId}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="orz-money text-sm font-semibold">{q.publicId}</span>
                    <StateBadge state={q.status} />
                    <span className="text-sm">{q.service.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    <span>provider {q.provider.name}</span>
                    <span>agent {q.agent.name}</span>
                    <span>expires {new Date(q.expiresAt).toLocaleString()}</span>
                    <span className="flex items-center gap-1">terms <HashChip hash={q.termsHash} /></span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Money minor={q.amount} asset={q.asset} className="font-semibold" />
                  <Button disabled={propose.isPending} onClick={() => { setError(null); setDecision(null); propose.mutate(q.publicId); }}>
                    Propose purchase
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No open quotes" hint="Request quotes from the marketplace first." />
      )}
    </div>
  );
}

// ── Approval centre ──────────────────────────────────────────────────────────

export function ApprovalsView() {
  const session = useApp((s) => s.session);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canApprove = hasPermission(session, "purchases.approve");

  const q = useQuery({
    queryKey: ["approvals"],
    queryFn: () => orzFetch<{ pending: { publicId: string; amount: string; asset: string; state: string; createdAt: string; agent: { name: string }; provider: { name: string }; service: { title: string } }[]; recentlyDecided: { publicId: string; approvalStatus: string; service: { title: string } }[] }>("/api/approvals"),
    refetchInterval: 10_000,
  });

  const decide = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "reject" }) =>
      orzFetch(`/api/work-orders/${id}/transition`, { body: { action: act, reason: act === "approve" ? "Approved via approval centre" : "Rejected via approval centre" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["workorders"] });
      qc.invalidateQueries({ queryKey: ["mandates"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Decision failed"),
  });

  return (
    <div>
      <SectionHeader title="Approval centre" desc="Purchases at or above the mandate's approval threshold wait for a human decision. Everything else auto-approves within mandate." />
      {error ? <div className="orz-shake mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {q.isLoading ? <LoadingState /> : q.data?.pending.length ? (
        <div className="space-y-2">
          {q.data.pending.map((wo) => (
            <Card key={wo.publicId} className="border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="orz-money text-sm font-semibold">{wo.publicId}</span>
                    <StateBadge state="PENDING_APPROVAL" pulse />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {wo.service.title} · provider {wo.provider.name} · agent {wo.agent.name} · raised {new Date(wo.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Money minor={wo.amount} asset={wo.asset} className="font-semibold" />
                  {canApprove ? (
                    <>
                      <Button size="sm" onClick={() => { setError(null); decide.mutate({ id: wo.publicId, act: "approve" }); }}>Approve</Button>
                      <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={() => { setError(null); decide.mutate({ id: wo.publicId, act: "reject" }); }}>Reject</Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">approval role required</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Approval queue is clear" hint="Nothing is waiting on a human decision." />
      )}
      {q.data?.recentlyDecided?.length ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Recently decided</h3>
          <div className="space-y-1.5">
            {q.data.recentlyDecided.slice(0, 8).map((wo) => (
              <div key={wo.publicId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="orz-money">{wo.publicId}</span>
                <span className="text-muted-foreground">{wo.service.title}</span>
                <StateBadge state={wo.approvalStatus} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Work orders list ─────────────────────────────────────────────────────────

export function WorkOrdersView() {
  const setView = useApp((s) => s.setView);
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const q = useQuery({
    queryKey: ["workorders"],
    queryFn: () => orzFetch<{ publicId: string; state: string; amount: string; asset: string; deadline: string; provider: { name: string }; service: { title: string }; agent: { name: string } }[]>("/api/work-orders"),
    refetchInterval: 10_000,
  });
  const rows = (q.data ?? []).filter((w) => stateFilter === "ALL" || w.state === stateFilter);
  return (
    <div>
      <SectionHeader
        title="Work orders"
        desc="The commercial lifecycle: proposal → approval → escrow → delivery → evidence review → settlement."
        actions={
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All states</SelectItem>
              {["PENDING_APPROVAL", "APPROVED", "FUNDED", "ACCEPTED", "DELIVERED", "IN_REVIEW", "COMPLETED", "DISPUTED", "REFUNDED", "CANCELLED", "REJECTED"].map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {q.isLoading ? <LoadingState /> : rows.length ? (
        <div className="space-y-2">
          {rows.map((wo) => (
            <Card key={wo.publicId} className="cursor-pointer transition-colors hover:border-[color-mix(in_srgb,var(--orz-accent)_45%,transparent)]" role="button" tabIndex={0}
              onClick={() => setView("workorder-detail", wo.publicId)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setView("workorder-detail", wo.publicId)}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="orz-money text-sm font-semibold">{wo.publicId}</span>
                  <StateBadge state={wo.state} pulse={wo.state === "PENDING_APPROVAL"} />
                  <span className="text-sm">{wo.service.title}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{wo.provider.name}</span>
                  <span>due {new Date(wo.deadline).toLocaleDateString()}</span>
                  <Money minor={wo.amount} asset={wo.asset} className="font-semibold text-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No work orders" hint="Work orders appear once quotes are accepted through the policy engine." />
      )}
    </div>
  );
}

// ── Work order detail ────────────────────────────────────────────────────────

export function WorkOrderDetailView({ publicId }: { publicId: string }) {
  const session = useApp((s) => s.session);
  const { providerKey } = useApp();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceText, setEvidenceText] = useState("Structured deliverable: analysis complete, dataset attached (DEMO content).");
  const canDecide = hasPermission(session, "purchases.approve");
  const canFund = hasPermission(session, "treasury.fund") || canDecide;

  const q = useQuery({
    queryKey: ["workorder", publicId],
    queryFn: () =>
      orzFetch<{
        workOrder: {
          publicId: string; state: string; approvalStatus: string; fundingStatus: string; evidenceState: string; settlementState: string;
          amount: string; feeAmount: string; asset: string; network: string; deadline: string; terms: string; termsHash: string;
          provider: { name: string; walletAddress: string }; agent: { name: string; developer: string }; service: { title: string; category: string };
        };
        invariant: { escrowed: string; released: string; refunded: string; fees: string; balanced: boolean };
      }>(`/api/work-orders/${publicId}`),
    refetchInterval: 8_000,
  });

  const transition = useMutation({
    mutationFn: ({ act, reason, providerSim }: { act: string; reason?: string; providerSim?: boolean }) =>
      orzFetch(`/api/work-orders/${publicId}/transition`, {
        body: { action: act, reason, ...(act === "resolve_dispute" ? { outcome: reason === "refund-buyer" ? "RESOLVED_BUYER" : "RESOLVED_PROVIDER" } : {}) },
        ...(providerSim ? { providerKey: providerKey ?? undefined } : {}),
      }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["workorder", publicId] });
      qc.invalidateQueries({ queryKey: ["workorders"] });
      qc.invalidateQueries({ queryKey: ["treasury"] });
      qc.invalidateQueries({ queryKey: ["settlements"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Transition failed"),
  });

  const submitEvidence = useMutation({
    mutationFn: () =>
      orzFetch(`/api/work-orders/${publicId}/evidence`, {
        body: {
          fileName: "deliverable.md",
          mimeType: "text/markdown",
          contentBase64: btoa(unescape(encodeURIComponent(evidenceText))),
          providerIdClaim: providerKey ?? undefined,
        },
      }),
    onSuccess: () => {
      setEvidenceOpen(false);
      qc.invalidateQueries({ queryKey: ["workorder", publicId] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Evidence submission failed"),
  });

  const wo = q.data?.workOrder;
  const s = wo?.state;

  return (
    <div>
      <div className="mb-4">
        <Button size="sm" variant="ghost" onClick={() => useApp.getState().setView("workorders")}>← Work orders</Button>
      </div>
      {q.isLoading || !wo ? (
        <LoadingState label="work order" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <Card className={s === "COMPLETED" ? "orz-glow" : ""}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="orz-money text-lg font-semibold">{wo.publicId}</span>
                    <StateBadge state={wo.state} pulse={wo.state === "PENDING_APPROVAL"} />
                  </div>
                  <Money minor={wo.amount} asset={wo.asset} className="text-lg font-semibold" />
                </div>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <span>service: {wo.service.title} ({wo.service.category})</span>
                  <span>agent: {wo.agent.name}</span>
                  <span>provider: {wo.provider.name}</span>
                  <span>due: {new Date(wo.deadline).toLocaleString()}</span>
                  <span className="flex items-center gap-1">terms <HashChip hash={wo.termsHash} /></span>
                  <span>funding: {wo.fundingStatus.toLowerCase()} · settlement: {wo.settlementState.toLowerCase()}</span>
                </div>
              </CardContent>
            </Card>

            {error ? <div className="orz-shake"><ErrorState error={new Error(error)} /></div> : null}

            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {s === "APPROVED" && canFund ? <Button size="sm" onClick={() => transition.mutate({ act: "fund" })}>Fund escrow</Button> : null}
                  {s === "FUNDED" ? <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "accept", providerSim: true })}>[Provider] Accept</Button> : null}
                  {s === "ACCEPTED" ? (
                    <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
                      <DialogTrigger asChild><Button size="sm" variant="outline">[Provider] Submit evidence</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Submit deliverable evidence</DialogTitle></DialogHeader>
                        <p className="text-xs text-muted-foreground">Content stays off-chain; only its SHA-256 hash is recorded as the commitment.</p>
                        <Textarea value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} rows={6} />
                        <Button onClick={() => submitEvidence.mutate()} disabled={submitEvidence.isPending}>Submit evidence</Button>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                  {s === "ACCEPTED" && (wo as { evidenceState?: string }).evidenceState === "SUBMITTED" ? <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "deliver", providerSim: true })}>[Provider] Mark delivered</Button> : null}
                  {s === "DELIVERED" && canDecide ? <Button size="sm" onClick={() => transition.mutate({ act: "review_start" })}>Begin review</Button> : null}
                  {s === "IN_REVIEW" && canDecide ? (
                    <>
                      <Button size="sm" onClick={() => transition.mutate({ act: "review_accept", reason: "Evidence accepted" })}>Accept & release</Button>
                      <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "request_revision", reason: "Please revise per comments" })}>Request revision</Button>
                      <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={() => transition.mutate({ act: "review_reject", reason: "Evidence rejected; dispute opened" })}>Reject → dispute</Button>
                    </>
                  ) : null}
                  {s === "DISPUTED" && canDecide ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "refund", reason: "Dispute resolved for buyer" })}>Resolve → refund buyer</Button>
                      <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "resolve_dispute", reason: "release-provider" })}>Resolve → release provider</Button>
                    </>
                  ) : null}
                  {["PENDING_APPROVAL", "APPROVED"].includes(s ?? "") ? (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ act: "cancel", reason: "Cancelled by operator" })}>Cancel</Button>
                  ) : null}
                  {["FUNDED", "ACCEPTED", "DELIVERED", "IN_REVIEW"].includes(s ?? "") && canDecide ? (
                    <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={() => transition.mutate({ act: "open_dispute", reason: "Dispute opened by buyer" })}>Open dispute</Button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  [Provider] actions are staging simulations executed with the provider claim; production requires the
                  provider portal (documented gap).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Event timeline</h3>
                <StatusTimeline events={(q.data as { workOrder: { events?: { id: string; seq: number; action: string; fromState: string | null; toState: string | null; actorType: string; actorId: string; reason: string | null; createdAt: string }[] } }).workOrder.events ?? []} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Money states</h3>
                <dl className="space-y-1.5 text-sm">
                  {([["Escrowed", q.data!.invariant.escrowed], ["Released", q.data!.invariant.released], ["Refunded", q.data!.invariant.refunded], ["Fees", q.data!.invariant.fees]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd><Money minor={v} asset={wo.asset} /></dd></div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt className="text-muted-foreground">Invariant</dt>
                    <dd>{q.data!.invariant.balanced ? <StateBadge state="COMPLETED" /> : <StateBadge state="DISPUTED" />}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-2 font-semibold">Immutable terms snapshot</h3>
                <pre className="orz-scroll max-h-56 overflow-auto rounded-lg border border-border bg-secondary/50 p-3 text-xs">{JSON.stringify(JSON.parse(wo.terms), null, 2)}</pre>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
