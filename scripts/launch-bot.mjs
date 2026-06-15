import { openSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const cwd = resolve(import.meta.dirname, "..");
const entry = resolve(cwd, "apps/bot/dist/apps/bot/src/index.js");
const out = openSync(resolve(cwd, "logs/bot.log"), "w");
const err = openSync(resolve(cwd, "logs/bot.err"), "w");

const child = spawn(process.execPath, [entry], {
  cwd,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true
});

child.unref();
console.log(`Rose Ticket bot launched with PID ${child.pid}.`);
