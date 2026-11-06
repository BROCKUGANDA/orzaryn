// UI probe 3: login → dump console navigation structure per view.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE + "/?view=auth", { waitUntil: "networkidle" });
await page.fill("#email", "demo-owner@orzaryn.test");
await page.fill("#password", "DemoOwner#2026");
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(2500);
console.log("post-login url:", page.url());

const nav = (await page.locator("button, a").allTextContents()).map(t => t.trim()).filter(t => t && t.length < 35);
console.log("ALL buttons/links:", JSON.stringify([...new Set(nav)].slice(0, 40)));
const headings = (await page.locator("h1,h2,h3").allTextContents()).map(t => t.trim()).filter(Boolean);
console.log("headings:", JSON.stringify(headings.slice(0, 10)));

// dump views available via query param by scanning hrefs / react-router patterns
const html = await page.content();
const views = [...new Set((html.match(/view=([a-z0-9_-]+)/g) || []))];
console.log("view params in DOM:", JSON.stringify(views.slice(0, 30)));

await browser.close();
