import type { MetadataRoute } from "next";

const siteUrl = process.env.APP_URL ?? "https://orzaryn.svalley.tech";

// robots.txt — allowed crawlers are explicit for AI/LLM search (AEO/GEO) and classic SEO.
// Private and dynamic API surfaces are disallowed to save crawl budget and avoid index bloat.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Classic search
      { userAgent: "Googlebot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Bingbot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Applebot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "DuckDuckBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "facebookexternalhit", allow: "/", disallow: ["/api/"] },
      { userAgent: "Twitterbot", allow: "/", disallow: ["/api/"] },
      { userAgent: "LinkedInBot", allow: "/", disallow: ["/api/"] },
      // OpenAI — ChatGPT / Sora training + search
      { userAgent: "GPTBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "ChatGPT-User", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Anthropic — Claude training, search, and web fetch (AEO)
      { userAgent: "ClaudeBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Claude-Web", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Claude-SearchBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Claude-User", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Perplexity — AI answers (GEO)
      { userAgent: "PerplexityBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Perplexity-User", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Google AI / Gemini / AI Overviews
      { userAgent: "Google-Extended", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Gemini-Deep-Research", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Apple Intelligence
      { userAgent: "Applebot-Extended", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Meta AI / Llama
      { userAgent: "Meta-ExternalAgent", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Meta-ExternalFetcher", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // ByteDance / Doubao
      { userAgent: "Bytespider", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Cohere / RAG
      { userAgent: "cohere-ai", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Amazon / Rufus
      { userAgent: "Amazonbot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // You.com / DuckDuckGo AI
      { userAgent: "YouBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "DuckAssistBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Firecrawl / Diffbot — AI extraction & GEO citations
      { userAgent: "FirecrawlAgent", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      { userAgent: "Diffbot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Common Crawl — feeds AI training corpora (opt-in via Allow)
      { userAgent: "CCBot", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/"] },
      // Fallback — everything else gets public pages only
      { userAgent: "*", allow: "/", disallow: ["/api/", "/api/auth/", "/api/webhooks/", "/api/mcp"] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
