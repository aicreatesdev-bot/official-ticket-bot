import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const requireFromDb = createRequire(join(rootDir, "packages", "db", "package.json"));
const { PrismaClient } = requireFromDb("@prisma/client");

loadDotEnv(join(rootDir, ".env"));

const prisma = new PrismaClient();
const guildId = process.env.BOT_DEV_GUILD_ID ?? "1506225231658749972";
const rosePink = 0xf174d2;

try {
  const [settings, panels] = await prisma.$transaction([
    prisma.guildSettings.updateMany({
      where: { guildId },
      data: { brandColor: rosePink }
    }),
    prisma.ticketPanel.updateMany({
      where: { guildId },
      data: { embedColor: rosePink }
    })
  ]);

  console.log(JSON.stringify({ guildId, color: "#f174d2", settings: settings.count, panels: panels.count }));
} finally {
  await prisma.$disconnect();
}

function loadDotEnv(path) {
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
}
