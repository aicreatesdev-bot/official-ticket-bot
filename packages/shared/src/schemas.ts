import { z } from "zod";
import { claimModes, ticketPriorities, ticketStatuses } from "./types.js";

export const snowflakeSchema = z.string().regex(/^\d{15,25}$/);
export const hexColorSchema = z.string().regex(/^#?[0-9a-fA-F]{6}$/);

export const modalQuestionSchema = z.object({
  id: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().min(1).max(45),
  placeholder: z.string().max(100).optional(),
  required: z.boolean().default(true),
  paragraph: z.boolean().default(false)
});

export const panelOptionSchema = z.object({
  label: z.string().min(1).max(100),
  description: z.string().max(100).optional().nullable(),
  emoji: z.string().max(64).optional().nullable(),
  categoryKey: z.string().min(1).max(64),
  staffRoleIds: z.array(snowflakeSchema).default([]),
  parentChannelId: snowflakeSchema,
  ticketNameFormat: z.string().min(1).max(90),
  modalQuestions: z.array(modalQuestionSchema).max(5).default([]),
  priorityEnabled: z.boolean().default(true),
  pingStaff: z.boolean().default(true),
  claimMode: z.enum(claimModes).default("open_claim")
});

export const panelSchema = z.object({
  name: z.string().min(1).max(80),
  embedTitle: z.string().min(1).max(256),
  embedDescription: z.string().min(1).max(4000),
  embedColor: hexColorSchema.default("#22c55e"),
  imageUrl: z.string().url().optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  channelId: snowflakeSchema.optional().nullable(),
  dropdownPlaceholder: z.string().min(1).max(150).default("🎫 create ticket for any query"),
  isEnabled: z.boolean().default(true)
});

export const guildSettingsSchema = z.object({
  trustedAdminRoles: z.array(snowflakeSchema).default([]),
  staffRoles: z.array(snowflakeSchema).default([]),
  managerRoles: z.array(snowflakeSchema).default([]),
  allowedCreateRoles: z.array(snowflakeSchema).default([]),
  blockedCreateRoles: z.array(snowflakeSchema).default([]),
  managePanelRoles: z.array(snowflakeSchema).default([]),
  manageTicketRoles: z.array(snowflakeSchema).default([]),
  logChannelId: snowflakeSchema.optional().nullable(),
  transcriptChannelId: snowflakeSchema.optional().nullable(),
  maxOpenTickets: z.number().int().min(1).max(50).default(3),
  ticketCooldown: z.number().int().min(0).max(86400).default(60),
  autoCloseEnabled: z.boolean().default(false),
  autoCloseTime: z.number().int().min(600).max(60 * 60 * 24 * 60).default(86400),
  dmTranscriptOnClose: z.boolean().default(false),
  brandName: z.string().min(1).max(80).default("Rose Ticket"),
  brandColor: hexColorSchema.default("#8b5cf6")
});

export const ticketUpdateSchema = z.object({
  title: z.string().min(1).max(90).optional(),
  priority: z.enum(ticketPriorities).optional(),
  status: z.enum(ticketStatuses).optional()
});

export function colorToInt(color: string) {
  return Number.parseInt(color.replace("#", ""), 16);
}

export function intToHexColor(color: number | null | undefined) {
  if (!color) return "#8b5cf6";
  return `#${color.toString(16).padStart(6, "0")}`;
}
