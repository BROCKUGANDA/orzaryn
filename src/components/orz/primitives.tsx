"use client";
// ORZARYN — UI primitives (Stage 5): Money, StateBadge, HashChip, StatCard,
// EnvBanner, state components (loading/empty/error).
import { useState } from "react";
import { formatFromMinor } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function Money({
  minor,
  asset = "USDC",
  className,
  muted,
}: {
  minor: string | bigint | number;
  asset?: string;
  className?: string;
  muted?: boolean;
}) {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  return (
    <span className={`orz-money ${muted ? "text-muted-foreground" : ""} ${className ?? ""}`}>
      {formatFromMinor(value)} <span className="text-[0.78em] opacity-70">{asset}</span>
    </span>
  );
}

const STATE_STYLES: Record<string, { label: string; cls: string }> = {
  // work order
  PENDING_APPROVAL: { label: "Pending approval", cls: "bg-[var(--orz-amber-bg)] text-[var(--orz-amber)] border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)]" },
  APPROVED: { label: "Approved", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  REJECTED: { label: "Rejected", cls: "bg-[var(--orz-red-bg)] text-[var(--orz-red)] border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)]" },
  FUNDED: { label: "Escrow funded", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  ACCEPTED: { label: "Provider accepted", cls: "bg-secondary text-secondary-foreground border-border" },
  DELIVERED: { label: "Delivered", cls: "bg-secondary text-secondary-foreground border-border" },
  IN_REVIEW: { label: "In review", cls: "bg-[var(--orz-amber-bg)] text-[var(--orz-amber)] border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)]" },
  COMPLETED: { label: "Completed", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)] orz-glow" },
  DISPUTED: { label: "Disputed", cls: "bg-[var(--orz-red-bg)] text-[var(--orz-red)] border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)]" },
  REFUNDED: { label: "Refunded", cls: "bg-secondary text-secondary-foreground border-border" },
  CANCELLED: { label: "Cancelled", cls: "bg-secondary text-muted-foreground border-border" },
  // generic statuses
  ACTIVE: { label: "Active", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  REGISTERED: { label: "Registered", cls: "bg-secondary text-secondary-foreground border-border" },
  SUSPENDED: { label: "Suspended", cls: "bg-[var(--orz-amber-bg)] text-[var(--orz-amber)] border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)]" },
  REVOKED: { label: "Revoked", cls: "bg-[var(--orz-red-bg)] text-[var(--orz-red)] border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)]" },
  SETTLED: { label: "Settled", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  RELEASE: { label: "Release", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  REFUND: { label: "Refund", cls: "bg-secondary text-secondary-foreground border-border" },
  OPEN: { label: "Open", cls: "bg-[var(--orz-red-bg)] text-[var(--orz-red)] border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)]" },
  RESOLVED_BUYER: { label: "Resolved — buyer", cls: "bg-secondary text-secondary-foreground border-border" },
  RESOLVED_PROVIDER: { label: "Resolved — provider", cls: "bg-secondary text-secondary-foreground border-border" },
  NOT_REQUIRED: { label: "Auto-approved", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  ISSUED: { label: "Issued", cls: "bg-secondary text-secondary-foreground border-border" },
  EXPIRED: { label: "Expired", cls: "bg-secondary text-muted-foreground border-border" },
  LISTED: { label: "Listed", cls: "bg-[var(--orz-accent-dim)]/15 text-[var(--orz-accent)] border-[color-mix(in_srgb,var(--orz-accent)_35%,transparent)]" },
  SUBMITTED: { label: "Submitted", cls: "bg-secondary text-secondary-foreground border-border" },
  UNDER_REVIEW: { label: "Under review", cls: "bg-[var(--orz-amber-bg)] text-[var(--orz-amber)] border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)]" },
  UNVERIFIED: { label: "Unverified", cls: "bg-secondary text-muted-foreground border-border" },
};

export function StateBadge({ state, pulse }: { state: string; pulse?: boolean }) {
  const style = STATE_STYLES[state] ?? { label: state.replaceAll("_", " ").toLowerCase(), cls: "bg-secondary text-secondary-foreground border-border" };
  return (
    <Badge variant="outline" className={`${style.cls} font-medium ${pulse ? "orz-breathe" : ""}`}>
      {style.label}
    </Badge>
  );
}

export function HashChip({ hash, size = 8 }: { hash: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const display = hash.length > size * 2 + 3 ? `${hash.slice(0, size)}…${hash.slice(-6)}` : hash;
  return (
    <button
      type="button"
      className="orz-money inline-flex max-w-full items-center gap-1 rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        navigator.clipboard?.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={copied ? "Copied" : hash}
      aria-label={`Copy ${hash}`}
    >
      {copied ? "copied" : display}
    </button>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${accent ? "orz-glow" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function EnvBanner({ mode, network, paused }: { mode: "live" | "demo"; network: string; paused?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded border border-[color-mix(in_srgb,var(--orz-amber)_35%,transparent)] bg-[var(--orz-amber-bg)] px-2 py-0.5 font-medium text-[var(--orz-amber)]">
        TESTNET ONLY
      </span>
      <span className="rounded border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
        {mode === "demo" ? `DEMO MODE — simulated chain refs on ${network}` : `LIVE RPC · ${network}`}
      </span>
      {paused ? (
        <span className="orz-shake rounded border border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)] bg-[var(--orz-red-bg)] px-2 py-0.5 font-medium text-[var(--orz-red)]">
          EMERGENCY PAUSE ACTIVE
        </span>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="orz-grid-bg flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--orz-red)_35%,transparent)] bg-[var(--orz-red-bg)] p-4">
      <p className="font-medium text-[var(--orz-red)]">{message}</p>
      {retry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function SectionHeader({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          {title}
        </h2>
        {desc ? <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
