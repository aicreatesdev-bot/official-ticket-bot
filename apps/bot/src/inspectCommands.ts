import { REST, Routes } from "discord.js";
import { env } from "./env.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
const guildId = env.BOT_DEV_GUILD_ID;

if (!guildId) {
  console.error("BOT_DEV_GUILD_ID is not set.");
  process.exit(1);
}

const commands = (await rest.get(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId))) as Array<{
  id: string;
  name: string;
  description: string;
}>;

console.log(`Guild commands for ${guildId}:`);
for (const command of commands) {
  console.log(`- /${command.name} (${command.id})`);
}
