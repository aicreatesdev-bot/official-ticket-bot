export type NamingContext = {
  username?: string | null;
  user?: string | null;
  userId?: string | null;
  server?: string | null;
  serverId?: string | null;
  serverMemberCount?: number | null;
  ticketId?: string | null;
  ticketName?: string | null;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  ticketStatus?: string | null;
  ticketClaimedBy?: string | null;
  ticketCreatedAt?: Date | string | null;
  ticketClosedAt?: Date | string | null;
  staffRole?: string | null;
  panelName?: string | null;
  threadLink?: string | null;
  count?: number | null;
};

const placeholderMap: Record<string, keyof NamingContext> = {
  user: "user",
  user_id: "userId",
  username: "username",
  server: "server",
  server_id: "serverId",
  server_membercount: "serverMemberCount",
  ticket_id: "ticketId",
  ticket_name: "ticketName",
  ticket_category: "ticketCategory",
  ticket_priority: "ticketPriority",
  ticket_status: "ticketStatus",
  ticket_claimed_by: "ticketClaimedBy",
  ticket_created_at: "ticketCreatedAt",
  ticket_closed_at: "ticketClosedAt",
  staff_role: "staffRole",
  panel_name: "panelName",
  thread_link: "threadLink",
  category: "ticketCategory",
  priority: "ticketPriority",
  count: "count"
};

export function renderTicketName(format: string, context: NamingContext) {
  const rendered = format.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, rawKey: string) => {
    const key = placeholderMap[rawKey.toLowerCase()];
    if (!key) return "";
    const value = context[key];
    if (value === undefined || value === null) return "";
    if (value instanceof Date) return value.toISOString();
    if (rawKey.toLowerCase() === "count" && typeof value === "number") return value.toString().padStart(4, "0");
    return String(value);
  });

  return sanitizeDiscordName(rendered || "ticket");
}

export function sanitizeDiscordName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "ticket";
}
