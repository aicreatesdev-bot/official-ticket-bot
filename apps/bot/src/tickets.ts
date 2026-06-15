import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextBasedChannel
} from "discord.js";
import {
  brand,
  canCreateTicket,
  canManageTickets,
  customId,
  defaultModalQuestions,
  defaultTicketNameFormat,
  renderTicketName,
  sanitizeDiscordName,
  threadLink,
  type ModalQuestion,
  type TicketPriority
} from "@rose-ticket/shared";
import { prisma, type Ticket, type TicketPanelOption } from "@rose-ticket/db";
import { env } from "./env.js";
import {
  errorEmbed,
  replyError,
  replySuccess,
  roseEmbed,
  safeReply,
  ticketControlEmbed,
  ticketControlRows
} from "./embeds.js";
import { acquireLock, releaseLock } from "./locks.js";
import { logTicketEvent, postClosedTicketLog, postGuildLog } from "./logging.js";
import { logger } from "./logger.js";
import { ensureGuildSettings, memberRoleIds } from "./settings.js";

export async function showTicketModal(interaction: StringSelectMenuInteraction, panelId: string) {
  const optionId = interaction.values[0];
  if (!optionId) return replyError(interaction, "No ticket option was selected.");

  const panel = await prisma.ticketPanel.findFirst({
    where: { panelId, guildId: interaction.guildId ?? undefined, isEnabled: true },
    include: { options: true }
  });
  const option = panel?.options.find((item) => item.optionId === optionId);

  if (!panel || !option) return replyError(interaction, "That ticket panel is not available anymore.");

  const modal = new ModalBuilder()
    .setTitle(`Open ${option.label}`)
    .setCustomId(customId("ticket", "create", panelId, optionId));

  const questions = buildModalQuestions(option);
  for (const question of questions) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(question.id)
          .setLabel(question.label)
          .setPlaceholder(question.placeholder ?? "")
          .setRequired(question.required)
          .setStyle(question.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setMaxLength(question.paragraph ? 1000 : 100)
      )
    );
  }

  await interaction.showModal(modal);
}

export async function createTicketFromModal(interaction: ModalSubmitInteraction, panelId: string, optionId: string) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "Tickets can only be created inside a server.");

  const lockKey = `ticket-create:${guild.id}:${interaction.user.id}`;
  if (!acquireLock(lockKey)) return replyError(interaction, "Your ticket is already being created. Please wait a moment.");

  await interaction.deferReply({ ephemeral: true });

  try {
    const settings = await ensureGuildSettings(guild);
    const member = await guild.members.fetch(interaction.user.id);
    const option = await prisma.ticketPanelOption.findFirst({
      where: { optionId, panel: { panelId, guildId: guild.id, isEnabled: true } },
      include: { panel: true }
    });

    if (!option) return replyError(interaction, "That ticket category is no longer available.");

    if (
      !canCreateTicket({
        guildOwnerId: guild.ownerId,
        userId: interaction.user.id,
        userRoleIds: memberRoleIds(member),
        trustedAdminRoles: settings.trustedAdminRoles,
        allowedCreateRoles: settings.allowedCreateRoles,
        blockedCreateRoles: settings.blockedCreateRoles
      })
    ) {
      return replyError(interaction, "You do not have permission to create tickets in this server.");
    }

    const parent = await guild.channels.fetch(option.parentChannelId).catch(() => null);
    if (!parent || parent.type !== ChannelType.GuildText) {
      return replyError(interaction, "The configured parent support channel is missing or is not a text channel.");
    }

    const answers = collectModalAnswers(interaction, buildModalQuestions(option));
    const title = answers.title ?? "Support request";
    const description = answers.description ?? "No description provided.";
    const priority = normalizePriority(answers.priority);
    if (!priority) return replyError(interaction, "Priority must be Low, Medium, High, or Urgent.");

    const publicId = await allocatePublicTicketId(guild.id);

    const syntheticTicketId = `${guild.id}-${publicId}`;
    const name = renderTicketName(option.ticketNameFormat || defaultTicketNameFormat, {
      user: interaction.user.tag,
      userId: interaction.user.id,
      username: interaction.user.username,
      server: guild.name,
      serverId: guild.id,
      serverMemberCount: guild.memberCount,
      ticketId: syntheticTicketId,
      ticketCategory: option.categoryKey,
      ticketPriority: priority,
      ticketStatus: "open",
      staffRole: option.staffRoleIds[0] ? `<@&${option.staffRoleIds[0]}>` : null,
      panelName: option.panel.name,
      count: publicId
    });

    const thread = await (parent as TextChannel).threads.create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Rose Ticket created by ${interaction.user.tag}`
    });

    await thread.members.add(interaction.user.id).catch(() => null);

    const ticket = await prisma.ticket.create({
      data: {
        publicId,
        guildId: guild.id,
        panelId: option.panelId,
        optionId: option.optionId,
        creatorId: interaction.user.id,
        threadId: thread.id,
        parentChannelId: parent.id,
        title,
        description,
        proof: answers.proof,
        formAnswers: answers,
        category: option.label,
        priority,
        status: "open",
        claimMode: option.claimMode,
        staffRoleIds: option.staffRoleIds,
        lastMessageAt: new Date()
      }
    });

    await thread.send({
      content: `<@${interaction.user.id}>`,
      embeds: [
        ticketControlEmbed(ticket),
        roseEmbed("Opening Details", formatOpeningDetails(description, answers.proof, answers))
      ],
      components: ticketControlRows(ticket.ticketId)
    });

    await logTicketEvent({
      guildId: guild.id,
      ticketId: ticket.ticketId,
      actorId: interaction.user.id,
      type: "created",
      message: `Ticket #${ticket.publicId} created.`,
      metadata: { threadId: thread.id, panelId, optionId }
    });

    await postGuildLog(guild, `Ticket #${ticket.publicId} opened by <@${interaction.user.id}> in <#${thread.id}>.`, {
      ticketId: ticket.ticketId,
      pingRoleIds: option.pingStaff ? option.staffRoleIds : []
    });
    return replySuccess(interaction, `Your ticket was created: <#${thread.id}>`, true);
  } catch (error) {
    logger.error("Ticket creation failed.", error);
    await logTicketEvent({
      guildId: guild.id,
      actorId: interaction.user.id,
      type: "error",
      message: "Ticket creation failed.",
      metadata: { error: String(error) }
    });
    return replyError(interaction, "I could not create your ticket. Please ask staff to check my permissions.");
  } finally {
    releaseLock(lockKey);
  }
}

async function allocatePublicTicketId(guildId: string) {
  const maxTicket = await prisma.ticket.aggregate({
    where: { guildId },
    _max: { publicId: true }
  });
  const nextFromTickets = (maxTicket._max.publicId ?? 0) + 1;

  const counter = await prisma.guildTicketCounter.upsert({
    where: { guildId_categoryKey: { guildId, categoryKey: "_global" } },
    update: { count: { increment: 1 } },
    create: { guildId, categoryKey: "_global", count: nextFromTickets }
  });

  if (counter.count >= nextFromTickets) return counter.count;

  const repaired = await prisma.guildTicketCounter.update({
    where: { guildId_categoryKey: { guildId, categoryKey: "_global" } },
    data: { count: nextFromTickets }
  });

  return repaired.count;
}

export async function claimTicket(interaction: ButtonInteraction | ChatInputCommandInteraction, ticketId?: string) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (ticket.status === "closed") return replyError(interaction, "This ticket is already closed.");
  if (ticket.claimedBy) {
    if (ticket.claimedBy === interaction.user.id) return replySuccess(interaction, "You already claimed this ticket.");
    return replyError(interaction, `This ticket is already claimed by <@${ticket.claimedBy}>. Use **Join Ticket** to join without taking the claim.`);
  }

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return replyError(interaction, "The ticket thread no longer exists.");

  const claimed = await prisma.ticket.updateMany({
    where: { ticketId: ticket.ticketId, claimedBy: null, status: { not: "closed" } },
    data: {
      status: "claimed",
      claimedBy: interaction.user.id,
      firstResponseAt: ticket.firstResponseAt ?? new Date()
    }
  });
  if (!claimed.count) {
    const current = await prisma.ticket.findUnique({ where: { ticketId: ticket.ticketId } });
    if (current?.claimedBy) {
      return replyError(interaction, `This ticket is already claimed by <@${current.claimedBy}>. Use **Join Ticket** to join without taking the claim.`);
    }
    return replyError(interaction, "This ticket could not be claimed. Please try again.");
  }

  await thread.members.add(interaction.user.id).catch(() => null);
  const updated = await prisma.ticket.findUnique({ where: { ticketId: ticket.ticketId } });
  if (!updated) return replyError(interaction, "This ticket could not be loaded after claiming.");

  await applyClaimMode(interaction.guild!, updated);
  await logTicketEvent({
    guildId: updated.guildId,
    ticketId: updated.ticketId,
    actorId: interaction.user.id,
    type: "claimed",
    message: `Ticket claimed by ${interaction.user.id}.`
  });

  await announceTicketUpdate(thread, updated, `Ticket claimed by <@${interaction.user.id}>.`);
  return replySuccess(interaction, "Ticket claimed.");
}

export async function joinTicket(interaction: ButtonInteraction | ChatInputCommandInteraction, ticketId?: string) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (ticket.status === "closed") return replyError(interaction, "This ticket is already closed.");

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return replyError(interaction, "The ticket thread no longer exists.");

  await thread.members.add(interaction.user.id).catch(() => null);
  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "user_added",
    message: `Staff ${interaction.user.id} joined the ticket.`
  });
  await announceTicketUpdate(thread, ticket, `<@${interaction.user.id}> joined the ticket.`);
  return replySuccess(interaction, `Joined ticket #${ticket.publicId}: <#${thread.id}>`);
}

export async function canTransferTicketClaim(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) {
    await replyError(interaction, "This is not an active Rose Ticket thread.");
    return false;
  }
  if (!(await requireTicketManager(interaction, ticket))) return false;
  return requireTicketClaimer(interaction, ticket);
}

export async function unclaimTicket(interaction: ButtonInteraction | ChatInputCommandInteraction, ticketId?: string) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (!(await requireTicketClaimer(interaction, ticket))) return;

  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: { status: "open", claimedBy: null }
  });

  await logTicketEvent({
    guildId: updated.guildId,
    ticketId: updated.ticketId,
    actorId: interaction.user.id,
    type: "unclaimed",
    message: "Ticket claim removed."
  });

  await announceTicketUpdate(interaction.channel as TextBasedChannel, updated, "Ticket claim removed.");
  return replySuccess(interaction, "Ticket unclaimed.");
}

export async function transferTicketClaim(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  targetUserId: string,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (!(await requireTicketClaimer(interaction, ticket))) return;

  const target = await interaction.guild!.members.fetch(targetUserId).catch(() => null);
  if (!target) return replyError(interaction, "I could not find that staff member.");
  if (target.id === interaction.user.id) return replyError(interaction, "You already own this claim.");
  if (!(await canMemberManageTicket(interaction.guild!, target, ticket))) {
    return replyError(interaction, "That user does not have permission to manage this ticket.");
  }

  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: {
      status: "claimed",
      claimedBy: target.id,
      firstResponseAt: ticket.firstResponseAt ?? new Date()
    }
  });

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (thread?.isThread()) await thread.members.add(target.id).catch(() => null);
  await applyClaimMode(interaction.guild!, updated);

  await logTicketEvent({
    guildId: updated.guildId,
    ticketId: updated.ticketId,
    actorId: interaction.user.id,
    type: "claim_transferred",
    message: `Ticket claim transferred to ${target.id}.`
  });

  await announceTicketUpdate(interaction.channel as TextBasedChannel, updated, `Ticket claim transferred to <@${target.id}>.`);
  return replySuccess(interaction, `Transferred claim to ${target}.`);
}

export async function addTicketUser(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  userId: string,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return replyError(interaction, "The ticket thread no longer exists.");

  await thread.members.add(userId).catch(() => null);
  const addedUsers = Array.from(new Set([...ticket.addedUsers, userId]));
  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: { addedUsers }
  });

  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "user_added",
    message: `Added user ${userId}.`
  });
  await announceTicketUpdate(thread, updated, `<@${userId}> was added to the ticket.`);
  return replySuccess(interaction, `Added <@${userId}> to this ticket.`);
}

export async function removeTicketUser(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  userId: string,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;

  if (userId === ticket.creatorId) return replyError(interaction, "The ticket creator cannot be removed.");

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return replyError(interaction, "The ticket thread no longer exists.");

  await thread.members.remove(userId).catch(() => null);
  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: { addedUsers: ticket.addedUsers.filter((id) => id !== userId) }
  });

  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "user_removed",
    message: `Removed user ${userId}.`
  });
  await announceTicketUpdate(thread, updated, `<@${userId}> was removed from the ticket.`);
  return replySuccess(interaction, `Removed <@${userId}> from this ticket.`);
}

export async function renameTicket(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  name: string,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;

  const cleanName = sanitizeDiscordName(name);
  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return replyError(interaction, "The ticket thread no longer exists.");

  await thread.setName(cleanName, `Rose Ticket renamed by ${interaction.user.tag}`);
  const updated = await prisma.ticket.update({ where: { ticketId: ticket.ticketId }, data: { title: cleanName } });
  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "renamed",
    message: `Renamed ticket to ${cleanName}.`
  });
  await announceTicketUpdate(thread, updated, `Ticket renamed to **${cleanName}**.`);
  return replySuccess(interaction, `Renamed ticket to **${cleanName}**.`);
}

export async function setTicketPriority(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  priorityInput: string,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;

  const priority = normalizePriority(priorityInput);
  if (!priority) return replyError(interaction, "Priority must be Low, Medium, High, or Urgent.");

  const updated = await prisma.ticket.update({ where: { ticketId: ticket.ticketId }, data: { priority } });
  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "priority_changed",
    message: `Priority changed to ${priority}.`
  });
  await announceTicketUpdate(interaction.channel as TextBasedChannel, updated, `Priority changed to **${priority}**.`);
  return replySuccess(interaction, `Priority changed to **${priority}**.`);
}

export async function closeTicket(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  reason = "No reason provided.",
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (ticket.status === "closed") return replyError(interaction, "This ticket is already closed.");

  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const transcript = await saveTicketTranscript(interaction.client, ticket, interaction.user.id);
  const updated = await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedBy: interaction.user.id,
      closeReason: reason,
      transcriptId: transcript?.transcriptId ?? ticket.transcriptId
    }
  });

  const thread = await interaction.guild!.channels.fetch(ticket.threadId).catch(() => null);
  if (thread?.isThread()) {
    await announceTicketUpdate(thread, updated, `Ticket closed by <@${interaction.user.id}>.\n**Reason:** ${reason}`);
    await thread.setLocked(true, "Rose Ticket closed").catch(() => null);
    await thread.setArchived(true, "Rose Ticket closed").catch(() => null);
  }

  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: interaction.user.id,
    type: "closed",
    message: `Ticket closed. Reason: ${reason}`
  });

  await postClosedTicketLog(interaction.guild!, `Ticket #${ticket.publicId} closed by <@${interaction.user.id}>. Transcript: \`${transcript?.transcriptId ?? "not saved"}\`.`);
  return safeReply(interaction, { embeds: [roseEmbed("Ticket Closed", `Saved transcript and closed ticket #${ticket.publicId}.`)], ephemeral: true });
}

export async function saveTranscriptForInteraction(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  ticketId?: string
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) return replyError(interaction, "This is not an active Rose Ticket thread.");
  if (!(await requireTicketManager(interaction, ticket))) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const transcript = await saveTicketTranscript(interaction.client, ticket, interaction.user.id);
  if (!transcript) return replyError(interaction, "I could not save a transcript for this ticket.");
  return safeReply(interaction, {
    embeds: [roseEmbed("Transcript Saved", `Transcript ID: \`${transcript.transcriptId}\`\nMessages: **${transcript.messageCount}**`)],
    ephemeral: true
  });
}

export async function ensureVisibleTicketControls(client: Client) {
  const activeTickets = await prisma.ticket.findMany({
    where: { status: { in: ["open", "claimed"] } }
  });
  let repaired = 0;

  for (const ticket of activeTickets) {
    const channel = await client.channels.fetch(ticket.threadId).catch(() => null);
    if (!channel?.isThread()) continue;

    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const botMessages = messages?.filter((message) => message.author.id === client.user?.id);
    let hasVisibleControls = false;

    for (const message of botMessages?.values() ?? []) {
      const hasControls = hasTicketControlComponents(message);
      const hasSummary = hasTicketSummaryEmbed(message, ticket);
      const hasOpeningDetails = message.embeds.some((embed) => embed.title === "Opening Details");
      if (!hasControls && !hasSummary && !hasOpeningDetails) continue;

      if (hasControls || hasSummary) hasVisibleControls = true;

      const embeds = message.embeds.length
        ? message.embeds.map((embed) => EmbedBuilder.from(embed).setColor(brand.color))
        : [ticketControlEmbed(ticket)];
      const payload: {
        embeds: EmbedBuilder[];
        components?: ReturnType<typeof ticketControlRows>;
      } = { embeds };

      if (hasControls || hasSummary) {
        payload.components = ticketControlRows(ticket.ticketId, ticket.status === "closed");
      }

      await message
        .edit(payload)
        .then(() => {
          repaired += 1;
        })
        .catch(() => null);
    }

    if (hasVisibleControls) continue;

    await channel
      .send({
        embeds: [ticketControlEmbed(ticket)],
        components: ticketControlRows(ticket.ticketId, ticket.status === "closed")
      })
      .then(() => {
        repaired += 1;
      })
      .catch(() => null);
  }

  return repaired;
}

export async function canUseTicketControl(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  ticketId?: string,
  managerOnly = false
) {
  const ticket = await ticketFromInteraction(interaction, ticketId);
  if (!ticket) {
    await replyError(interaction, "This is not an active Rose Ticket thread.");
    return false;
  }

  return requireTicketManager(interaction, ticket, managerOnly);
}

export async function showTicketStats(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return replyError(interaction, "I could not verify your server membership.");

  const settings = await ensureGuildSettings(guild);
  const ok = canManageTickets({
    guildOwnerId: guild.ownerId,
    userId: interaction.user.id,
    userRoleIds: memberRoleIds(member),
    trustedAdminRoles: settings.trustedAdminRoles,
    staffRoles: settings.staffRoles,
    managerRoles: [],
    manageTicketRoles: settings.manageTicketRoles
  });
  if (!ok) return replyError(interaction, "You don't have this ticket permission.");

  const [total, open, claimed, closed, urgent] = await Promise.all([
    prisma.ticket.count({ where: { guildId: guild.id } }),
    prisma.ticket.count({ where: { guildId: guild.id, status: "open" } }),
    prisma.ticket.count({ where: { guildId: guild.id, status: "claimed" } }),
    prisma.ticket.count({ where: { guildId: guild.id, status: "closed" } }),
    prisma.ticket.count({ where: { guildId: guild.id, priority: "urgent", status: { in: ["open", "claimed"] } } })
  ]);

  return safeReply(interaction, {
    embeds: [
      roseEmbed(
        "Ticket Stats",
        [`**Total:** ${total}`, `**Open:** ${open}`, `**Claimed:** ${claimed}`, `**Closed:** ${closed}`, `**Urgent active:** ${urgent}`].join("\n")
      )
    ],
    ephemeral: true
  });
}

export async function updateTicketActivity(message: Message) {
  if (!message.guild || message.author.bot || !message.channel.isThread()) return;
  const ticket = await prisma.ticket.findFirst({
    where: { guildId: message.guild.id, threadId: message.channel.id, status: { in: ["open", "claimed"] } }
  });
  if (!ticket) return;

  if (ticket.claimMode === "read_only_claim" && ticket.claimedBy && message.author.id !== ticket.claimedBy && message.author.id !== ticket.creatorId) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    const canManage = member ? await canMemberManageTicket(message.guild, member, ticket, true) : false;
    if (!canManage) {
      await message.delete().catch(() => null);
      await message.channel
        .send({ embeds: [errorEmbed("This ticket is claimed in read-only mode. Please wait for the claimed staff member.")] })
        .then((warning) => setTimeout(() => warning.delete().catch(() => null), 5000))
        .catch(() => null);
      return;
    }
  }

  await prisma.ticket.update({ where: { ticketId: ticket.ticketId }, data: { lastMessageAt: new Date(), warningSentAt: null } });
}

export async function saveTicketTranscript(client: Client, ticket: Ticket, actorId?: string | null) {
  const existing = ticket.transcriptId
    ? await prisma.transcripts.findUnique({ where: { transcriptId: ticket.transcriptId } })
    : await prisma.transcripts.findUnique({ where: { ticketId: ticket.ticketId } });
  if (existing) return existing;

  const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
  if (!guild) return null;
  const channel = await guild.channels.fetch(ticket.threadId).catch(() => null);
  if (!channel?.isThread()) return null;

  const messages = await fetchThreadMessages(channel, env.TRANSCRIPT_MAX_MESSAGES);
  const attachmentLinks = messages.flatMap((message) => message.attachments.map((attachment) => attachment.url));
  const textContent = transcriptText(ticket, messages);
  const htmlContent = transcriptHtml(ticket, messages);

  const transcript = await prisma.transcripts.create({
    data: {
      ticketId: ticket.ticketId,
      guildId: ticket.guildId,
      htmlContent,
      textContent,
      messageCount: messages.length,
      attachmentLinks
    }
  });

  await prisma.ticket.update({ where: { ticketId: ticket.ticketId }, data: { transcriptId: transcript.transcriptId } });

  await logTicketEvent({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId,
    type: "transcript_saved",
    message: `Transcript ${transcript.transcriptId} saved.`,
    metadata: { messageCount: messages.length }
  });

  await deliverTranscript(guild, ticket, transcript.htmlContent, transcript.textContent, transcript.transcriptId);
  return transcript;
}

async function deliverTranscript(guild: Guild, ticket: Ticket, html: string, text: string, transcriptId: string) {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  const channelId = settings?.transcriptChannelId ?? settings?.logChannelId;
  const htmlFile = new AttachmentBuilder(Buffer.from(html), { name: `rose-ticket-${ticket.publicId}.html` });
  const textFile = new AttachmentBuilder(Buffer.from(text), { name: `rose-ticket-${ticket.publicId}.txt` });

  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel
        .send({
          embeds: [
            roseEmbed(
              `Transcript #${ticket.publicId}`,
              `Ticket: \`${ticket.ticketId}\`\nCreator: <@${ticket.creatorId}>\nTranscript ID: \`${transcriptId}\``
            )
          ],
          files: [htmlFile, textFile]
        })
        .catch(() => null);
    }
  }

  if (settings?.dmTranscriptOnClose) {
    const member = await guild.members.fetch(ticket.creatorId).catch(() => null);
    await member?.send({ embeds: [roseEmbed(`Your Ticket Transcript`, `Transcript for ticket #${ticket.publicId}.`)], files: [textFile] }).catch(() => null);
  }
}

async function ticketFromInteraction(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  explicitTicketId?: string
) {
  if (!interaction.guild) return null;
  if (explicitTicketId) return prisma.ticket.findFirst({ where: { ticketId: explicitTicketId, guildId: interaction.guild.id } });
  if (!interaction.channel?.isThread()) return null;
  return prisma.ticket.findFirst({ where: { threadId: interaction.channel.id, guildId: interaction.guild.id } });
}

async function requireTicketManager(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  ticket: Ticket,
  managerOnly = false
) {
  if (!interaction.guild) {
    await replyError(interaction, "This action can only be used in a server.");
    return false;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyError(interaction, "I could not verify your server membership.");
    return false;
  }

  const ok = await canMemberManageTicket(interaction.guild, member, ticket, managerOnly);
  if (!ok) await replyError(interaction, "You don't have this ticket permission.");
  return ok;
}

async function requireTicketClaimer(
  interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction,
  ticket: Ticket
) {
  if (ticket.status === "closed") {
    await replyError(interaction, "This ticket is already closed.");
    return false;
  }
  if (!ticket.claimedBy) {
    await replyError(interaction, "This ticket is not claimed yet.");
    return false;
  }
  if (ticket.claimedBy !== interaction.user.id) {
    await replyError(
      interaction,
      `Only <@${ticket.claimedBy}> can transfer this claim. Use **Join Ticket** to join without taking the claim.`
    );
    return false;
  }

  return true;
}

async function canMemberManageTicket(guild: Guild, member: GuildMember, ticket: Ticket, managerOnly = false) {
  const settings = await ensureGuildSettings(guild);
  const input = {
    guildOwnerId: guild.ownerId,
    userId: member.id,
    userRoleIds: memberRoleIds(member),
    trustedAdminRoles: settings.trustedAdminRoles,
    staffRoles: settings.staffRoles,
    managerRoles: [],
    manageTicketRoles: settings.manageTicketRoles
  };

  if (managerOnly) {
    return (
      input.guildOwnerId === input.userId ||
      input.trustedAdminRoles.some((roleId) => input.userRoleIds.includes(roleId)) ||
      input.manageTicketRoles.some((roleId) => input.userRoleIds.includes(roleId))
    );
  }

  return canManageTickets(input, ticket.staffRoleIds);
}

async function announceTicketUpdate(channel: TextBasedChannel | null, ticket: Ticket, message: string) {
  if (!channel || !("send" in channel)) return;
  const embed = ticketControlEmbed(ticket);
  embed.setDescription(`${embed.data.description ?? ""}\n\n${message}`);
  await channel
    .send({ embeds: [embed], components: ticketControlRows(ticket.ticketId, ticket.status === "closed") })
    .catch(() => null);
}

function hasTicketControlComponents(message: Message) {
  const rows = message.components as unknown as Array<{ components?: Array<{ customId?: string; data?: { custom_id?: string }; toJSON?: () => { custom_id?: string } }> }>;
  return rows.some((row) =>
    row.components?.some((component) => {
      const customId = component.customId ?? component.data?.custom_id ?? component.toJSON?.().custom_id;
      return typeof customId === "string" && customId.startsWith("rose:ticket:");
    })
  );
}

function hasTicketSummaryEmbed(message: Message, ticket: Ticket) {
  return message.embeds.some((embed) => embed.title?.startsWith(`Ticket #${ticket.publicId}:`));
}

async function applyClaimMode(guild: Guild, ticket: Ticket) {
  if (ticket.claimMode !== "private_claim" || !ticket.claimedBy) return;

  const thread = await guild.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread?.isThread()) return;

  const settings = await ensureGuildSettings(guild);
  const keep = new Set([ticket.creatorId, ticket.claimedBy, guild.ownerId, ...ticket.addedUsers]);

  await guild.members.fetch().catch(() => null);
  for (const member of guild.members.cache.values()) {
    const roles = memberRoleIds(member);
    if (settings.trustedAdminRoles.some((roleId) => roles.includes(roleId))) {
      keep.add(member.id);
    }
  }

  const members = await thread.members.fetch().catch(() => null);
  if (!members) return;

  for (const threadMember of members.values()) {
    if (!keep.has(threadMember.id)) await thread.members.remove(threadMember.id).catch(() => null);
  }
}

function buildModalQuestions(option: TicketPanelOption): ModalQuestion[] {
  const raw = Array.isArray(option.modalQuestions) ? (option.modalQuestions as ModalQuestion[]) : [];
  const questions = raw.length ? raw : defaultModalQuestions;
  const ids = new Set(questions.map((question) => question.id));
  const merged = [...questions];

  if (!ids.has("title")) merged.unshift(defaultModalQuestions[0]!);
  if (!ids.has("description")) merged.splice(1, 0, defaultModalQuestions[1]!);
  if (!ids.has("priority") && option.priorityEnabled) {
    merged.push({
      id: "priority",
      label: "Priority: Low, Medium, High, Urgent",
      placeholder: "Medium",
      required: true,
      paragraph: false
    });
  }
  if (!ids.has("proof")) merged.push(defaultModalQuestions[2]!);

  return merged.slice(0, 5);
}

function collectModalAnswers(interaction: ModalSubmitInteraction, questions: ModalQuestion[]) {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const value = interaction.fields.getTextInputValue(question.id);
    if (value) answers[question.id] = value;
  }
  return answers;
}

function normalizePriority(input: string | undefined | null): TicketPriority | null {
  const normalized = (input ?? "medium").toLowerCase().trim();
  if (["low", "medium", "high", "urgent"].includes(normalized)) return normalized as TicketPriority;
  return null;
}

function formatOpeningDetails(description: string, proof: string | undefined, answers: Record<string, string>) {
  const custom = Object.entries(answers)
    .filter(([key]) => !["title", "description", "priority", "proof"].includes(key))
    .map(([key, value]) => `**${key}:** ${value}`)
    .join("\n");
  return [`**Description:**\n${description}`, proof ? `**Proof/link/image note:**\n${proof}` : null, custom || null]
    .filter(Boolean)
    .join("\n\n");
}

async function fetchThreadMessages(thread: ThreadChannel, maxMessages: number) {
  const messages: Message[] = [];
  let before: string | undefined;

  while (messages.length < maxMessages) {
    const batch = await thread.messages.fetch({ limit: Math.min(100, maxMessages - messages.length), before });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function transcriptText(ticket: Ticket, messages: Message[]) {
  const header = [
    `Rose Ticket Transcript`,
    `Ticket ID: ${ticket.ticketId}`,
    `Public ID: ${ticket.publicId}`,
    `Creator: ${ticket.creatorId}`,
    `Claimed staff: ${ticket.claimedBy ?? "Unclaimed"}`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    `Opened: ${ticket.createdAt.toISOString()}`,
    `Closed: ${ticket.closedAt?.toISOString() ?? "Not closed"}`,
    ""
  ].join("\n");

  const body = messages
    .map((message) => {
      const attachments = message.attachments.map((attachment) => ` [attachment: ${attachment.url}]`).join("");
      return `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.cleanContent}${attachments}`;
    })
    .join("\n");

  return `${header}${body}`;
}

function transcriptHtml(ticket: Ticket, messages: Message[]) {
  const rows = messages
    .map((message) => {
      const attachments = message.attachments
        .map((attachment) => `<a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.name ?? attachment.url)}</a>`)
        .join(" ");
      return `<article><time>${message.createdAt.toISOString()}</time><strong>${escapeHtml(message.author.tag)}</strong><p>${escapeHtml(message.cleanContent || "[embed/attachment]")}</p>${attachments}</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rose Ticket #${ticket.publicId}</title>
  <style>
    body { background:#09090f; color:#f8fafc; font-family:Inter,Arial,sans-serif; margin:0; padding:32px; }
    header, article { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:16px; margin-bottom:12px; }
    time { color:#94a3b8; display:block; font-size:12px; margin-bottom:4px; }
    strong { color:#c4b5fd; }
    a { color:#7dd3fc; }
    p { white-space:pre-wrap; }
  </style>
</head>
<body>
  <header>
    <h1>Rose Ticket #${ticket.publicId}</h1>
    <p>Ticket ID: ${escapeHtml(ticket.ticketId)}<br />Creator: ${escapeHtml(ticket.creatorId)}<br />Claimed: ${escapeHtml(ticket.claimedBy ?? "Unclaimed")}<br />Category: ${escapeHtml(ticket.category)}<br />Priority: ${escapeHtml(ticket.priority)}</p>
  </header>
  ${rows}
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
