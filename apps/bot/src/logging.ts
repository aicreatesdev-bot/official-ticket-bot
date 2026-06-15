import type { Guild } from "discord.js";
import { prisma, type TicketEventType } from "@rose-ticket/db";
import { pendingTicketLogRows, roseEmbed } from "./embeds.js";
import { logger } from "./logger.js";

export async function logTicketEvent(input: {
  guildId: string;
  ticketId?: string | null;
  actorId?: string | null;
  type: TicketEventType;
  message: string;
  metadata?: unknown;
}) {
  try {
    await prisma.ticketEvent.create({
      data: {
        guildId: input.guildId,
        ticketId: input.ticketId,
        actorId: input.actorId,
        type: input.type,
        message: input.message,
        metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata))
      }
    });
  } catch (error) {
    logger.warn("Failed to save ticket event.", error);
  }
}

export async function postGuildLog(guild: Guild, message: string, options?: { ticketId?: string; pingRoleIds?: string[] }) {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  const content = options?.pingRoleIds?.length ? options.pingRoleIds.map((roleId) => `<@&${roleId}>`).join(" ") : undefined;
  return postLogMessage(guild, settings?.logChannelId, "Rose Ticket Pending Log", message, {
    content,
    components: options?.ticketId ? pendingTicketLogRows(options.ticketId) : undefined,
    allowedRoleMentions: options?.pingRoleIds
  });
}

export async function postClosedTicketLog(guild: Guild, message: string) {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  const channelId = settings?.transcriptChannelId ?? settings?.logChannelId;
  return postLogMessage(guild, channelId, "Rose Ticket Closed Log", message);
}

async function postLogMessage(
  guild: Guild,
  channelId: string | null | undefined,
  title: string,
  message: string,
  options: { content?: string; components?: ReturnType<typeof pendingTicketLogRows>; allowedRoleMentions?: string[] } = {}
) {
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  if ("send" in channel) {
    await channel
      .send({
        content: options.content,
        embeds: [roseEmbed(title, message)],
        components: options.components,
        allowedMentions: options.allowedRoleMentions?.length ? { roles: options.allowedRoleMentions } : undefined
      })
      .catch((error: unknown) => logger.warn("Failed to post guild log.", error));
  }
}
