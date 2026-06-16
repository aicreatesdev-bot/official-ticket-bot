import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIEmbed,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ColorResolvable,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import { brand, customId, discordTimestamp, intToHexColor } from "@rose-ticket/shared";
import type { Ticket, TicketPanel, TicketPanelOption } from "@rose-ticket/db";

export function roseEmbed(title: string, description?: string, color: ColorResolvable = brand.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description ?? null)
    .setTimestamp()
    .setFooter({ text: brand.name });
}

export function successEmbed(description: string) {
  return roseEmbed("Success", description, brand.successColor);
}

export function errorEmbed(description: string) {
  return roseEmbed("Something went wrong", description, brand.dangerColor);
}

export function panelEmbed(panel: TicketPanel) {
  const embed = new EmbedBuilder()
    .setColor((panel.embedColor || brand.color) as ColorResolvable)
    .setTitle(panel.embedTitle)
    .setDescription(panel.embedDescription)
    .setFooter({ text: `${brand.name} panel - ${panel.name}` });

  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  return embed;
}

export function panelComponents(panel: TicketPanel, options: TicketPanelOption[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId("panel", "select", panel.panelId))
    .setPlaceholder(panel.dropdownPlaceholder)
    .setDisabled(!panel.isEnabled || options.length === 0)
    .addOptions(
      options.slice(0, 25).map((option) => ({
        label: option.label,
        description: option.description ?? undefined,
        emoji: option.emoji ?? undefined,
        value: option.optionId
      }))
    );

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export function ticketControlEmbed(ticket: Ticket) {
  const claimed = ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed";
  const closed = ticket.closedAt ? `\n**Closed:** ${discordTimestamp(ticket.closedAt, "f")}` : "";

  return roseEmbed(
    `Ticket #${ticket.publicId}: ${ticket.title}`,
    [
      `**Status:** ${ticket.status}`,
      `**Category:** ${ticket.category}`,
      `**Priority:** ${ticket.priority}`,
      `**Creator:** <@${ticket.creatorId}>`,
      `**Claimed by:** ${claimed}`,
      `**Claim mode:** ${ticket.claimMode.replace("_", " ")}`,
      `**Opened:** ${discordTimestamp(ticket.createdAt, "f")}${closed}`
    ].join("\n"),
    priorityColor(ticket.priority)
  );
}

export function ticketControlRows(ticketId: string, closed = false) {
  const rowOne = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("ticket", "claim", ticketId))
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "transfer", ticketId))
      .setLabel("Transfer Claim")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "add_user", ticketId))
      .setLabel("Add User")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "remove_user", ticketId))
      .setLabel("Remove User")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed)
  );

  const rowTwo = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("ticket", "rename", ticketId))
      .setLabel("Rename Ticket")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "priority", ticketId))
      .setLabel("Set Priority")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "transcript", ticketId))
      .setLabel("Save Transcript")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "close", ticketId))
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed)
  );

  return [rowOne, rowTwo];
}

export function pendingTicketLogRows(ticketId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId("ticket", "claim", ticketId))
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId("ticket", "join", ticketId))
      .setLabel("Join Ticket")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row];
}

export function priorityColor(priority: string): ColorResolvable {
  if (priority === "urgent") return brand.dangerColor;
  if (priority === "high") return brand.warningColor;
  if (priority === "low") return 0x38bdf8;
  return brand.color;
}

export async function replySuccess(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  description: string,
  ephemeral = true
) {
  return safeReply(interaction, { embeds: [successEmbed(description)], ephemeral });
}

export async function replyError(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  description: string,
  ephemeral = true
) {
  return safeReply(interaction, { embeds: [errorEmbed(description)], ephemeral });
}

export async function safeReply(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  options: InteractionReplyOptions
) {
  if (interaction.deferred || interaction.replied) {
    const editOptions: InteractionEditReplyOptions = {
      content: options.content,
      embeds: options.embeds,
      components: options.components,
      files: options.files,
      allowedMentions: options.allowedMentions
    };
    return interaction.editReply(editOptions);
  }
  return interaction.reply(options);
}

export function apiEmbedPreview(embed: APIEmbed) {
  return {
    title: embed.title ?? "Ticket Support",
    description: embed.description ?? "Select an option to open a private ticket thread.",
    color: intToHexColor(embed.color)
  };
}
