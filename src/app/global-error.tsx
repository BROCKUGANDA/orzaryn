"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <main role="alert" className="orz-grid-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">ORZARYN could not start</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {error.message || "A fatal error occurred before the app could render."}
          </p>
          {error.digest ? <p className="font-mono text-xs text-muted-foreground">digest {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
