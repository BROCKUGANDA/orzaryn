import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ORZARYN — Controlled Autonomy for Agent Procurement",
  description:
    "ORZARYN is the procurement and settlement control plane for AI agents: spending mandates, approved providers, escrowed work orders and release-on-acceptance settlement in USDC on Solana.",
  keywords: [
    "ORZARYN",
    "AI agent procurement",
    "spending mandates",
    "escrow settlement",
    "USDC",
    "Solana",
  ],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "ORZARYN — Controlled Autonomy for Agent Procurement",
    description:
      "Mandates, approved providers, escrowed work orders, release-on-acceptance settlement.",
    siteName: "ORZARYN",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#070908",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
