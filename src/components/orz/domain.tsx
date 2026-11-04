"use client";
// ORZARYN — domain components (Stage 5): BudgetMeter, WorkOrderCard,
// StatusTimeline, ApprovalQueue, EvidencePanel, ReceiptPanel, MandateCard,
// AgentIdentity, ProviderCard, ServiceCard, FinancialTable.
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money, StateBadge, HashChip, EmptyState } from "./primitives";
import { bpsOf } from "@/lib/money";

export function BudgetMeter({
  label,
  availableMinor,
  reservedMinor,
  spentMinor,
  limitMinor,
}: {
  label: string;
  availableMinor: string;
  reservedMinor: string;
  spentMinor: string;
  limitMinor: string;
}) {
  const available = BigInt(availableMinor);
  const reserved = BigInt(reservedMinor);
  const spent = BigInt(spentMinor);
  const limit = BigInt(limitMinor);
  const usedBps = bpsOf(reserved + spent, limit);
  const pct = Math.min(100, usedBps / 100);
  const color = usedBps >= 9500 ? "var(--orz-red)" : usedBps >= 8000 ? "var(--orz-amber)" : "var(--orz-accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="orz-money">
          {formatMini(available)} available <span className="text-muted-foreground">/ {formatMini(limit)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
        <span>reserved <Money minor={reserved} muted /></span>
        <span>spent <Money minor={spent} muted /></span>
        <span>{pct.toFixed(1)}% used</span>
      </div>
    </div>
  );
}

function formatMini(m: bigint): string {
  const d = 6;
  const s = m.toString().padStart(d + 1, "0");
  const whole = s.slice(0, s.length - d);
  const frac = s.slice(s.length - d).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function WorkOrderCard({
  wo,
  onOpen,
}: {
  wo: {
    publicId: string;
    state: string;
    amount: string;
    asset: string;
    deadline: string;
    provider: { name: string };
    service: { title: string };
    agent: { name: string };
  };
  onOpen: () => void;
}) {
  const overdue = new Date(wo.deadline).getTime() < Date.now() && !["COMPLETED", "REFUNDED", "CANCELLED", "REJECTED"].includes(wo.state);
  return (
    <Card className="cursor-pointer transition-colors hover:border-[color-mix(in_srgb,var(--orz-accent)_45%,transparent)]" role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="orz-money text-sm font-semibold">{wo.publicId}</span>
            <StateBadge state={wo.state} pulse={wo.state === "PENDING_APPROVAL"} />
            {overdue ? <StateBadge state="DISPUTED" /> : null}
          </div>
          <Money minor={wo.amount} asset={wo.asset} className="font-semibold" />
        </div>
        <div className="mt-2 text-sm text-foreground">{wo.service.title}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>provider {wo.provider.name}</span>
          <span>agent {wo.agent.name}</span>
          <span>due {new Date(wo.deadline).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusTimeline({
  events,
}: {
  events: { id: string; seq: number; action: string; fromState: string | null; toState: string | null; actorType: string; actorId: string; reason: string | null; createdAt: string }[];
}) {
  if (events.length === 0) return <EmptyState title="No events yet" />;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card"
            style={{ backgroundColor: e.actorType === "AGENT" ? "var(--orz-violet)" : e.actorType === "PROVIDER" ? "var(--orz-amber)" : "var(--orz-accent)" }}
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{e.action.replaceAll("_", " ")}</span>
            {e.toState ? <StateBadge state={e.toState} /> : null}
            <span className="text-xs text-muted-foreground">
              {e.actorType.toLowerCase()} · {new Date(e.createdAt).toLocaleString()}
            </span>
          </div>
          {e.reason ? <div className="mt-0.5 text-xs text-muted-foreground">{e.reason}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export function FinancialTable<T extends Record<string, unknown>>({
  rows,
  emptyTitle,
  emptyHint,
  renderHead,
  renderRow,
}: {
  rows: T[];
  emptyTitle: string;
  emptyHint?: string;
  renderHead: () => React.ReactNode;
  renderRow: (row: T) => React.ReactNode;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="orz-scroll max-h-96 overflow-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">{renderHead()}</thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border transition-colors hover:bg-secondary/40">
              {renderRow(r)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReceiptPanel({
  receipt,
}: {
  receipt: {
    publicId: string;
    kind: string;
    grossAmount: string;
    feeAmount: string;
    netAmount: string;
    asset: string;
    chainRef: string | null;
    createdAt: string;
  };
}) {
  const isDemo = receipt.chainRef?.startsWith("DEMO:");
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="orz-money font-semibold">{receipt.publicId}</span>
            <StateBadge state={receipt.kind} />
          </div>
          <span className="text-xs text-muted-foreground">{new Date(receipt.createdAt).toLocaleString()}</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Gross</dt><dd><Money minor={receipt.grossAmount} asset={receipt.asset} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Platform fee</dt><dd><Money minor={receipt.feeAmount} asset={receipt.asset} /></dd></div>
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>Net</dt><dd><Money minor={receipt.netAmount} asset={receipt.asset} /></dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">chain ref</span>
          {receipt.chainRef ? <HashChip hash={receipt.chainRef} /> : <span className="text-muted-foreground">none</span>}
          {isDemo ? (
            <span className="rounded border border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)] bg-[var(--orz-amber-bg)] px-1.5 py-0.5 text-[var(--orz-amber)]">
              DEMO — simulated reference, not an onchain confirmation
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MandateCard({
  mandate,
  onRevoke,
  canRevoke,
}: {
  mandate: {
    id: string;
    status: string;
    availableBudget: string;
    reservedTotal: string;
    spentTotal: string;
    aggregateBudget: string;
    perPurchaseLimit: string;
    validUntil: string;
    termsHash: string;
    agent: { name: string; status: string };
  };
  onRevoke?: () => void;
  canRevoke?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Mandate · {mandate.agent.name}</span>
            <StateBadge state={mandate.status} pulse={mandate.status === "ACTIVE"} />
          </div>
          {canRevoke && mandate.status === "ACTIVE" ? (
            <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={onRevoke}>
              Revoke
            </Button>
          ) : null}
        </div>
        <BudgetMeter
          label="Aggregate budget"
          availableMinor={mandate.availableBudget}
          reservedMinor={mandate.reservedTotal}
          spentMinor={mandate.spentTotal}
          limitMinor={mandate.aggregateBudget}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>per-purchase cap <Money minor={mandate.perPurchaseLimit} muted /></span>
          <span>valid until {new Date(mandate.validUntil).toLocaleDateString()}</span>
          <span>terms <HashChip hash={mandate.termsHash} /></span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentIdentity({
  agent,
  onIssueKey,
  onAction,
  canManage,
}: {
  agent: {
    id: string;
    name: string;
    developer: string;
    status: string;
    signerAddress: string | null;
    statusReason: string | null;
    apiKeys?: { keyId: string }[];
    _count?: { workOrders: number };
  };
  onIssueKey?: () => void;
  onAction?: (action: "activate" | "suspend" | "revoke") => void;
  canManage?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-xs font-semibold"
              style={{ backgroundColor: "var(--orz-violet)", color: "#0a0a12" }}
              aria-hidden
            >
              {agent.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="orz-money font-semibold">{agent.name}</span>
                <StateBadge state={agent.status} pulse={agent.status === "ACTIVE"} />
              </div>
              <div className="text-xs text-muted-foreground">{agent.developer}{agent._count ? ` · ${agent._count.workOrders} orders` : ""}</div>
            </div>
          </div>
          {canManage && agent.status !== "REVOKED" ? (
            <div className="flex gap-1.5">
              {onIssueKey ? <Button size="sm" variant="outline" onClick={onIssueKey}>Issue key</Button> : null}
              {agent.status === "ACTIVE" ? (
                <Button size="sm" variant="outline" onClick={() => onAction?.("suspend")}>Suspend</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onAction?.("activate")}>Activate</Button>
              )}
              <Button size="sm" variant="outline" className="text-[var(--orz-red)]" onClick={() => onAction?.("revoke")}>Revoke</Button>
            </div>
          ) : null}
        </div>
        {agent.signerAddress ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            signer <HashChip hash={agent.signerAddress} />
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">no verified signer attached</div>
        )}
        {agent.statusReason ? <div className="mt-1 text-xs text-[var(--orz-amber)]">{agent.statusReason}</div> : null}
      </CardContent>
    </Card>
  );
}
