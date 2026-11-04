// ORZARYN — typed environment configuration (zod-validated at load)
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  APP_ENV: z.enum(["development", "staging", "production"]).default("staging"),
  APP_URL: z.string().default("http://localhost:3000"),
  // Alchemy serves Solana mainnet-beta + devnet only; devnet USDC (faucet-issued) is the staging asset.
  NETWORK: z.string().default("solana-devnet"),
  USDC_MINT_TESTNET: z.string().default("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // Circle devnet USDC mint (historical name kept)
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(1000).default(0),
  ALCHEMY_APP_ID: z.string().optional(),
  ALCHEMY_API_KEY: z.string().optional(),
  ALCHEMY_RPC_HOST: z.string().default("https://solana-devnet.g.alchemy.com/v2"),
  ALCHEMY_WEBHOOK_SECRET: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().default(24 * 7),
  CHALLENGE_TTL_MINUTES: z.coerce.number().int().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly and early — never run with an invalid financial configuration.
  console.error("[orz:env] INVALID ENVIRONMENT", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid ORZARYN environment configuration");
}

export const env = parsed.data;

/**
 * Chain integration mode:
 * - "live": Alchemy credentials configured; health check must still pass before claiming liveness.
 * - "demo": no credentials; every chain-touching result is explicitly marked DEMO.
 * ADR-007: Agent Wallet signing capability is UNVERIFIED until probed.
 */
export const chainMode: "live" | "demo" = env.ALCHEMY_API_KEY ? "live" : "demo";

export const IS_PROD = env.APP_ENV === "production";
