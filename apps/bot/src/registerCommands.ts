import { REST, Routes } from "discord.js";
import { slashCommands } from "./commands.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);

const route = env.BOT_DEV_GUILD_ID
  ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.BOT_DEV_GUILD_ID)
  : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

await rest.put(route, { body: slashCommands });

logger.info(`Registered ${slashCommands.length} slash commands${env.BOT_DEV_GUILD_ID ? " for dev guild" : " globally"}.`);
