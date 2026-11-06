import { Emblem } from "@/components/brand/brand";
import { LoadingState } from "@/components/orz/primitives";

export default function Loading() {
  return (
    <main className="orz-grid-bg mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-6 px-6 py-16">
      <Emblem size={28} />
      <LoadingState label="Loading ORZARYN" />
    </main>
  );
}
