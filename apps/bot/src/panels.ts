import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel
} from "discord.js";
import { prisma } from "@rose-ticket/db";
import {
  brand,
  colorToInt,
  customId,
  defaultModalQuestions,
  defaultTicketNameFormat,
  hexColorSchema,
  intToHexColor,
  panelKeyFromName,
  panelSchema
} from "@rose-ticket/shared";
import { panelComponents, panelEmbed, replyError, replySuccess, roseEmbed, safeReply } from "./embeds.js";
import { logTicketEvent } from "./logging.js";
import { ensureGuildSettings } from "./settings.js";

export async function createPanelFromCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");

  const parent = interaction.options.getChannel("parent_channel", true);
  const staffRole = interaction.options.getRole("staff_role", true);
  const optionLabel = interaction.options.getString("option_label") ?? "General Support";
  const rawColor = interaction.options.getString("color") ?? "#22c55e";
  if (parent.type !== ChannelType.GuildText || !("threads" in parent)) {
    return replyError(interaction, "The parent channel must be a normal text channel that supports private threads.");
  }

  const parsed = panelSchema.safeParse({
    name: interaction.options.getString("name", true),
    embedTitle: interaction.options.getString("title", true),
    embedDescription: interaction.options.getString("description", true),
    embedColor: rawColor,
    dropdownPlaceholder: "🎫 create ticket for any query",
    isEnabled: true
  });

  if (!parsed.success) {
    return replyError(interaction, parsed.error.issues[0]?.message ?? "Invalid panel settings.");
  }

  await ensureGuildSettings(guild);
  const panelId = await createReadablePanelId(guild.id, parsed.data.name);

  const panel = await prisma.ticketPanel.create({
    data: {
      panelId,
      guildId: guild.id,
      name: parsed.data.name,
      embedTitle: parsed.data.embedTitle,
      embedDescription: parsed.data.embedDescription,
      embedColor: colorToInt(parsed.data.embedColor),
      dropdownPlaceholder: parsed.data.dropdownPlaceholder,
      isEnabled: parsed.data.isEnabled,
      createdBy: interaction.user.id,
      options: {
        create: {
          label: optionLabel,
          description: "Open a private support ticket.",
          categoryKey: optionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "support",
          staffRoleIds: [staffRole.id],
          parentChannelId: parent.id,
          ticketNameFormat: defaultTicketNameFormat,
          modalQuestions: defaultModalQuestions,
          priorityEnabled: true,
          pingStaff: true,
          claimMode: "open_claim"
        }
      }
    }
  });

  await logTicketEvent({
    guildId: guild.id,
    actorId: interaction.user.id,
    type: "panel_sent",
    message: `Created panel ${panel.name}.`,
    metadata: { panelId: panel.panelId }
  });

  return replySuccess(interaction, `Created panel **${panel.name}**.\nPanel key: \`${panel.panelId}\``);
}

export async function editPanelFromCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");

  const panelKey = interaction.options.getString("panel_id", true);
  const panel = await findPanelByKeyOrName(guild.id, panelKey);
  if (!panel) return replyError(interaction, "I could not find that panel in this server.");

  const modal = new ModalBuilder()
    .setCustomId(customId("panel", "edit", panel.panelId))
    .setTitle(`Edit ${panel.name}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Embed title")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setValue(panel.embedTitle.slice(0, 256))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Embed description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(panel.embedDescription.slice(0, 4000))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Embed color hex")
        .setPlaceholder("#22c55e")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(7)
        .setValue(intToHexColor(panel.embedColor))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("enabled")
        .setLabel("Enabled? true or false")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(5)
        .setValue(panel.isEnabled ? "true" : "false")
    )
  );

  return interaction.showModal(modal);
}

export async function editPanelFromModal(interaction: ModalSubmitInteraction, panelId: string) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This action can only be used in a server.");

  await interaction.deferReply({ ephemeral: true });

  const panel = await prisma.ticketPanel.findFirst({
    where: { panelId, guildId: guild.id }
  });
  if (!panel) return replyError(interaction, "I could not find that panel in this server.");

  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const color = interaction.fields.getTextInputValue("color").trim();
  const enabled = parseEnabledInput(interaction.fields.getTextInputValue("enabled"));

  if (!title || !description) return replyError(interaction, "Panel title and description cannot be empty.");
  const parsedColor = hexColorSchema.safeParse(color);
  if (!parsedColor.success) return replyError(interaction, "Embed color must be a 6-digit hex color like `#22c55e`.");
  if (enabled === null) return replyError(interaction, "Enabled must be `true` or `false`.");

  await prisma.ticketPanel.update({
    where: { panelId: panel.panelId },
    data: {
      embedTitle: title,
      embedDescription: description,
      embedColor: colorToInt(parsedColor.data),
      isEnabled: enabled
    }
  });

  const refreshed = await refreshPanelMessage(interaction.client, panel.panelId);
  return replySuccess(
    interaction,
    `Updated panel **${panel.name}**.${refreshed ? "\nThe sent panel message was refreshed too." : ""}`
  );
}

export async function deletePanelFromCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");

  const panelKey = interaction.options.getString("panel_id", true);
  const panel = await findPanelByKeyOrName(guild.id, panelKey);
  if (!panel) return replyError(interaction, "I could not find that panel in this server.");

  await prisma.ticketPanel.delete({ where: { panelId: panel.panelId } });
  return replySuccess(interaction, `Deleted panel **${panel.name}**.`);
}

export async function sendPanelFromCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");

  const panelKey = interaction.options.getString("panel_id", true);
  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText) return replyError(interaction, "The selected channel must be a text channel.");

  const sent = await sendPanelToChannel(guild, panelKey, channel as TextChannel);
  if (!sent.ok) return replyError(interaction, sent.error);
  return replySuccess(interaction, `Sent panel **${sent.panelName}** to ${channel}.`);
}

export async function showPanelsFromCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return replyError(interaction, "This command can only be used in a server.");

  const panels = await prisma.ticketPanel.findMany({
    where: { guildId: guild.id },
    include: { _count: { select: { options: true, tickets: true } } },
    orderBy: { updatedAt: "desc" }
  });

  if (!panels.length) {
    return replyError(interaction, "No ticket panels exist in this server yet.");
  }

  const lines = panels.map((panel, index) => {
    const status = panel.isEnabled ? "enabled" : "disabled";
    const sent = panel.channelId ? `<#${panel.channelId}>` : "not sent";
    return [
      `**${index + 1}. ${panel.name}**`,
      `Key: \`${displayPanelKey(panel.panelId)}\``,
      `Status: ${status}`,
      `Options: ${panel._count.options}`,
      `Tickets: ${panel._count.tickets}`,
      `Channel: ${sent}`
    ].join("\n");
  });

  return safeReply(interaction, {
    embeds: [roseEmbed("Ticket Panels", lines.join("\n\n"))],
    ephemeral: true
  });
}

export async function sendPanelToChannel(guild: Guild, panelKey: string, channel: TextChannel) {
  const panel = await prisma.ticketPanel.findFirst({
    where: panelLookupWhere(guild.id, panelKey),
    include: { options: { orderBy: { sortOrder: "asc" } } }
  });

  if (!panel) return { ok: false as const, error: "Panel not found." };
  if (!panel.options.length) return { ok: false as const, error: "Panel has no dropdown options." };

  const message = await channel.send({
    embeds: [panelEmbed(panel)],
    components: panelComponents(panel, panel.options)
  });

  await prisma.ticketPanel.update({
    where: { panelId: panel.panelId },
    data: { channelId: channel.id, messageId: message.id }
  });

  await logTicketEvent({
    guildId: guild.id,
    actorId: message.author.id,
    type: "panel_sent",
    message: `Panel ${panel.name} sent to ${channel.name}.`,
    metadata: { panelId: panel.panelId, channelId: channel.id, messageId: message.id }
  });

  return { ok: true as const, panelName: panel.name, messageId: message.id };
}

export async function ensurePanelMessages(client: Client) {
  const panels = await prisma.ticketPanel.findMany({
    where: {
      channelId: { not: null },
      messageId: { not: null }
    },
    include: { options: { orderBy: { sortOrder: "asc" } } }
  });
  let repainted = 0;

  for (const panel of panels) {
    const channel = await client.channels.fetch(panel.channelId!).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;

    const message = await channel.messages.fetch(panel.messageId!).catch(() => null);
    if (!message || message.author.id !== client.user?.id) continue;

    await message
      .edit({
        embeds: [panelEmbed(panel)],
        components: panelComponents(panel, panel.options)
      })
      .then(() => {
        repainted += 1;
      })
      .catch(() => null);
  }

  return repainted;
}

export async function refreshPanelMessage(client: Client, panelId: string) {
  const panel = await prisma.ticketPanel.findUnique({
    where: { panelId },
    include: { options: { orderBy: { sortOrder: "asc" } } }
  });
  if (!panel?.channelId || !panel.messageId) return false;

  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return false;

  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message || message.author.id !== client.user?.id) return false;

  return message
    .edit({
      embeds: [panelEmbed(panel)],
      components: panelComponents(panel, panel.options)
    })
    .then(() => true)
    .catch(() => false);
}

function parseEnabledInput(input: string) {
  const normalized = input.trim().toLowerCase();
  if (["true", "yes", "on"].includes(normalized)) return true;
  if (["false", "no", "off"].includes(normalized)) return false;
  return null;
}

async function createReadablePanelId(guildId: string, name: string) {
  const base = panelKeyFromName(name);
  let candidate = base;
  let suffix = 2;

  while (await prisma.ticketPanel.findUnique({ where: { panelId: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function findPanelByKeyOrName(guildId: string, keyOrName: string) {
  return prisma.ticketPanel.findFirst({
    where: panelLookupWhere(guildId, keyOrName)
  });
}

function panelLookupWhere(guildId: string, keyOrName: string) {
  const normalizedKey = panelKeyFromName(keyOrName.replace(/^embed:/, ""));
  const legacyKey = `embed:${normalizedKey}`;

  return {
    guildId,
    OR: [
      { panelId: keyOrName },
      { panelId: normalizedKey },
      { panelId: legacyKey },
      { name: { equals: keyOrName, mode: "insensitive" as const } }
    ]
  };
}

function displayPanelKey(panelId: string) {
  return panelId.replace(/^embed:/, "");
}

export function defaultPanelPreview() {
  return {
    name: "Support",
    embedTitle: `${brand.name} Support`,
    embedDescription: "Select a category below to open a private support ticket.",
    embedColor: "#22c55e"
  };
}
