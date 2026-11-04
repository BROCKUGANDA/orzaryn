// ORZARYN — Alchemy Solana adapter (Stage 12 / ADR-001).
// The ONLY module aware of Alchemy. Runs "live" with credentials, otherwise an
// honest DEMO mode that never fabricates onchain confirmations (PRD N8).
import { randomUUID } from "node:crypto";
import { env, chainMode } from "../env";
import { logger } from "../logger";
import { CircuitBreaker, retry, withTimeout } from "../reliability";
import { hmac, safeEqualHex } from "../crypto";
import type {
  ChainCapabilities,
  ChainHealth,
  ChainProvider,
  SignatureStatus,
  SubmitResult,
} from "./provider";

const log = logger("chain:alchemy-solana");
const TIMEOUT_MS = 10_000;

export class AlchemySolanaProvider implements ChainProvider {
  readonly name = "alchemy-solana";
  readonly network = env.NETWORK;
  breaker = new CircuitBreaker("alchemy-solana", 4, 15_000);

  private get rpcUrl(): string | null {
    if (chainMode !== "live" || !env.ALCHEMY_API_KEY) return null;
    return `${env.ALCHEMY_RPC_HOST}/${env.ALCHEMY_API_KEY}`;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const url = this.rpcUrl;
    if (!url) throw new Error("demo_mode");
    const body = JSON.stringify({ jsonrpc: "2.0", id: "orz", method, params });
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        cache: "no-store",
      }),
      TIMEOUT_MS,
      `rpc:${method}`,
    );
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`rpc_error:${json.error.message}`);
    return json.result as T;
  }

  private async rpcWithRetry<T>(method: string, params: unknown[]): Promise<T> {
    return this.breaker.exec(() =>
      retry(() => this.rpc<T>(method, params), {
        attempts: 3,
        label: `rpc:${method}`,
        retryOn: (e) => {
          const msg = e instanceof Error ? e.message : "";
          // timeouts and HTTP failures retry; definitive RPC errors do not
          return !(msg.startsWith("rpc_error") || msg.startsWith("demo_mode"));
        },
      }),
    );
  }

  async health(): Promise<ChainHealth> {
    if (chainMode === "demo") {
      return { healthy: false, mode: "demo", detail: "DEMO mode — no Alchemy credentials configured; chain state is simulated and clearly labelled" };
    }
    const started = Date.now();
    try {
      const h = await this.rpcWithRetry<string>("getHealth", []);
      return {
        healthy: h === "ok",
        mode: "live",
        detail: h === "ok" ? `Alchemy Solana RPC healthy (${env.NETWORK})` : `getHealth=${h}`,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      return {
        healthy: false,
        mode: "live",
        detail: `RPC unreachable: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
  }

  async getSlot(): Promise<{ slot: number; mode: "live" | "demo" }> {
    if (chainMode === "demo") return { slot: 0, mode: "demo" };
    const slot = await this.rpcWithRetry<number>("getSlot", [{ commitment: "finalized" }]);
    return { slot, mode: "live" };
  }

  async getBalance(address: string, mint?: string): Promise<{ minor: bigint; mode: "live" | "demo" }> {
    if (chainMode === "demo") return { minor: 0n, mode: "demo" };
    const mintToUse = mint ?? env.USDC_MINT_TESTNET;
    const res = await this.rpcWithRetry<{ value: ({ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } } | null)[] }>("getTokenAccountsByOwner", [
      address,
      { mint: mintToUse },
      { encoding: "jsonParsed" },
    ]);
    const amount = res?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0";
    return { minor: BigInt(amount), mode: "live" };
  }

  async getSignatureStatus(signature: string): Promise<SignatureStatus> {
    if (chainMode === "demo") {
      return { signature, status: "NOT_FOUND", error: "demo mode" };
    }
    const res = await this.rpcWithRetry<{ value: ({ err: unknown; confirmationStatus?: string; slot?: number } | null)[] }>(
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
    );
    const item = res.value?.[0];
    if (!item) return { signature, status: "NOT_FOUND" };
    if (item.err) return { signature, status: "FAILED", error: JSON.stringify(item.err), slot: item.slot };
    const s = item.confirmationStatus ?? "PROCESSING";
    return { signature, status: s === "finalized" ? "FINALIZED" : s === "confirmed" ? "CONFIRMED" : "PROCESSING", slot: item.slot };
  }

  async submitTransaction(base64Tx: string): Promise<SubmitResult> {
    if (chainMode === "demo") {
      // Honest simulation reference — NEVER presented as an onchain confirmation.
      return { reference: `DEMO:${randomUUID()}`, mode: "demo", simulated: true };
    }
    // Fail closed for escrow movements until the Anchor programme is deployed
    // (KI-1 / ADR-003): call sites currently pass ASCII descriptors, which are
    // NOT Solana transactions. Record them as explicitly offchain ledger
    // operations instead of attempting a doomed (or worse, accepted) send.
    const decoded = Buffer.from(base64Tx, "base64").toString("utf8");
    if (/^[\x20-\x7e\r\n]+$/.test(decoded)) {
      log.warn("submit.ledger_only", { descriptor: decoded.slice(0, 120) });
      return {
        reference: `LEDGER-ONLY:${decoded}`,
        mode: "live",
        simulated: false,
        note: "Offchain ledger operation — escrow programme not deployed yet (KI-1/ADR-003); no onchain transaction was sent and none is claimed.",
      };
    }
    const sig = await this.rpcWithRetry<string>("sendTransaction", [
      base64Tx,
      { encoding: "base64", skipPreflight: false, maxRetries: 0 },
    ]);
    log.info("tx.submitted", { signature: sig });
    return { reference: sig, mode: "live", simulated: false };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!env.ALCHEMY_WEBHOOK_SECRET) {
      log.warn("webhook.no_secret_configured");
      return false;
    }
    if (!signatureHeader) return false;
    const expected = hmac(env.ALCHEMY_WEBHOOK_SECRET, rawBody);
    return signatureHeader.length === expected.length && safeEqualHex(signatureHeader, expected);
  }

  capabilities(): ChainCapabilities {
    return {
      network: env.NETWORK,
      mode: chainMode,
      rpc: chainMode === "live",
      accountReads: chainMode === "live",
      programDataReads: chainMode === "live",
      transactionSubmission: chainMode === "live",
      simulation: chainMode === "live",
      signatureStatus: chainMode === "live",
      finalityTracking: chainMode === "live",
      eventSubscriptions: !!env.ALCHEMY_WEBHOOK_SECRET,
      historicalReconciliation: chainMode === "live",
      agentWalletSigning: "UNVERIFIED", // ADR-007 hard gate
      notes: [
        `Alchemy app id: ${env.ALCHEMY_APP_ID ?? "not configured"}`,
        "Escrow movements are LEDGER-ONLY until the Anchor programme is deployed (KI-1/ADR-003); no onchain settlement is claimed.",
        "Agent Wallet custom-program signing support requires staging verification (ADR-007).",
      ],
    };
  }
}

let provider: ChainProvider | null = null;
export function getChainProvider(): ChainProvider {
  if (!provider) provider = new AlchemySolanaProvider();
  return provider;
}
