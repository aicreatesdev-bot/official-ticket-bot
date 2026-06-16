import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(join(rootDir, ".env"));

if (!process.env.BOT_DEV_GUILD_ID) {
  console.warn(
    "BOT_DEV_GUILD_ID is not set. Discord slash commands will register globally and may take up to one hour to appear."
  );
}

await run("Prisma db push", "pnpm", ["--filter", "@rose-ticket/db", "prisma:push"]);

const builtRegisterScript = join(rootDir, "apps", "bot", "dist", "apps", "bot", "src", "registerCommands.js");
if (existsSync(builtRegisterScript)) {
  await run("Discord slash command registration", "node", [builtRegisterScript]);
} else {
  await run("Discord slash command registration", "pnpm", ["--filter", "@rose-ticket/bot", "commands:register"]);
}

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

function run(label, command, args) {
  console.log(`Starting ${label}.`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} was terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code ?? 1}.`));
        return;
      }
      console.log(`Finished ${label}.`);
      resolve();
    });
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
