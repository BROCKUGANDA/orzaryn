// ORZARYN — structured JSON logger with request IDs
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.ORZ_LOG_LEVEL as Level) || "info";

function emit(level: Level, component: string, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(component: string) {
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", component, msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => emit("info", component, msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", component, msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit("error", component, msg, fields),
  };
}

export type Logger = ReturnType<typeof logger>;
