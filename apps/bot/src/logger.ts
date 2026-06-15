import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function write(level: "log" | "warn" | "error", message: string, meta?: unknown) {
  const suffix = meta === undefined || meta === "" ? "" : ` ${formatMeta(meta)}`;
  const line = `[Rose Ticket] ${message}${suffix}`;
  console[level](line);

  try {
    const logDir = resolve(process.cwd(), "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(resolve(logDir, "bot-runtime.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging must never break the bot.
  }
}

function formatMeta(meta: unknown) {
  if (meta instanceof Error) return meta.stack ?? meta.message;
  if (typeof meta === "string") return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export const logger = {
  info(message: string, meta?: unknown) {
    write("log", message, meta);
  },
  warn(message: string, meta?: unknown) {
    write("warn", message, meta);
  },
  error(message: string, meta?: unknown) {
    write("error", message, meta);
  }
};
