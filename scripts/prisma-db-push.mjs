import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(join(rootDir, ".env"));

const child = spawn("pnpm", ["--filter", "@rose-ticket/db", "prisma:push"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
  shell: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Prisma db push was terminated by signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

function loadDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // Railway injects variables directly, so a missing local .env is fine.
  }
}
