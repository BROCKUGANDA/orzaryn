// ORZARYN — Alchemy staging capability probe (Stage 12 / ADR-007 evidence).
// Exercises the chain adapter's LIVE path against the configured Alchemy app.
// Read-only checks only: never submits transactions, never moves funds.
// Run: npx -y bun scripts/alchemy-probe.ts
import { getChainProvider } from "../src/lib/chain/alchemy-solana";
import { chainMode, env } from "../src/lib/env";

function maskKey(): string {
  const k = env.ALCHEMY_API_KEY ?? "";
  return k ? `${k.slice(0, 6)}…${k.slice(-4)} (length ${k.length})` : "not configured";
}

type Row = { check: string; pass: boolean; detail: string };

async function main() {
  console.log("=== ORZARYN Alchemy staging probe (read-only) ===");
  console.log(`network:        ${env.NETWORK}`);
  console.log(`chainMode:      ${chainMode}`);
  console.log(`rpc host:       ${env.ALCHEMY_RPC_HOST}`);
  console.log(`api key:        ${maskKey()}`);
  console.log(`app id:         ${env.ALCHEMY_APP_ID ?? "not configured"}`);
  console.log(`webhook secret: ${env.ALCHEMY_WEBHOOK_SECRET ? "configured" : "NOT configured"}`);

  if (chainMode !== "live") {
    console.error("\nPROBE ABORTED: ALCHEMY_API_KEY unset — adapter would be in DEMO mode, nothing live to probe.");
    process.exit(1);
  }

  const provider = getChainProvider();
  const rows: Row[] = [];

  // 1. RPC health — the endpoint must answer getHealth=ok.
  try {
    const h = await provider.health();
    rows.push({ check: "RPC getHealth", pass: h.healthy, detail: `${h.detail}${h.latencyMs ? ` (${h.latencyMs}ms)` : ""}` });
  } catch (e) {
    rows.push({ check: "RPC getHealth", pass: false, detail: e instanceof Error ? e.message : "unknown" });
  }

  // 2. Slot read — proves a real cluster query through the adapter.
  try {
    const s = await provider.getSlot();
    rows.push({ check: "getSlot (finalized)", pass: s.mode === "live" && s.slot > 0, detail: `slot ${s.slot} (mode ${s.mode})` });
  } catch (e) {
    rows.push({ check: "getSlot (finalized)", pass: false, detail: e instanceof Error ? e.message : "unknown" });
  }

  // 3. Account read — token-accounts query for the USDC mint account itself
  //    (a mint owns no token accounts; a well-formed EMPTY answer proves the
  //    jsonParsed account-read path works against the canonical mint).
  try {
    const b = await provider.getBalance(env.USDC_MINT_TESTNET);
    rows.push({ check: "account read (getTokenAccountsByOwner)", pass: b.mode === "live", detail: `USDC-mint-held token accounts: ${b.minor} minor units (mode ${b.mode})` });
  } catch (e) {
    rows.push({ check: "account read (getTokenAccountsByOwner)", pass: false, detail: e instanceof Error ? e.message : "unknown" });
  }

  // 4. Signature-status path — synthetic signature, expect a clean NOT_FOUND
  //    rather than an RPC error; proves finality-tracking queries parse.
  try {
    const synthetic = "5".repeat(88);
    const st = await provider.getSignatureStatus(synthetic);
    rows.push({ check: "getSignatureStatuses", pass: st.status === "NOT_FOUND", detail: `synthetic sig → ${st.status}${st.error ? ` (${st.error})` : ""}` });
  } catch (e) {
    rows.push({ check: "getSignatureStatuses", pass: false, detail: e instanceof Error ? e.message : "unknown" });
  }

  // 5. Webhook verification fails closed without a secret (integrity check, not availability).
  const caps = provider.capabilities();
  rows.push({
    check: "webhook signature verify (fail-closed)",
    pass: !env.ALCHEMY_WEBHOOK_SECRET ? provider.verifyWebhookSignature("{}", "x") === false : true,
    detail: env.ALCHEMY_WEBHOOK_SECRET ? "secret configured" : "no secret configured → all events dead-letter unverified (SF-4)",
  });
  rows.push({
    check: "Agent Wallet signing (ADR-007 gate)",
    pass: false, // hard gate: stays false until a Wallet API endpoint answers
    detail: `${caps.agentWalletSigning} — RPC key does not prove Agent Wallet API support; separate dashboard setup required`,
  });

  console.log("\ncheck | result | detail");
  for (const r of rows) console.log(`${r.check} | ${r.pass ? "PASS" : "GATE/FAIL"} | ${r.detail}`);

  const critical = rows.slice(0, 4).every((r) => r.pass);
  console.log(`\nRPC READ PATH: ${critical ? "VERIFIED — adapter live against " + env.NETWORK : "NOT VERIFIED — see failures above"}`);
  console.log("Transaction submission NOT probed (requires a built, funded transaction — needs explicit approval).");
  console.log("Agent Wallet signing remains UNVERIFIED (ADR-007) — see capability row above.");
  process.exit(critical ? 0 : 1);
}

main();
