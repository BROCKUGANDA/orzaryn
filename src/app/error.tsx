"use client";

import { Emblem } from "@/components/brand/brand";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main
      role="alert"
      className="orz-grid-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-20 text-center"
    >
      <Emblem size={40} />
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Something broke while rendering</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."} Retrying usually clears it; if it keeps happening, quote
        the digest when you report it.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">digest {error.digest}</p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button onClick={retry}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign("/")}>
          Reload workspace
        </Button>
      </div>
    </main>
  );
}
