// ORZARYN — chain-provider interface (ADR-001). Vendor-neutral; Solana and EVM
// implementations stay distinct (Alchemy's EVM rollup ≠ Solana infrastructure).
import type { CircuitBreaker } from "../reliability";

export interface ChainCapabilities {
  network: string;
  mode: "live" | "demo";
  rpc: boolean;
  accountReads: boolean;
  programDataReads: boolean;
  transactionSubmission: boolean;
  simulation: boolean;
  signatureStatus: boolean;
  finalityTracking: boolean;
  eventSubscriptions: boolean;
  historicalReconciliation: boolean;
  /** ADR-007: Agent Wallet signing is UNVERIFIED until probed in staging. */
  agentWalletSigning: "UNVERIFIED" | "SUPPORTED" | "UNSUPPORTED";
  notes: string[];
}

export interface ChainHealth {
  healthy: boolean;
  mode: "live" | "demo";
  detail: string;
  latencyMs?: number;
}

export interface SignatureStatus {
  signature: string;
  status: "FINALIZED" | "CONFIRMED" | "PROCESSING" | "NOT_FOUND" | "FAILED";
  slot?: number;
  error?: string;
}

export interface SubmitResult {
  /** DEMO:<id> when simulating; real signature when live. */
  reference: string;
  mode: "live" | "demo";
  simulated: boolean;
}

export interface ChainProvider {
  readonly name: string;
  readonly network: string;
  breaker: CircuitBreaker;
  health(): Promise<ChainHealth>;
  getSlot(): Promise<{ slot: number; mode: "live" | "demo" }>;
  getBalance(address: string, mint?: string): Promise<{ minor: bigint; mode: "live" | "demo" }>;
  getSignatureStatus(signature: string): Promise<SignatureStatus>;
  /** Signed transaction (base64) submission. Callers must never blind-rebroadcast. */
  submitTransaction(base64Tx: string): Promise<SubmitResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  capabilities(): ChainCapabilities;
}
