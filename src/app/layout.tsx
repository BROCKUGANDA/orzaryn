import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const siteUrl = process.env.APP_URL ?? "https://orzaryn.svalley.tech";
const siteName = "ORZARYN";
const tagline = "Controlled Autonomy for Agent Procurement";
const description =
  "ORZARYN is the procurement and settlement control plane for AI agents: register agents, grant spending mandates with hard limits, approve purchases by exception — funds sit in escrow and are released only when your team accepts the delivered evidence. USDC settlement on Solana (testnet).";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — ${tagline}`,
    template: `%s | ${siteName}`,
  },
  description,
  applicationName: siteName,
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  category: "Finance",
  classification: "AI agent procurement and settlement",
  keywords: [
    "ORZARYN",
    "AI agent procurement",
    "spending mandates",
    "agent escrow",
    "work orders",
    "release on acceptance",
    "USDC",
    "Solana",
    "MCP agent API",
    "AP2 mandates",
    "ERC-8183",
    "agent settlement",
    "evidence hash",
    "budget reservation",
  ],
  alternates: {
    canonical: "/",
    languages: { en: "/" },
    types: {
      "text/plain": ["/llms.txt", "/llms-full.txt"],
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: `${siteName} — ${tagline}`,
    description,
    url: siteUrl,
    siteName,
    type: "website",
    locale: "en_US",
    images: [
      { url: "/icon-512.png", width: 512, height: 512, alt: `${siteName} logo` },
      { url: "/logo.svg", width: 512, height: 512, alt: `${siteName} wordmark` },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@svalley",
    creator: "@svalley",
    title: `${siteName} — ${tagline}`,
    description,
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      maxVideoPreview: -1,
      maxImagePreview: "large",
      maxSnippet: -1,
    },
  },
  verification: {
    other: {
      "ai-search": "GPTBot, ClaudeBot, PerplexityBot allowed via robots.txt; see /llms.txt",
    },
  },
  other: {
    "geo.region": "KE",
    "geo.placename": "Nairobi",
    "ICBM": "-1.2921, 36.8219",
    "og:locale:alternate": "en_GB",
    "article:publisher": siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: "#070908",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="ORZARYN llms.txt" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="ORZARYN llms-full.txt" />
        <link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml" title="ORZARYN search" />
        <link rel="alternate" type="application/json" href="/manifest.webmanifest" />
      </head>
      <body
        className="antialiased bg-background text-foreground min-h-screen flex flex-col font-sans"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
