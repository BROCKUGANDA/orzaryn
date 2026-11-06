// ORZARYN — one-off data correction (Stage 24).
// Rows labelled "solana-testnet" actually target solana-devnet: Alchemy serves
// mainnet-beta + devnet only, and the configured USDC mint is Circle's devnet
// asset. The label was corrected in code/env on 2025-11-05; this backfills the
// plain `network` columns. Mandate `terms` JSON is intentionally NOT rewritten
// (it is the hash-sealed contractual record issued at mandate creation).
process.env.DATABASE_URL = "file:" + process.cwd() + "/db/custom.db";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const models = [
    "mandate",
    "service",
    "quote",
    "workOrder",
    "treasuryAccount",
    "ledgerEntry",
    "settlementReceipt",
  ] as const;
  let total = 0;
  for (const m of models) {
    const r = await (db[m] as { updateMany: (a: { where: { network: string }; data: { network: string } }) => Promise<{ count: number }> }).updateMany({
      where: { network: "solana-testnet" },
      data: { network: "solana-devnet" },
    });
    total += r.count;
    console.log(`[backfill] ${m}: ${r.count} row(s) relabelled`);
  }
  console.log(`[backfill] done — ${total} row(s) corrected`);
}

main()
  .catch((e) => {
    console.error("[backfill] FAILED", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
