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
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  if (!settings) {
    console.log(JSON.stringify({ guildId, status: "no-settings" }));
    process.exit(0);
  }

  const staffRoleId = settings.staffRoles?.[0] ?? null;
  const updates = [
    prisma.guildSettings.update({
      where: { guildId },
      data: { managerRoles: [] }
    })
  ];

  if (staffRoleId) {
    updates.push(
      prisma.ticketPanelOption.updateMany({
        where: { panel: { guildId } },
        data: { staffRoleIds: [staffRoleId] }
      }),
      prisma.ticket.updateMany({
        where: { guildId, status: { in: ["open", "claimed"] } },
        data: { staffRoleIds: [staffRoleId] }
      })
    );
  }

  const result = await prisma.$transaction(updates);
  console.log(
    JSON.stringify({
      guildId,
      staffRoleId,
      clearedManagerRoles: true,
      panelOptions: result[1]?.count ?? 0,
      activeTickets: result[2]?.count ?? 0
    })
  );
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
