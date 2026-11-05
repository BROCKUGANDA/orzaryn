import type { MetadataRoute } from "next";

const siteUrl = process.env.APP_URL ?? "https://orzaryn.svalley.tech";

// Single-route SPA — the only canonical public URL is /. Query-param views
// (?view=developers) are app states, not indexable pages, so they are
// intentionally excluded from the sitemap to avoid thin/duplicate content.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
      alternates: { languages: { en: siteUrl } },
    },
    {
      url: `${siteUrl}/llms.txt`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/llms-full.txt`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.3,
    },
  ];
}
