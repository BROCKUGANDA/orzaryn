// ORZARYN — health & capability endpoint (Stage 6/12/22). Reflects REAL status.
import { db } from "@/lib/db";
import { getChainProvider } from "@/lib/chain/alchemy-solana";
import { chainMode } from "@/lib/env";
import { serialize } from "@/lib/errors";
import { startWorkers } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  // lazy worker bootstrap (guarantees the pipeline runs even if instrumentation
  // did not register in this runtime)
  startWorkers();
  const started = Date.now();
  const checks: Record<string, { status: string; detail?: string }> = {};

  try {
    await db.systemControl.findUnique({ where: { id: "global" } });
    checks.database = { status: "up" };
  } catch {
    checks.database = { status: "down", detail: "Database unreachable" };
  }

  const chain = getChainProvider();
  const health = await chain.health();
  checks.chain = { status: health.healthy ? "up" : health.mode === "demo" ? "demo" : "down", detail: health.detail };
  const caps = chain.capabilities();

  let paused = false;
  try {
    const c = await db.systemControl.findUnique({ where: { id: "global" } });
    paused = c?.paused ?? false;
  } catch {
    /* database check already reports */
  }

  const recentCheckpoint = await db.eventCheckpoint
    .findUnique({ where: { source: "inbox" } })
    .catch(() => null);
  checks.worker = {
    status:
      recentCheckpoint && Date.now() - new Date(recentCheckpoint.cursor).getTime() < 120_000
        ? "up"
        : "starting",
    detail: recentCheckpoint ? `last checkpoint ${recentCheckpoint.cursor}` : "no checkpoint yet",
  };
  const deadLetters = await db.webhookEvent.count({ where: { status: "DEAD" } }).catch(() => -1);

  const statuses = Object.values(checks).map((c) => c.status);
  const overall = statuses.includes("down")
    ? "degraded"
    : statuses.every((s) => s === "up")
      ? "healthy"
      : "healthy-demo"; // all critical deps up; chain in honest DEMO mode

  return Response.json(
    serialize({
      status: overall,
      appEnv: process.env.APP_ENV ?? "staging",
      chainMode,
      network: caps.network,
      paused,
      agentWalletSigning: caps.agentWalletSigning,
      deadLetters,
      checks,
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    }),
    { status: 200 },
  );
}
