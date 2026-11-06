// ORZARYN — metadata URL contract. Next's own resolvers dereference the result of
// `resolveUrl` without a null guard, so any url-bearing metadata entry that is not a
// string | URL | {url} object crashes every SSR render with
// "Cannot read properties of null (reading 'pathname')".
import { describe, it, expect } from "bun:test";
import { metadata } from "../src/app/layout";

const { resolveAlternates } = require("next/dist/lib/metadata/resolvers/resolve-basics.js");
const { resolveOpenGraph } = require("next/dist/lib/metadata/resolvers/resolve-opengraph.js");

const base = new URL("https://orzaryn.svalley.tech");
const context = { trailingSlash: false };

function collectUrls(node: unknown, found: unknown[] = []): unknown[] {
  if (node === null || typeof node !== "object") return found;
  for (const value of Object.values(node)) {
    if (value && typeof value === "object" && "url" in value) found.push((value as { url: unknown }).url);
    else if (Array.isArray(value)) collectUrls(value, found);
    else if (value && typeof value === "object") collectUrls(value, found);
  }
  return found;
}

describe("metadata alternates (SEO/AEO link tags)", () => {
  it("resolves every alternates url without hitting the null dereference", async () => {
    const resolved = await resolveAlternates(metadata.alternates, base, "/", context);
    const urls = collectUrls(resolved).filter((u) => u !== undefined);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toBeString();
      expect(url as string).toStartWith("https://orzaryn.svalley.tech");
    }
  });

  it("keeps the llms.txt alternates resolvable", async () => {
    const resolved = await resolveAlternates(metadata.alternates, base, "/", context);
    const types = (resolved as { types: Record<string, { url: string }[]> }).types;
    expect(Object.keys(types)).toContain("text/plain");
    expect(types["text/plain"].map((t) => t.url)).toEqual([
      "https://orzaryn.svalley.tech/llms.txt",
      "https://orzaryn.svalley.tech/llms-full.txt",
    ]);
  });
});

describe("metadata openGraph images", () => {
  it("resolves every og:image to an absolute url", async () => {
    const resolved = await resolveOpenGraph(metadata.openGraph, base, "/", context, undefined);
    const images = (resolved as { images: { url: unknown }[] }).images;
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(String(image.url)).toStartWith("https://orzaryn.svalley.tech");
  });
});
