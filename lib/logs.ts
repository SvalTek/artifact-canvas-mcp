export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];

export function writeLog(
  level: LogLevel,
  source: string,
  message: string,
) {
  entries.push({ timestamp: new Date().toISOString(), level, source, message });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return typeof error === "string" ? error : JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function captureToolError<T>(
  name: string,
  operation: () => T | Promise<T>,
): Promise<Awaited<T>> {
  try {
    return await operation();
  } catch (error) {
    writeLog("error", `tool:${name}`, errorMessage(error));
    throw error;
  }
}

export function getLogs(options: { limit?: number; level?: LogLevel } = {}) {
  const filtered = options.level
    ? entries.filter((entry) => entry.level === options.level)
    : entries;
  return filtered.slice(
    -Math.max(1, Math.min(options.limit ?? 100, MAX_ENTRIES)),
  );
}

export function installConsoleLogSink() {
  const originals = {
    error: console.error.bind(console),
  };
  const format = (args: unknown[]) =>
    args.map((value) => {
      if (typeof value === "string") return value;
      try {
        return value instanceof Error
          ? errorMessage(value)
          : JSON.stringify(value);
      } catch {
        return String(value);
      }
    }).join(" ");

  console.debug = (...args) => {
    writeLog("debug", "console", format(args));
    originals.error(...args);
  };
  console.info = (...args) => {
    writeLog("info", "console", format(args));
    originals.error(...args);
  };
  console.warn = (...args) => {
    writeLog("warn", "console", format(args));
    originals.error(...args);
  };
  console.error = (...args) => {
    writeLog("error", "console", format(args));
    originals.error(...args);
  };
  // stdout is reserved for JSON-RPC in stdio mode.
  console.log = (...args) => {
    writeLog("info", "console", format(args));
    originals.error(...args);
  };
}
