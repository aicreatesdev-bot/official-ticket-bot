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

try {
  const options = await prisma.ticketPanelOption.findMany({
    where: { panel: { guildId } },
    select: { optionId: true, modalQuestions: true }
  });

  let updated = 0;
  for (const option of options) {
    if (!Array.isArray(option.modalQuestions)) continue;
    const cleaned = option.modalQuestions.filter((question) => question?.id !== "proof");
    if (cleaned.length === option.modalQuestions.length) continue;

    await prisma.ticketPanelOption.update({
      where: { optionId: option.optionId },
      data: { modalQuestions: cleaned }
    });
    updated += 1;
  }

  console.log(JSON.stringify({ guildId, scanned: options.length, updated }));
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
