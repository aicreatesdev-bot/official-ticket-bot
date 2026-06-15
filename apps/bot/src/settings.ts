import type { Guild, GuildMember } from "discord.js";
import { prisma, type GuildSettings } from "@rose-ticket/db";
import { brand } from "@rose-ticket/shared";

export async function ensureGuildSettings(guild: Guild) {
  return prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    update: { ownerId: guild.ownerId },
    create: {
      guildId: guild.id,
      ownerId: guild.ownerId,
      brandName: brand.name,
      brandColor: brand.color
    }
  });
}

export async function getGuildSettings(guild: Guild) {
  return ensureGuildSettings(guild);
}

export async function setRoleArray(settings: GuildSettings, key: RoleArrayKey, role: { id: string } | null) {
  if (!role) return settings;
  const existing = settings[key] as string[];
  if (existing.length === 1 && existing[0] === role.id) return settings;

  return prisma.guildSettings.update({
    where: { guildId: settings.guildId },
    data: { [key]: [role.id] }
  });
}

export function memberRoleIds(member: GuildMember) {
  return member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => role.id);
}

export type RoleArrayKey =
  | "trustedAdminRoles"
  | "staffRoles"
  | "managerRoles"
  | "allowedCreateRoles"
  | "blockedCreateRoles"
  | "managePanelRoles"
  | "manageTicketRoles";
