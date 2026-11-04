// ORZARYN — Next.js instrumentation: start in-process workers once (ADR-006).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorkers } = await import("./lib/events");
    startWorkers();
  }
}
