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
const panelKey = process.argv[2] ?? "";
const placeholder = process.argv.slice(3).join(" ").trim() || "🎫 create ticket for any query";
const defaultPanelColor = 0x22c55e;

try {
  const panels = await prisma.ticketPanel.findMany({
    where: {
      guildId,
      ...(panelKey
        ? {
            OR: [
              { panelId: panelKey },
              { name: { equals: panelKey, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" }
  });

  if (!panels.length) {
    console.log(JSON.stringify({ guildId, panelKey, updated: 0, refreshed: 0, reason: "no matching panels" }));
    process.exit(0);
  }

  let refreshed = 0;
  for (const panel of panels) {
    const updated = await prisma.ticketPanel.update({
      where: { panelId: panel.panelId },
      data: {
        dropdownPlaceholder: placeholder,
        embedColor: defaultPanelColor
      },
      include: { options: { orderBy: { sortOrder: "asc" } } }
    });

    if (await refreshDiscordPanelMessage(updated)) refreshed += 1;
  }

  console.log(JSON.stringify({ guildId, panelKey: panelKey || "all", placeholder, updated: panels.length, refreshed }));
} finally {
  await prisma.$disconnect();
}

async function refreshDiscordPanelMessage(panel) {
  if (!panel.channelId || !panel.messageId || !process.env.DISCORD_BOT_TOKEN) return false;

  const response = await fetch(`https://discord.com/api/v10/channels/${panel.channelId}/messages/${panel.messageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [
        {
          title: panel.embedTitle,
          description: panel.embedDescription,
          color: panel.embedColor,
          footer: { text: `Rose Ticket panel - ${panel.name}` },
          ...(panel.thumbnailUrl ? { thumbnail: { url: panel.thumbnailUrl } } : {}),
          ...(panel.imageUrl ? { image: { url: panel.imageUrl } } : {})
        }
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: ["rose", "panel", "select", encodeURIComponent(panel.panelId)].join(":").slice(0, 100),
              placeholder: panel.dropdownPlaceholder,
              disabled: !panel.isEnabled || panel.options.length === 0,
              options: panel.options.slice(0, 25).map((option) => ({
                label: option.label,
                value: option.optionId,
                ...(option.description ? { description: option.description } : {}),
                ...(option.emoji ? { emoji: parseEmoji(option.emoji) } : {})
              }))
            }
          ]
        }
      ]
    })
  }).catch(() => null);

  return Boolean(response?.ok);
}

function parseEmoji(emoji) {
  const custom = emoji.match(/^<(?<animated>a?):(?<name>[^:]+):(?<id>\d+)>$/);
  if (custom?.groups) {
    return {
      id: custom.groups.id,
      name: custom.groups.name,
      animated: custom.groups.animated === "a"
    };
  }
  return { name: emoji };
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
