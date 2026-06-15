export const ticketStatuses = ["open", "claimed", "resolved", "closed"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const ticketPriorities = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof ticketPriorities)[number];

export const claimModes = ["open_claim", "read_only_claim", "private_claim"] as const;
export type ClaimMode = (typeof claimModes)[number];

export const ticketEventTypes = [
  "created",
  "claimed",
  "unclaimed",
  "claim_transferred",
  "user_added",
  "user_removed",
  "renamed",
  "priority_changed",
  "closed",
  "reopened",
  "transcript_saved",
  "auto_close_warning",
  "auto_closed",
  "panel_sent",
  "error"
] as const;
export type TicketEventType = (typeof ticketEventTypes)[number];

export type ModalQuestion = {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  paragraph: boolean;
};

export type TicketAction =
  | "claim"
  | "unclaim"
  | "transfer"
  | "add_user"
  | "remove_user"
  | "rename"
  | "priority"
  | "close"
  | "transcript"
  | "request_close";

export type DashboardRole = "owner" | "trusted_admin" | "manager" | "staff" | "none";
