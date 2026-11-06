// ORZARYN demo video — live product recording (single source of truth for footage).
// Records the real running app (no mocks): landing → auth → dashboard →
// mandates → agents → work orders → settlements → treasury → reports.
// Slow, deliberate pacing sized for a ≤3 min narrated edit.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "scripts/video/raw";
mkdirSync(OUT, { recursive: true });

const dwell = (ms) => page.waitForTimeout(ms);
const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
async function go(label) {
  try {
    await page.locator(`nav button:has-text("${label}")`).first().click({ timeout: 6000 });
    console.log(ts(), "->", label);
  } catch {
    console.log(ts(), "!! nav miss:", label);
  }
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },
});
const page = await ctx.newPage();

// 1. Landing hero — the product promise.
await page.goto(BASE, { waitUntil: "networkidle" });
await dwell(9500);
await page.mouse.move(800, 450);
await dwell(1500);

// 2. Console auth — real credentials, typed visibly.
await page.click('text=Enter console', { timeout: 8000 });
await page.waitForTimeout(2000);
await page.fill("#email", "demo-owner@orzaryn.test");
await page.fill("#password", "DemoOwner#2026");
await dwell(6500);
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(3500);

// 3. Overview — live system health (real RPC, worker, DB).
await dwell(5500);
await page.mouse.move(1200, 300);
await dwell(2000);
await page.mouse.move(400, 600);
await dwell(2500);

// 4. Mandates — the control surface.
await go("Mandates");
await dwell(4500);
await page.mouse.move(800, 400);
await dwell(5500);

// 5. Agents — scoped credentials.
await go("Agents");
await dwell(8000);

// 6. Work orders — the lifecycle.
await go("Work orders");
await dwell(6500);
// open the first work order row if clickable
const firstRow = page.locator("table tbody tr, [role=row]").first();
if (await firstRow.count()) {
  await firstRow.click({ timeout: 3000 }).catch(() => {});
  await dwell(5500);
  const back = page.locator('button:has-text("Back")');
  if (await back.count()) await back.first().click({ timeout: 2000 }).catch(() => {});
  await dwell(1500);
}

// 7. Settlements — receipts with chain refs.
await go("Settlements");
await dwell(7500);

// 8. Treasury — escrow accounting.
await go("Treasury");
await dwell(8500);

// 9. Reports — analytics over real data.
await go("Reports");
await dwell(6500);

// 10. Back to overview for the close.
await go("Overview");
await dwell(6500);

await ctx.close(); // flushes the video file
await browser.close();
console.log("recording complete →", OUT);
