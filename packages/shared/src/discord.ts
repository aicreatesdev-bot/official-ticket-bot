import { discordPermissionBits } from "./constants.js";

export function hasManageGuild(permissionString: string | number | bigint | undefined | null) {
  if (permissionString === undefined || permissionString === null) return false;
  const bits = BigInt(permissionString);
  return Boolean(bits & discordPermissionBits.administrator) || Boolean(bits & discordPermissionBits.manageGuild);
}

export function discordTimestamp(date: Date | string | number, style: "f" | "F" | "R" = "f") {
  const seconds = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${seconds}:${style}>`;
}

export function threadLink(guildId: string, channelId: string, threadId: string) {
  return `https://discord.com/channels/${guildId}/${channelId}/${threadId}`;
}
