import type { ModalQuestion, TicketPriority } from "./types.js";

export const brand = {
  name: "Rose Ticket",
  color: 0x8b5cf6,
  successColor: 0x22c55e,
  warningColor: 0xf59e0b,
  dangerColor: 0xef4444,
  neutralColor: 0x111827
} as const;

export const defaultPriorities: TicketPriority[] = ["low", "medium", "high", "urgent"];

export const defaultModalQuestions: ModalQuestion[] = [
  {
    id: "title",
    label: "Issue title",
    placeholder: "Short summary of your issue",
    required: true,
    paragraph: false
  },
  {
    id: "description",
    label: "Problem description",
    placeholder: "Describe what happened and what you need help with",
    required: true,
    paragraph: true
  }
];

export const defaultTicketNameFormat = "{category}-{username}-{count}";
export const maxDiscordSelectOptions = 25;
export const maxModalInputs = 5;
export const defaultMaxOpenTickets = 3;
export const defaultTicketCooldownSeconds = 60;

export const autoCloseChoices = {
  "12h": 12 * 60 * 60,
  "24h": 24 * 60 * 60,
  "3d": 3 * 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60
} as const;

export const discordPermissionBits = {
  manageGuild: 0x20n,
  administrator: 0x8n
} as const;
