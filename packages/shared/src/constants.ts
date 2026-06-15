import type { ModalQuestion, TicketPriority } from "./types.js";

export const brand = {
  name: "Rose Ticket",
  color: 0xf174d2,
  successColor: 0xf174d2,
  warningColor: 0xf174d2,
  dangerColor: 0xf174d2,
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
  },
  {
    id: "proof",
    label: "Proof/link/image note",
    placeholder: "Optional links, evidence, or attachment notes",
    required: false,
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
