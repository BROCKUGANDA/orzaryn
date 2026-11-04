"use client";
// ORZARYN — workspace views part 3: Settlements, Disputes, Treasury, Reports,
// Developers, Admin (Stage 18: 13-18)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader, Money, StateBadge, HashChip, LoadingState, EmptyState, ErrorState, StatCard, EnvBanner } from "@/components/orz/primitives";
import { ReceiptPanel, FinancialTable } from "@/components/orz/domain";
import { orzFetch, OrzApiError } from "@/lib/client";
import { useApp, hasPermission } from "@/lib/store";

// ── Settlements ──────────────────────────────────────────────────────────────

export function SettlementsView() {
  const q = useQuery({
    queryKey: ["settlements"],
    queryFn: () => orzFetch<{ receipts: { publicId: string; kind: string; grossAmount: string; feeAmount: string; netAmount: string; asset: string; chainRef: string | null; createdAt: string; workOrder: { publicId: string } }[] }>("/api/reports"),
  });
  const receipts = q.data?.receipts ?? [];
  const totalNet = receipts.filter((r) => r.kind === "RELEASE").reduce((a, r) => a + BigInt(r.netAmount), 0n);
  const totalRefund = receipts.filter((r) => r.kind === "REFUND").reduce((a, r) => a + BigInt(r.netAmount), 0n);
  return (
    <div>
      <SectionHeader
        title="Settlement history"
        desc="Release-on-acceptance receipts and refunds. Chain references are DEMO-labelled unless a live testnet signature exists."
        actions={<a href="/api/reports?format=csv" target="_blank" rel="noreferrer"><Button variant="outline">Export CSV</Button></a>}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Released (net)" value={<Money minor={totalNet} />} sub={`${receipts.filter((r) => r.kind === "RELEASE").length} receipts`} />
        <StatCard label="Refunded" value={<Money minor={totalRefund} />} sub={`${receipts.filter((r) => r.kind === "REFUND").length} refunds`} />
        <StatCard label="Platform fees" value={<Money minor={receipts.reduce((a, r) => a + BigInt(r.feeAmount), 0n)} />} sub="fee switch default-off" />
      </div>
      {q.isLoading ? <LoadingState /> : receipts.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {receipts.map((r) => (
            <div key={r.publicId}>
              <div className="mb-1 text-xs text-muted-foreground">for {r.workOrder.publicId}</div>
              <ReceiptPanel receipt={r} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No settlements yet" hint="Receipts appear when escrow is released or refunded." />
      )}
    </div>
  );
}

// ── Disputes ─────────────────────────────────────────────────────────────────

export function DisputesView() {
  const setView = useApp((s) => s.setView);
  const q = useQuery({
    queryKey: ["disputes"],
    queryFn: () =>
      orzFetch<{ id: string; publicId: string; reason: string; status: string; openedByType: string; createdAt: string; workOrder: { publicId: string; amount: string; asset: string; state: string; service: { title: string }; provider: { name: string } } }[]>("/api/disputes"),
    refetchInterval: 10_000,
  });
  const rows = q.data ?? [];
  return (
    <div>
      <SectionHeader title="Dispute centre" desc="Open disputes freeze settlement; resolution routes to refund (buyer) or release (provider)." />
      {q.isLoading ? <LoadingState /> : rows.length ? (
        <div className="space-y-2">
          {rows.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="orz-money text-sm font-semibold">{d.publicId}</span>
                    <StateBadge state={d.status} pulse={d.status === "OPEN"} />
                    <span className="text-sm">{d.workOrder.service.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {d.workOrder.publicId} · {d.reason} · opened by {d.openedByType.toLowerCase()} {new Date(d.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Money minor={d.workOrder.amount} asset={d.workOrder.asset} className="font-semibold" />
                  <Button size="sm" variant="outline" onClick={() => setView("workorder-detail", d.workOrder.publicId)}>Open work order</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No disputes" hint="Rejected evidence or explicit disputes appear here." />
      )}
    </div>
  );
}

// ── Treasury ─────────────────────────────────────────────────────────────────

export function TreasuryView() {
  const session = useApp((s) => s.session);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("500");
  const [accountId, setAccountId] = useState("");
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctForm, setAcctForm] = useState({ label: "", address: "" });
  const canOperate = hasPermission(session, "treasury.fund");

  const q = useQuery({
    queryKey: ["treasury"],
    queryFn: () => orzFetch<{ accounts: { id: string; label: string; address: string; asset: string; network: string; trackBalance: string; transactions: { id: string; type: string; amount: string; txSignature: string | null; status: string; createdAt: string }[] }[]; totals: { treasury: string; escrowed: string; pending: string } }>("/api/treasury"),
    refetchInterval: 12_000,
  });

  const deposit = useMutation({
    mutationFn: () => orzFetch("/api/treasury", { body: { accountId, amount } }),
    onSuccess: () => {
      setDepositOpen(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["treasury"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Deposit failed"),
  });
  const createAccount = useMutation({
    mutationFn: () => orzFetch("/api/treasury", { body: { action: "create_account", label: acctForm.label, address: acctForm.address } }),
    onSuccess: () => {
      setAcctOpen(false);
      qc.invalidateQueries({ queryKey: ["treasury"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Account creation failed"),
  });

  const accounts = q.data?.accounts ?? [];
  return (
    <div>
      <SectionHeader
        title="Treasury"
        desc="Testnet-only balances with separated representations: deployable, escrowed, pending approval."
        actions={
          canOperate ? (
            <div className="flex gap-2">
              <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
                <DialogTrigger asChild><Button variant="outline">Add account</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add treasury account</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label>Label</Label><Input value={acctForm.label} onChange={(e) => setAcctForm({ ...acctForm, label: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Solana address</Label><Input className="orz-money" value={acctForm.address} onChange={(e) => setAcctForm({ ...acctForm, address: e.target.value })} /></div>
                    <Button className="w-full" disabled={!acctForm.label || !acctForm.address} onClick={() => createAccount.mutate()}>Create</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
                <DialogTrigger asChild><Button>Deposit (testnet)</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Deposit testnet USDC</DialogTitle></DialogHeader>
                  <p className="text-xs text-muted-foreground">TESTNET ONLY. The tracked balance credits instantly; the chain reference is DEMO-labelled unless live credentials exist.</p>
                  <div className="space-y-1.5">
                    <Label>Account</Label>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Amount (USDC)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                  <Button className="w-full" disabled={!accountId || deposit.isPending} onClick={() => { setError(null); deposit.mutate(); }}>Deposit</Button>
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />
      <EnvBanner mode="demo" network="solana-testnet" />
      <div className="mt-4 mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Deployable" value={q.data ? <Money minor={q.data.totals.treasury} /> : "…"} accent />
        <StatCard label="In escrow" value={q.data ? <Money minor={q.data.totals.escrowed} /> : "…"} />
        <StatCard label="Pending approval" value={q.data ? <Money minor={q.data.totals.pending} /> : "…"} />
      </div>
      {error ? <div className="orz-shake mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {accounts.length === 0 ? (
        <EmptyState title="No treasury accounts" hint="Create an account, then deposit testnet USDC to fund work orders." />
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.label}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><HashChip hash={a.address} /> · {a.network}</div>
                  </div>
                  <Money minor={a.trackBalance} asset={a.asset} className="text-lg font-semibold" />
                </div>
                {a.transactions.length ? (
                  <div className="orz-scroll mt-3 max-h-48 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-card"><tr><th className="p-2 text-left font-medium text-muted-foreground">Type</th><th className="p-2 text-right font-medium text-muted-foreground">Amount</th><th className="p-2 text-left font-medium text-muted-foreground">Reference</th><th className="p-2 text-right font-medium text-muted-foreground">When</th></tr></thead>
                      <tbody>
                        {a.transactions.map((t) => (
                          <tr key={t.id} className="border-t border-border">
                            <td className="p-2">{t.type.replaceAll("_", " ").toLowerCase()}</td>
                            <td className="orz-money p-2 text-right">{BigInt(t.amount) < 0n ? "" : "+"}<Money minor={t.amount} /></td>
                            <td className="p-2">{t.txSignature ? <HashChip hash={t.txSignature} /> : "—"}</td>
                            <td className="p-2 text-right text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

export function ReportsView() {
  const q = useQuery({
    queryKey: ["reports"],
    queryFn: () => orzFetch<{ receipts: unknown[]; auditLogs: { id: string; actorType: string; actorId: string; action: string; resourceType: string; resourceId: string; createdAt: string }[]; policyDenied: number }>("/api/reports"),
  });
  const ledger = useQuery({
    queryKey: ["ledger"],
    queryFn: () => orzFetch<{ entries: { id: string; entryType: string; direction: string; account: string; amount: string; asset: string; workOrderId: string | null; memo: string | null; createdAt: string }[]; totals: Record<string, string> }>("/api/ledger"),
  });
  const totals = ledger.data?.totals ?? {};
  return (
    <div>
      <SectionHeader
        title="Reports & audit"
        desc="Accounting ledger grouped by state, plus the immutable audit trail. Every entry is traceable to its source operation."
        actions={
          <div className="flex gap-2">
            <a href="/api/ledger?format=csv" target="_blank" rel="noreferrer"><Button variant="outline">Ledger CSV</Button></a>
            <a href="/api/reports?format=csv" target="_blank" rel="noreferrer"><Button variant="outline">Settlements CSV</Button></a>
          </div>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["PROPOSED", "RESERVED", "ESCROWED", "RELEASED", "REFUNDED", "FEE"] as const).map((k) => (
          <StatCard key={k} label={k.toLowerCase()} value={totals[k] ? <Money minor={totals[k]} /> : <Money minor={0} />} sub="ledger total" />
        ))}
        <StatCard label="policy denials" value={q.data?.policyDenied ?? "…"} sub="all-time, reason-coded" />
      </div>
      <h3 className="mb-2 text-sm font-semibold">Ledger entries</h3>
      {ledger.isLoading ? <LoadingState /> : (
        <FinancialTable
          rows={ledger.data?.entries ?? []}
          emptyTitle="No ledger entries"
          renderHead={() => (
            <tr>
              {["When", "Type", "Account", "Amount", "Source"].map((h) => (
                <th key={h} className="p-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          )}
          renderRow={(e) => (
            <>
              <td className="p-2 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
              <td className="p-2"><StateBadge state={e.entryType === "ESCROWED" ? "FUNDED" : e.entryType === "RELEASED" ? "COMPLETED" : e.entryType === "REFUNDED" ? "REFUNDED" : "SUBMITTED"} /></td>
              <td className="orz-money p-2 text-xs">{e.account}</td>
              <td className="p-2 text-right"><Money minor={e.amount} asset={e.asset} /></td>
              <td className="p-2 text-xs text-muted-foreground">{e.memo ?? e.account}</td>
            </>
          )}
        />
      )}
      <h3 className="mt-6 mb-2 text-sm font-semibold">Audit trail (latest 200)</h3>
      {q.isLoading ? <LoadingState /> : (
        <FinancialTable
          rows={q.data?.auditLogs ?? []}
          emptyTitle="No audit entries"
          renderHead={() => (
            <tr>
              {["When", "Actor", "Action", "Resource"].map((h) => (
                <th key={h} className="p-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          )}
          renderRow={(a) => (
            <>
              <td className="p-2 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</td>
              <td className="p-2 text-xs">{a.actorType.toLowerCase()}</td>
              <td className="orz-money p-2 text-xs">{a.action}</td>
              <td className="orz-money p-2 text-xs text-muted-foreground">{a.resourceType}:{a.resourceId.slice(0, 12)}…</td>
            </>
          )}
        />
      )}
    </div>
  );
}

// ── Developers ───────────────────────────────────────────────────────────────

export function DevelopersView() {
  const { agentKey, setAgentKey } = useApp();
  const [keyInput, setKeyInput] = useState("");
  const [probe, setProbe] = useState<string | null>(null);
  const inspect = useMutation({
    mutationFn: () => orzFetch("/api/mcp", { body: { tool: "inspect_mandate", input: {} }, agentKey: keyInput || agentKey || undefined }),
    onSuccess: (d) => setProbe(JSON.stringify(d, null, 2)),
    onError: (e) => setProbe(`Error: ${e instanceof OrzApiError ? `${e.code} — ${e.message}` : "unknown"}`),
  });
  return (
    <div>
      <SectionHeader title="Developer portal" desc="Agent API (MCP-style tools), authentication, error codes and the testnet integration guide." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="font-semibold">Authentication</h3>
            <p className="text-sm text-muted-foreground">Send your agent key in the <code className="orz-money">x-orz-key</code> header. Keys are issued per agent in the Agent Registry and stored hashed.</p>
            <div className="flex gap-2">
              <Input className="orz-money" placeholder="ozk_….ozs_…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
              <Button variant="outline" onClick={() => { setAgentKey(keyInput || null); }}>Save</Button>
            </div>
            <Button onClick={() => inspect.mutate()} disabled={inspect.isPending}>Probe: inspect_mandate</Button>
            {probe ? <pre className="orz-scroll max-h-64 overflow-auto rounded-lg border border-border bg-secondary/50 p-3 text-xs">{probe}</pre> : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="font-semibold">Tools</h3>
            <ul className="space-y-1.5 text-sm">
              {[
                ["discover_services", "List services permitted by your active mandates"],
                ["request_quote", "Quote a fixed-price service (amount, terms hash, expiry)"],
                ["submit_proposal", "Propose a purchase — runs the policy engine"],
                ["inspect_mandate", "Your limits and available budget"],
                ["get_work_order", "State, money state, events"],
                ["get_evidence_state", "Evidence versions and review status"],
                ["request_approval", "Escalate context to the human queue"],
                ["cancel_work_order", "Cancel before approval"],
              ].map(([n, d]) => (
                <li key={n} className="flex flex-col rounded-lg border border-border px-2.5 py-1.5">
                  <code className="orz-money text-xs" style={{ color: "var(--orz-accent)" }}>{n}</code>
                  <span className="text-xs text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="font-semibold">Sample agent call</h3>
            <pre className="orz-scroll overflow-auto rounded-lg border border-border bg-secondary/50 p-3 text-xs">{`curl -X POST /api/mcp \\
  -H "x-orz-key: $ORZ_AGENT_KEY" \\
  -H "content-type: application/json" \\
  -d '{"tool":"discover_services","input":{}}'`}</pre>
            <h3 className="pt-2 font-semibold">Error codes</h3>
            <ul className="orz-money space-y-1 text-xs text-muted-foreground">
              <li>POLICY_DENIED — decision DENY; reason codes in details</li>
              <li>INSUFFICIENT_BUDGET — atomic reservation failed</li>
              <li>QUOTE_EXPIRED — quote past expiry (swept)</li>
              <li>AGENT_REVOKED — revocation takes effect immediately</li>
              <li>INVALID_TRANSITION — illegal state transition</li>
              <li>IDEMPOTENCY_REPLAY — key reused with different payload</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="font-semibold">Testnet integration guide</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Owner issues an agent key (Agent Registry → Issue key).</li>
              <li>Grant a mandate (Mandates) — per-purchase/daily/weekly/monthly/aggregate limits.</li>
              <li>Fund the treasury with testnet USDC (Treasury).</li>
              <li>Call <code className="orz-money">discover_services</code> → <code className="orz-money">request_quote</code> → <code className="orz-money">submit_proposal</code>.</li>
              <li>Watch the work order advance in Work orders; approvals appear in the Approval centre.</li>
              <li>Settlement receipts carry DEMO-labelled chain references until live credentials are configured.</li>
            </ol>
            <p className="text-xs" style={{ color: "var(--orz-amber)" }}>
              Note: Agent Wallet program signing is UNVERIFIED in this environment (ADR-007); agents never receive
              unrestricted signer access.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Admin / ops console ──────────────────────────────────────────────────────

export function AdminView() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  const q = useQuery({
    queryKey: ["ops"],
    queryFn: () =>
      orzFetch<{
        paused: boolean; pauseReason: string | null;
        chain: { health: { healthy: boolean; mode: string; detail: string; latencyMs?: number }; capabilities: { agentWalletSigning: string; network: string; notes: string[] } };
        workOrdersByState: { state: string; count: number }[];
        escrowedTotal: string;
        events: { deadLetters: number; pendingWebhooks: number; outboxPending: number; lastCheckpoint: string | null };
        deadEvents: { id: string; externalId: string; attempts: number; lastError: string | null; receivedAt: string }[];
      }>("/api/ops"),
    refetchInterval: 10_000,
  });

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => orzFetch("/api/ops", { body }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["ops"] });
      qc.invalidateQueries({ queryKey: ["health"] });
    },
    onError: (e) => setError(e instanceof OrzApiError ? e.message : "Ops action failed"),
  });

  const d = q.data;
  return (
    <div>
      <SectionHeader
        title="Operations console"
        desc="Private operators view: dependency health, event pipeline, dead-letter recovery, emergency pause and reconciliation."
        actions={
          d?.paused ? (
            <Button onClick={() => act.mutate({ action: "resume" })}>Resume operations</Button>
          ) : (
            <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
              <DialogTrigger asChild><Button variant="outline" className="text-[var(--orz-red)]">Emergency pause</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Emergency pause</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">Blocks all new work orders platform-wide. In-flight settlement continues under review.</p>
                <Input placeholder="Reason (required, audited)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
                <Button className="w-full" variant="destructive" disabled={pauseReason.length < 4} onClick={() => { act.mutate({ action: "pause", reason: pauseReason }); setPauseOpen(false); }}>
                  Pause platform
                </Button>
              </DialogContent>
            </Dialog>
          )
        }
      />
      {error ? <div className="orz-shake mb-3"><ErrorState error={new Error(error)} /></div> : null}
      {q.isLoading || !d ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <EnvBanner mode={d.chain.health.mode === "live" ? "live" : "demo"} network={d.chain.capabilities.network} paused={d.paused} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Chain RPC" value={d.chain.health.healthy ? "healthy" : d.chain.health.mode} sub={`${d.chain.health.detail}${d.chain.health.latencyMs ? ` · ${d.chain.health.latencyMs}ms` : ""}`} />
            <StatCard label="Dead-letter events" value={d.events.deadLetters} sub={d.events.deadLetters > 0 ? "requires recovery" : "clean"} accent={d.events.deadLetters > 0} />
            <StatCard label="Pending webhooks" value={d.events.pendingWebhooks} sub={`outbox pending: ${d.events.outboxPending}`} />
            <StatCard label="Escrowed total" value={<Money minor={d.escrowedTotal} />} sub="platform-wide" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-semibold">Chain capabilities</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Agent Wallet signing</span>
                  <StateBadge state={d.chain.capabilities.agentWalletSigning === "UNVERIFIED" ? "UNDER_REVIEW" : "ACTIVE"} />
                </div>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {d.chain.capabilities.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ action: "reconcile" })}>Run reconciliation</Button>
                  <Button size="sm" variant="outline" disabled={d.events.deadLetters === 0} onClick={() => act.mutate({ action: "replay_dead_letter" })}>
                    Replay dead-letter ({d.events.deadLetters})
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-semibold">Work orders by state</h3>
                <ul className="space-y-1 text-sm">
                  {d.workOrdersByState.map((s) => (
                    <li key={s.state} className="flex justify-between">
                      <span className="text-muted-foreground">{s.state.replaceAll("_", " ").toLowerCase()}</span>
                      <span className="orz-money">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
          {d.deadEvents.length ? (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-2 font-semibold">Dead-letter inspection</h3>
                <FinancialTable
                  rows={d.deadEvents}
                  emptyTitle="none"
                  renderHead={() => <tr><th className="p-2 text-left text-xs text-muted-foreground">External ID</th><th className="p-2 text-left text-xs text-muted-foreground">Attempts</th><th className="p-2 text-left text-xs text-muted-foreground">Last error</th><th className="p-2 text-right text-xs text-muted-foreground">Received</th></tr>}
                  renderRow={(e) => (
                    <>
                      <td className="orz-money p-2 text-xs">{e.externalId}</td>
                      <td className="orz-money p-2 text-xs">{e.attempts}</td>
                      <td className="p-2 text-xs text-muted-foreground">{e.lastError ?? "—"}</td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{new Date(e.receivedAt).toLocaleString()}</td>
                    </>
                  )}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
