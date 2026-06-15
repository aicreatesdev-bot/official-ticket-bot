import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Interaction,
  type ModalSubmitInteraction
} from "discord.js";
import { canManagePanels, parseCustomId } from "@rose-ticket/shared";
import { prisma } from "@rose-ticket/db";
import {
  editPanelFromCommand,
  editPanelFromModal,
  createPanelFromCommand,
  deletePanelFromCommand,
  sendPanelFromCommand,
  showPanelsFromCommand
} from "./panels.js";
import { replyError, replySuccess, roseEmbed, safeReply } from "./embeds.js";
import { logger } from "./logger.js";
import { ensureGuildSettings, memberRoleIds, setRoleArray } from "./settings.js";
import {
  addTicketUser,
  canTransferTicketClaim,
  canUseTicketControl,
  claimTicket,
  closeTicket,
  createTicketFromModal,
  joinTicket,
  removeTicketUser,
  renameTicket,
  saveTranscriptForInteraction,
  setTicketPriority,
  showTicketModal,
  showTicketStats,
  transferTicketClaim,
  unclaimTicket
} from "./tickets.js";

export function registerInteractionHandlers(client: Client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      logger.error("Unhandled interaction error.", error);
      if (interaction.isRepliable()) {
        await safeReply(interaction as ChatInputCommandInteraction, {
          embeds: [roseEmbed("Rose Ticket Error", "Something went wrong while handling that action.")],
          ephemeral: true
        }).catch(() => null);
      }
    }
  });
}

async function handleInteraction(interaction: Interaction) {
  if (interaction.isChatInputCommand()) return handleCommand(interaction);
  if (interaction.isStringSelectMenu()) {
    const parsed = parseCustomId(interaction.customId);
    if (parsed?.scope === "panel" && parsed.action === "select" && parsed.id) {
      return showTicketModal(interaction, parsed.id);
    }
  }
  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return replyError(interaction, "Rose Ticket commands must be used in a server.");

  if (interaction.commandName === "panel" && interaction.options.getSubcommand() === "edit") {
    if (!(await ensureCanManagePanels(interaction))) return;
    return editPanelFromCommand(interaction);
  }

  await interaction.deferReply({ ephemeral: true });

  if (interaction.commandName === "setup") return handleSetup(interaction);
  if (interaction.commandName === "panel") {
    if (!(await ensureCanManagePanels(interaction))) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "create") return createPanelFromCommand(interaction);
    if (sub === "edit") return editPanelFromCommand(interaction);
    if (sub === "delete") return deletePanelFromCommand(interaction);
    if (sub === "send") return sendPanelFromCommand(interaction);
    if (sub === "show") return showPanelsFromCommand(interaction);
  }
  if (interaction.commandName === "ticket") {
    const sub = interaction.options.getSubcommand();
    if (sub === "close") return closeTicket(interaction, interaction.options.getString("reason") ?? "Closed by command.");
    if (sub === "claim") return claimTicket(interaction);
    if (sub === "unclaim") return unclaimTicket(interaction);
    if (sub === "add-user") return addTicketUser(interaction, interaction.options.getUser("user", true).id);
    if (sub === "remove-user") return removeTicketUser(interaction, interaction.options.getUser("user", true).id);
    if (sub === "rename") return renameTicket(interaction, interaction.options.getString("name", true));
    if (sub === "priority") return setTicketPriority(interaction, interaction.options.getString("priority", true));
    if (sub === "transcript") return saveTranscriptForInteraction(interaction);
    if (sub === "stats") return showTicketStats(interaction);
  }
  if (interaction.commandName === "config") {
    if (!(await ensureCanManageSettings(interaction))) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "roles") return handleConfigRoles(interaction);
    if (sub === "autoclose") return handleAutoClose(interaction);
  }
  if (interaction.commandName === "help") return handleHelp(interaction);
}

async function handleButton(interaction: ButtonInteraction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.scope !== "ticket" || !parsed.id) return;

  if (parsed.action === "transfer") {
    if (!(await canTransferTicketClaim(interaction, parsed.id))) return;
    return showTextModal(interaction, "transfer", parsed.id, "Transfer Claim", "staff_user_id", "Staff user ID");
  }
  if (parsed.action === "add_user") return showTextModal(interaction, "add_user", parsed.id, "Add User", "user_id", "User ID to add");
  if (parsed.action === "remove_user") return showTextModal(interaction, "remove_user", parsed.id, "Remove User", "user_id", "User ID to remove");
  if (parsed.action === "rename") return showTextModal(interaction, "rename", parsed.id, "Rename Ticket", "name", "New thread name");
  if (parsed.action === "priority") return showTextModal(interaction, "priority", parsed.id, "Set Priority", "priority", "Low, Medium, High, or Urgent");
  if (parsed.action === "close") return showTextModal(interaction, "close", parsed.id, "Close Ticket", "reason", "Close reason", true);

  await interaction.deferReply({ ephemeral: true });
  if (parsed.action === "claim") return claimTicket(interaction, parsed.id);
  if (parsed.action === "join") return joinTicket(interaction, parsed.id);
  if (parsed.action === "unclaim") return unclaimTicket(interaction, parsed.id);
  if (parsed.action === "transcript") return saveTranscriptForInteraction(interaction, parsed.id);
}

async function handleModal(interaction: ModalSubmitInteraction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  if (parsed.scope === "ticket" && parsed.action === "create" && parsed.id && parsed.extra?.[0]) {
    return createTicketFromModal(interaction, parsed.id, parsed.extra[0]);
  }
  if (parsed.scope === "ticket_action" && parsed.id) {
    if (parsed.action === "transfer") return transferTicketClaim(interaction, interaction.fields.getTextInputValue("staff_user_id"), parsed.id);
    if (parsed.action === "add_user") return addTicketUser(interaction, interaction.fields.getTextInputValue("user_id"), parsed.id);
    if (parsed.action === "remove_user") return removeTicketUser(interaction, interaction.fields.getTextInputValue("user_id"), parsed.id);
    if (parsed.action === "rename") return renameTicket(interaction, interaction.fields.getTextInputValue("name"), parsed.id);
    if (parsed.action === "priority") return setTicketPriority(interaction, interaction.fields.getTextInputValue("priority"), parsed.id);
    if (parsed.action === "close") return closeTicket(interaction, interaction.fields.getTextInputValue("reason"), parsed.id);
  }
  if (parsed.scope === "panel" && parsed.action === "edit" && parsed.id) {
    if (!(await ensureCanManagePanels(interaction))) return;
    return editPanelFromModal(interaction, parsed.id);
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!(await ensureCanBootstrap(interaction))) return;
  const settings = await ensureGuildSettings(interaction.guild!);
  let updated = settings;
  const trustedRole = interaction.options.getRole("trusted_admin_role");
  const staffRole = interaction.options.getRole("staff_role");
  updated = await setRoleArray(updated, "trustedAdminRoles", trustedRole);
  updated = await setRoleArray(updated, "staffRoles", staffRole);
  updated = await clearManagerRoles(updated);
  const synced = staffRole ? await syncStaffRoleEverywhere(interaction.guildId!, staffRole.id) : null;
  const pendingLogChannel = interaction.options.getChannel("pending_ticket_log_channel");
  const closedLogChannel = interaction.options.getChannel("closed_ticket_log_channel");
  if (pendingLogChannel || closedLogChannel) {
    updated = await prisma.guildSettings.update({
      where: { guildId: interaction.guildId! },
      data: {
        ...(pendingLogChannel ? { logChannelId: pendingLogChannel.id } : {}),
        ...(closedLogChannel ? { transcriptChannelId: closedLogChannel.id } : {})
      }
    });
  }

  return safeReply(interaction, {
    embeds: [
      roseEmbed(
        "Rose Ticket Setup Complete",
        [
          `Trusted admin roles: ${updated.trustedAdminRoles.map((id) => `<@&${id}>`).join(", ") || "None"}`,
          `Staff roles: ${updated.staffRoles.map((id) => `<@&${id}>`).join(", ") || "None"}`,
          `Pending ticket log: ${updated.logChannelId ? `<#${updated.logChannelId}>` : "Not set"}`,
          `Closed ticket log: ${updated.transcriptChannelId ? `<#${updated.transcriptChannelId}>` : "Not set"}`,
          synced ? `Synced staff role to ${synced.panelOptions} panel option(s) and ${synced.activeTickets} active ticket(s).` : null
        ].join("\n")
      )
    ],
    ephemeral: true
  });
}

async function handleConfigRoles(interaction: ChatInputCommandInteraction) {
  const settings = await ensureGuildSettings(interaction.guild!);
  let updated = settings;
  const trustedRole = interaction.options.getRole("trusted_admin_role");
  const staffRole = interaction.options.getRole("staff_role");
  updated = await setRoleArray(updated, "trustedAdminRoles", trustedRole);
  updated = await setRoleArray(updated, "staffRoles", staffRole);
  updated = await clearManagerRoles(updated);
  const synced = staffRole ? await syncStaffRoleEverywhere(interaction.guildId!, staffRole.id) : null;
  return replySuccess(
    interaction,
    [
      `Updated role configuration for **${interaction.guild!.name}**.`,
      synced ? `Synced staff role to ${synced.panelOptions} panel option(s) and ${synced.activeTickets} active ticket(s).` : null
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function handleAutoClose(interaction: ChatInputCommandInteraction) {
  const enabled = interaction.options.getBoolean("enabled", true);
  const hours = interaction.options.getInteger("hours") ?? 24;
  await prisma.guildSettings.update({
    where: { guildId: interaction.guildId! },
    data: { autoCloseEnabled: enabled, autoCloseTime: hours * 60 * 60 }
  });
  return replySuccess(interaction, `Auto-close is now **${enabled ? "enabled" : "disabled"}**${enabled ? ` after ${hours} hour(s)` : ""}.`);
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  return safeReply(interaction, {
    embeds: [
      roseEmbed(
        "Rose Ticket Help",
        [
          "`/setup` - owner or trusted admins only.",
          "`/panel create|edit|delete|send|show` - owner or trusted admins.",
          "`/ticket claim|unclaim|transfer|add-user|remove-user|rename|priority|transcript|close|stats` - staff and trusted admins.",
          "`/config roles|autoclose` - owner or trusted admins.",
          "Dashboard uses Discord OAuth and the same role checks."
        ].join("\n")
      )
    ],
    ephemeral: true
  });
}

async function ensureCanBootstrap(interaction: ChatInputCommandInteraction) {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const settings = await ensureGuildSettings(interaction.guild!);
  const roles = memberRoleIds(member);
  const isOwner = interaction.guild!.ownerId === interaction.user.id;
  const isTrustedAdmin = settings.trustedAdminRoles.some((roleId) => roles.includes(roleId));
  if (isOwner || isTrustedAdmin) return true;
  await replyError(interaction, "Only the server owner or trusted admins can run setup.");
  return false;
}

async function ensureCanManageSettings(interaction: ChatInputCommandInteraction) {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const settings = await ensureGuildSettings(interaction.guild!);
  const roles = memberRoleIds(member);
  const isAllowed =
    interaction.guild!.ownerId === interaction.user.id ||
    settings.trustedAdminRoles.some((roleId) => roles.includes(roleId));
  if (isAllowed) return true;
  await replyError(interaction, "You do not have permission to manage Rose Ticket settings.");
  return false;
}

async function ensureCanManagePanels(interaction: ChatInputCommandInteraction | ModalSubmitInteraction) {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const settings = await ensureGuildSettings(interaction.guild!);
  const ok = canManagePanels({
    guildOwnerId: interaction.guild!.ownerId,
    userId: interaction.user.id,
    userRoleIds: memberRoleIds(member),
    trustedAdminRoles: settings.trustedAdminRoles,
    managePanelRoles: settings.managePanelRoles
  });
  if (ok) return true;
  await replyError(interaction, "You do not have permission to manage ticket panels.");
  return false;
}

async function showTextModal(
  interaction: ButtonInteraction,
  action: string,
  ticketId: string,
  title: string,
  inputId: string,
  label: string,
  paragraph = false,
  managerOnly = false
) {
  if (!(await canUseTicketControl(interaction, ticketId, managerOnly))) return;

  const modal = new ModalBuilder().setCustomId(`rose:ticket_action:${action}:${ticketId}`).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(inputId)
        .setLabel(label)
        .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(paragraph ? 1000 : 100)
    )
  );
  await interaction.showModal(modal);
}

async function clearManagerRoles(settings: Awaited<ReturnType<typeof ensureGuildSettings>>) {
  if (!settings.managerRoles.length) return settings;
  return prisma.guildSettings.update({
    where: { guildId: settings.guildId },
    data: { managerRoles: [] }
  });
}

async function syncStaffRoleEverywhere(guildId: string, staffRoleId: string) {
  const [panelOptions, activeTickets] = await prisma.$transaction([
    prisma.ticketPanelOption.updateMany({
      where: { panel: { guildId } },
      data: { staffRoleIds: [staffRoleId] }
    }),
    prisma.ticket.updateMany({
      where: { guildId, status: { in: ["open", "claimed"] } },
      data: { staffRoleIds: [staffRoleId] }
    })
  ]);

  return { panelOptions: panelOptions.count, activeTickets: activeTickets.count };
}
