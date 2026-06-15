import { PrismaClient } from "@prisma/client";

const [guildId, ownerId] = process.argv.slice(2);

if (!guildId || !ownerId) {
  console.error("Usage: node scripts/seed-guild.mjs <guildId> <ownerId>");
  process.exit(1);
}

const prisma = new PrismaClient();

await prisma.guildSettings.upsert({
  where: { guildId },
  update: { ownerId },
  create: { guildId, ownerId }
});

await prisma.$disconnect();
console.log(`Seeded guild ${guildId} with owner ${ownerId}.`);
