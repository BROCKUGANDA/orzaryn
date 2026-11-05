#!/usr/bin/env bash
# ORZARYN escrow — localnet smoke test (Stage 13, first compile pass).
# Asserts: the declared programme ID matches the build keypair, the programme
# compiled, and it deployed under that exact ID on the local validator.
# The full behavioural suite (happy path + negatives per README test plan
# §2–3) requires an Anchor TS/Rust client and is tracked as the next Stage 13
# work item — this file is deliberately NOT that suite.
set -euo pipefail

cd "$(dirname "$0")/.."

# Pin the cluster: the CLI config may point anywhere — the test validator is local.
URL="${SOLANA_TEST_URL:-http://localhost:8899}"

PROG=$(solana-keygen pubkey target/deploy/orzaryn_escrow-keypair.json)
DECLARED=$(grep -o 'orzaryn_escrow = "[^"]*"' Anchor.toml | head -1 | cut -d'"' -f2)

echo "== ORZARYN escrow localnet smoke =="
if [ "$PROG" != "$DECLARED" ]; then
  echo "PROGRAM ID MISMATCH: keypair=$PROG declared=$DECLARED"
  exit 1
fi
echo "program id consistent: $PROG"

solana cluster-version --url "$URL"

solana account "$PROG" --url "$URL" > /tmp/orz_prog_account.json
OWNER=$(grep -o '"owner": "[^"]*"' /tmp/orz_prog_account.json | head -1 | cut -d'"' -f4)
if [ "$OWNER" != "BPFLoader21111111111111111111111111111111111" ]; then
  echo "UNEXPECTED OWNER: $OWNER"
  exit 1
fi
echo "deployed under declared ID; owner: BPFLoader2111… (BPF loader upgraded)"

echo "== SMOKE PASS: programme compiled + deployed on localnet =="
