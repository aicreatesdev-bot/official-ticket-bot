import { REST, Routes } from "discord.js";
import { pathToFileURL } from "node:url";
import { slashCommands } from "./commands.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);

export async function registerSlashCommands(guildIds?: string[]) {
  const targetGuildIds = [...new Set(guildIds ?? (env.BOT_DEV_GUILD_ID ? [env.BOT_DEV_GUILD_ID] : []))].filter(Boolean);

  if (targetGuildIds.length === 0) {
    const registeredCommands = (await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: slashCommands
    })) as Array<{ id: string }>;
    logger.info(`Registered ${registeredCommands.length} slash commands globally.`);
    return;
  }

  for (const guildId of targetGuildIds) {
    const registeredCommands = (await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), {
      body: slashCommands
    })) as Array<{ id: string }>;
    logger.info(`Registered ${registeredCommands.length} slash commands for guild ${guildId}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await registerSlashCommands();
}
