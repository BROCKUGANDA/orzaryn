// ORZARYN — Stage 23 staging demonstration (testnet/DEMO only).
// Walks the full commercial scenario + failure scenarios against the running
// dev server, printing evidence at each step. Run: bun scripts/demo-scenario.ts
const BASE = process.env.ORZ_BASE_URL ?? "http://localhost:3000";
const OWNER = { email: "demo-owner@orzaryn.test", password: "DemoOwner#2026" };
const TREASURER = { email: "demo-treasurer@orzaryn.test", password: "DemoTreasurer#2026" };

let cookie = "";
let step = 0;
function log(title: string, detail?: unknown) {
  step++;
  console.log(`\n[${String(step).padStart(2, "0")}] ${title}`);
  if (detail !== undefined) console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2).slice(0, 600));
}

async function call(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", cookie, ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = { raw: "non-json" };
  }
  return { status: res.status, json } as { status: number; json: { ok?: boolean; data?: unknown; error?: { code: string; message: string; details?: { reasonCodes?: string[] } } } };
}

function mustOk<T>(r: { json: { ok?: boolean; data?: T; error?: { code: string; message: string } } }, label: string): T {
  if (!r.json.ok) throw new Error(`${label} FAILED: ${r.json.error?.code} — ${r.json.error?.message}`);
  return r.json.data as T;
}

async function main() {
  console.log("=== ORZARYN Stage 23 demonstration — TESTNET/DEMO ONLY ===");

  // ── happy path ──
  const login = await call("/api/auth/login", { body: OWNER });
  if (!login.json.ok) throw new Error("owner login failed: " + JSON.stringify(login.json));
  log("Owner signed in (session cookie issued)");

  const agents = (await call("/api/agents")).json.data as { id: string; name: string; status: string }[];
  log("Agent registry loaded", agents.map((a) => `${a.name}:${a.status}`));

  const me = (await call("/api/auth/me")).json.data as { activeOrgId: string; role: string };
  log("Organisation context", { orgId: me.activeOrgId, role: me.role });

  // issue a fresh agent key for the demo
  const keyRes = await call(`/api/agents/${agents[0].id}/keys`, { body: {} });
  const fullKey = (keyRes.json.data as { fullKey: string }).fullKey;
  log("Agent API key issued (shown once in audit log)", { keyId: fullKey.split(".")[0] });

  // treasurer deposits testnet funds
  const tLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TREASURER),
  });
  const tCookie = (tLogin.headers.get("set-cookie") ?? "").split(";")[0];
  const tre = await fetch(`${BASE}/api/treasury`, {
    method: "GET",
    headers: { cookie: tCookie },
  });
  const treData = (await tre.json()) as { data?: { accounts: { id: string; trackBalance: string }[]; totals: { treasury: string } } };
  const accountId = treData.data!.accounts[0].id;
  log("Treasury balance (before)", treData.data!.totals.treasury);

  // agent discovers services
  const services = (await call("/api/mcp", { body: { tool: "discover_services", input: {} }, headers: { "x-orz-key": fullKey } })).json.data as { services: { id: string; title: string }[] };
  log("Agent discovered permitted services", services.services.map((s) => s.title));

  // agent requests quote (under approval threshold → auto-approve path)
  const svc = services.services[0];
  const quote = mustOk(
    await call("/api/mcp", { body: { tool: "request_quote", input: { serviceId: svc.id } }, headers: { "x-orz-key": fullKey } }),
    "quote request (MCP request_quote)",
  ) as { quoteId: string; amountMinor: string; termsHash: string };
  log("Quote obtained", { quoteId: quote.quoteId, amountMinor: quote.amountMinor, termsHash: quote.termsHash.slice(0, 16) + "…" });

  // agent proposes purchase — policy engine authorises
  const propData = mustOk(
    await call("/api/mcp", { body: { tool: "submit_proposal", input: { quotePublicId: quote.quoteId } }, headers: { "x-orz-key": fullKey } }),
    "purchase proposal (MCP submit_proposal)",
  ) as { workOrderId: string; state: string; decision: string; reasonCodes: string[] };
  log("Purchase proposal — policy decision", propData);
  const woId = propData.workOrderId;

  // buyer funds escrow
  const funded = mustOk(
    await call(`/api/work-orders/${woId}/transition`, { body: { action: "fund", reason: "Escrow funding (DEMO testnet)" } }),
    "escrow funding (fund transition)",
  ) as { state: string; fundingStatus: string };
  log("Escrow funded", funded);

  // provider accepts + delivers evidence
  const providerName = (mustOk(await call(`/api/work-orders/${woId}`), "work order detail") as { workOrder: { provider: { name: string } } }).workOrder.provider.name;
  const providers = mustOk(await call("/api/providers"), "providers") as { id: string; name: string }[];
  const providerRec = providers.find((p) => p.name === providerName)!;
  mustOk(
    await call(`/api/work-orders/${woId}/transition`, { body: { action: "accept", reason: "provider acceptance" }, headers: { "x-orz-provider": providerRec.id } }),
    "provider acceptance (accept transition)",
  );
  log("Provider accepted work order");
  mustOk(
    await call(`/api/work-orders/${woId}/evidence`, {
      body: { fileName: "deliverable.md", mimeType: "text/markdown", contentBase64: Buffer.from("DEMO deliverable: task complete.").toString("base64"), providerIdClaim: providerRec.id },
    }),
    "evidence submission",
  );
  mustOk(
    await call(`/api/work-orders/${woId}/transition`, { body: { action: "deliver", reason: "evidence submitted" }, headers: { "x-orz-provider": providerRec.id } }),
    "provider delivery (deliver transition)",
  );
  log("Provider submitted evidence + marked delivered");

  // buyer reviews → accepts → release
  mustOk(await call(`/api/work-orders/${woId}/transition`, { body: { action: "review_start", reason: "begin review" } }), "buyer review start");
  const released = mustOk(
    await call(`/api/work-orders/${woId}/transition`, { body: { action: "review_accept", reason: "evidence accepted" } }),
    "buyer acceptance + release (review_accept transition)",
  );
  log("Buyer accepted evidence — settlement released", released);

  // terminal state assertion — the happy path MUST end settled; a silently
  // skipped transition must never yield a green demo (principle 11).
  const finalWo = mustOk(await call(`/api/work-orders/${woId}`), "final work-order state") as { workOrder: { state: string; fundingStatus: string; settlementState: string } };
  if (finalWo.workOrder.state !== "COMPLETED" || finalWo.workOrder.fundingStatus !== "RELEASED" || finalWo.workOrder.settlementState !== "SETTLED") {
    throw new Error(`TERMINAL STATE ASSERTION FAILED: ${woId} is ${finalWo.workOrder.state}/${finalWo.workOrder.fundingStatus}/${finalWo.workOrder.settlementState} — expected COMPLETED/RELEASED/SETTLED`);
  }
  log(`Terminal state verified: ${woId} COMPLETED/RELEASED/SETTLED`);

  // receipts + reconciliation
  const receipts = mustOk(await call("/api/reports"), "reports") as { receipts: { publicId: string; kind: string; netAmount: string }[] };
  log("Settlement receipts", receipts.receipts.slice(0, 3).map((r) => `${r.publicId}:${r.kind}:${r.netAmount}`));
  const ops = mustOk(await call("/api/ops", { body: { action: "reconcile" } }), "reconciliation run");
  log("Reconciliation run", ops);

  // ── failure scenarios ──
  console.log("\n=== failure scenarios ===");

  // 1. over-limit purchase denied (custom 999 USDC quote vs 250 per-purchase mandate)
  const overQuote = mustOk(
    await call("/api/quotes", { body: { serviceId: svc.id, agentId: agents[0].id, amount: "999.00" } }),
    "custom over-limit quote",
  ) as { publicId: string };
  const deny = await call("/api/mcp", { body: { tool: "submit_proposal", input: { quotePublicId: overQuote.publicId } }, headers: { "x-orz-key": fullKey } });
  if (deny.json.ok !== false || deny.json.error?.code !== "POLICY_DENIED") {
    throw new Error(`DENIAL ASSERTION FAILED: over-limit proposal returned status ${deny.status} code ${deny.json.error?.code ?? "(none)"} — expected POLICY_DENIED`);
  }
  log("Over-limit purchase DENIED with reason codes", {
    status: deny.status,
    code: deny.json.error?.code,
    reasonCodes: deny.json.error?.details?.reasonCodes ?? deny.json.error?.message,
  });

  // 2. revoked agent blocked immediately
  const agentId = agents[0].id;
  mustOk(await call(`/api/agents/${agentId}`, { method: "PATCH", body: { action: "suspend", reason: "demo revocation" } }), "agent suspension");
  const q3 = await call("/api/mcp", { body: { tool: "discover_services", input: {} }, headers: { "x-orz-key": fullKey } });
  if (q3.json.ok !== false || q3.status < 400) {
    throw new Error(`REVOCATION ASSERTION FAILED: suspended agent's tool call returned status ${q3.status} ok=${q3.json.ok} — must be blocked`);
  }
  log("Suspended agent's tool call blocked", { status: q3.status, code: q3.json.error?.code, message: q3.json.error?.message });
  mustOk(await call(`/api/agents/${agentId}`, { method: "PATCH", body: { action: "activate", reason: "restore after demo" } }), "agent reactivation");

  // 3. duplicate webhook dedup
  const payload = JSON.stringify({ type: "program_log", id: "demo-dup-1" });
  const first = await fetch(`${BASE}/api/webhooks/alchemy`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  const dup = await fetch(`${BASE}/api/webhooks/alchemy`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  log("Duplicate webhook deduplicated (both persisted-before-ack, single record)", { firstStatus: first.status, secondStatus: dup.status });

  // 4. treasury balance reflects flows
  const treData2 = mustOk(await call("/api/treasury", { headers: { cookie: tCookie } }), "treasury after flows") as { totals: { treasury: string; escrowed: string } };
  log("Treasury after demo flows", treData2.totals);

  console.log("\n=== DEMO COMPLETE — all steps above are staging/testnet/DEMO, never real funds ===");
}

main().catch((e) => {
  console.error("DEMO FAILED:", e);
  process.exit(1);
});
