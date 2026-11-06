import Link from "next/link";
import { Emblem } from "@/components/brand/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="orz-grid-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <Emblem size={40} />
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Error 404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">This page doesn&apos;t exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        ORZARYN runs its workspace and landing page from the root path, so there is nothing at this address.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Back to ORZARYN</Link>
      </Button>
    </main>
  );
}
