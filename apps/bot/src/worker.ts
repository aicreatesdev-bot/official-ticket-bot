import type { Client } from "discord.js";
import { prisma, type Ticket } from "@rose-ticket/db";
import { roseEmbed, ticketControlRows } from "./embeds.js";
import { env } from "./env.js";
import { logTicketEvent } from "./logging.js";
import { saveTicketTranscript, sendTicketClosedDm } from "./tickets.js";

let interval: NodeJS.Timeout | null = null;

export function startAutoCloseWorker(client: Client) {
  if (interval) clearInterval(interval);
  interval = setInterval(() => runAutoCloseSweep(client).catch(() => null), env.AUTO_CLOSE_INTERVAL_MS);
}

export async function runAutoCloseSweep(client: Client) {
  const settings = await prisma.guildSettings.findMany({ where: { autoCloseEnabled: true } });
  for (const guildSettings of settings) {
    const warnBeforeSeconds = Math.min(3600, Math.floor(guildSettings.autoCloseTime / 4));
    const warningCutoff = new Date(Date.now() - (guildSettings.autoCloseTime - warnBeforeSeconds) * 1000);
    const closeCutoff = new Date(Date.now() - guildSettings.autoCloseTime * 1000);

    const warnTickets = await prisma.ticket.findMany({
      where: {
        guildId: guildSettings.guildId,
        status: { in: ["open", "claimed"] },
        warningSentAt: null,
        lastMessageAt: { lte: warningCutoff, gt: closeCutoff }
      },
      take: 25
    });

    for (const ticket of warnTickets) await warnTicket(client, ticket);

    const closeTickets = await prisma.ticket.findMany({
      where: {
        guildId: guildSettings.guildId,
        status: { in: ["open", "claimed"] },
        lastMessageAt: { lte: closeCutoff }
      },
      take: 25
    });

    for (const ticket of closeTickets) await autoCloseTicket(client, ticket);
  }
}

async function warnTicket(client: Client, ticket: Ticket) {
  const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
  const thread = await guild?.channels.fetch(ticket.threadId).catch(() => null);
  if (thread?.isTextBased() && "send" in thread) {
    await thread
      .send({
        embeds: [roseEmbed("Inactive Ticket Warning", "This ticket will close soon due to inactivity. Reply here to keep it open.")]
      })
      .catch(() => null);
  }
  await prisma.ticket.update({ where: { ticketId: ticket.ticketId }, data: { warningSentAt: new Date() } });
  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    type: "auto_close_warning",
    message: "Auto-close warning sent."
  });
}

async function autoCloseTicket(client: Client, ticket: Ticket) {
  const transcript = await saveTicketTranscript(client, ticket, client.user?.id);
  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedBy: client.user?.id ?? null,
      closeReason: "Closed automatically due to inactivity.",
      transcriptId: transcript?.transcriptId ?? ticket.transcriptId
    }
  });

  await sendTicketClosedDm(client, updated);

  const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
  const thread = await guild?.channels.fetch(ticket.threadId).catch(() => null);
  if (thread?.isThread()) {
    await thread
      .send({
        embeds: [roseEmbed("Ticket Auto-Closed", "This ticket was closed due to inactivity.")],
        components: ticketControlRows(ticket.ticketId, true)
      })
      .catch(() => null);
    await thread.setLocked(true, "Rose Ticket auto-close").catch(() => null);
    await thread.setArchived(true, "Rose Ticket auto-close").catch(() => null);
  }

  await logTicketEvent({
    guildId: updated.guildId,
    ticketId: updated.ticketId,
    actorId: client.user?.id,
    type: "auto_closed",
    message: "Ticket closed due to inactivity."
  });
}
