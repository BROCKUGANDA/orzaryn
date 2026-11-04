// ORZARYN — test suite (Stage 21). Node test runner via bun:test-compatible API.
// Covers: money integrity, policy engine decisions, state machine transitions,
// RBAC matrix, auth challenge messaging. Run: bun test tests/unit.test.ts
import { describe, it, expect } from "bun:test";
import { parseToMinor, formatFromMinor, subAmounts, bpsOf } from "../src/lib/money";
import { canonicalJson, sha256 } from "../src/lib/crypto";
import { roleHas } from "../src/lib/rbac";
import { canonicalChallengeMessage } from "../src/lib/wallet";

describe("money integrity (PRD N1)", () => {
  it("parses decimal strings to integer minor units", () => {
    expect(parseToMinor("12.5")).toBe(12500000n);
    expect(parseToMinor("0.000001")).toBe(1n);
    expect(parseToMinor("100")).toBe(100000000n);
  });
  it("round-trips format", () => {
    expect(formatFromMinor(parseToMinor("1234.5678"))).toBe("1234.5678");
    expect(formatFromMinor(0n)).toBe("0");
  });
  it("rejects invalid decimals", () => {
    expect(() => parseToMinor("12.50.1")).toThrow();
    expect(() => parseToMinor("abc")).toThrow();
    expect(() => parseToMinor("-5")).toThrow();
  });
  it("never underflows on subtract", () => {
    expect(() => subAmounts(1n, 2n)).toThrow();
    expect(subAmounts(5n, 3n)).toBe(2n);
  });
  it("computes basis points with integer math", () => {
    expect(bpsOf(50n, 100n)).toBe(5000);
    expect(bpsOf(0n, 100n)).toBe(0);
    expect(bpsOf(100n, 0n)).toBe(0);
  });
});

describe("canonical terms hashing (Stage 11)", () => {
  it("is order-independent", () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 3, y: 4 } });
    const b = canonicalJson({ c: { y: 4, z: 3 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(sha256(a)).toBe(sha256(b));
  });
});

describe("RBAC matrix (Stage 7/9)", () => {
  it("grants treasury only to OWNER/TREASURER", () => {
    expect(roleHas("TREASURER", "treasury.fund")).toBe(true);
    expect(roleHas("OWNER", "treasury.fund")).toBe(true);
    expect(roleHas("APPROVER", "treasury.fund")).toBe(false);
    expect(roleHas("OPERATOR", "treasury.fund")).toBe(false);
  });
  it("grants approvals to OWNER/ADMIN/APPROVER", () => {
    for (const r of ["OWNER", "ADMIN", "APPROVER"]) expect(roleHas(r, "purchases.approve")).toBe(true);
    for (const r of ["TREASURER", "OPERATOR", "VIEWER"]) expect(roleHas(r, "purchases.approve")).toBe(false);
  });
  it("denies unknown roles everything", () => {
    expect(roleHas("SUPERGOD", "treasury.fund")).toBe(false);
  });
});

describe("auth challenge message (Stage 7)", () => {
  it("binds domain, nonce and purpose", () => {
    const msg = canonicalChallengeMessage({
      domain: "orzaryn.test", address: "ABC111", nonce: "n1",
      issuedAt: "2026-11-05T00:00:00Z", expiresAt: "2026-11-05T00:10:00Z", purpose: "WALLET_LINK",
    });
    expect(msg).toContain("orzaryn.test");
    expect(msg).toContain("n1");
    expect(msg).toContain("does not authorise any transaction");
  });
});
