import type { NextFunction, Request, Response } from "express";
import { prisma } from "@rose-ticket/db";
import { canManagePanels, canManageTickets, dashboardRole, hasManageGuild } from "@rose-ticket/shared";
import { getBotGuild, getGuildMember } from "./discord.js";
import { getSession, type SessionPayload } from "./session.js";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
      guildAccess?: {
        guildId: string;
        ownerId: string;
        roleIds: string[];
        role: string;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  req.session = session;
  return next();
}

export async function requireGuildAccess(req: Request, res: Response, next: NextFunction) {
  const guildId = req.params.guildId ?? req.body.guildId;
  if (!guildId || !req.session) return res.status(400).json({ error: "Missing guild ID" });

  const oauthGuild = req.session.guilds.find((guild) => guild.id === guildId);
  const botGuild = await getBotGuild(guildId).catch(() => null);
  if (!botGuild) return res.status(404).json({ error: "Rose Ticket is not in that server" });

  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  const member = await getGuildMember(guildId, req.session.user.id).catch(() => null);
  const roleIds = member?.roles ?? [];
  const ownerId = botGuild.owner_id;
  const hasOAuthManage = oauthGuild ? oauthGuild.owner || hasManageGuild(oauthGuild.permissions) : false;
  const role = dashboardRole({
    guildOwnerId: ownerId,
    userId: req.session.user.id,
    userRoleIds: roleIds,
    trustedAdminRoles: settings?.trustedAdminRoles,
    staffRoles: settings?.staffRoles,
    managerRoles: settings?.managerRoles
  });

  if (!hasOAuthManage && role === "none") {
    return res.status(403).json({ error: "You do not have access to manage this server" });
  }

  req.guildAccess = { guildId, ownerId, roleIds, role: hasOAuthManage && role === "none" ? "trusted_admin" : role };
  return next();
}

export async function requirePanelManager(req: Request, res: Response, next: NextFunction) {
  const access = req.guildAccess;
  if (!access || !req.session) return res.status(401).json({ error: "Not authenticated" });
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: access.guildId } });
  const ok =
    access.role === "owner" ||
    access.role === "trusted_admin" ||
    access.role === "manager" ||
    canManagePanels({
      guildOwnerId: access.ownerId,
      userId: req.session.user.id,
      userRoleIds: access.roleIds,
      trustedAdminRoles: settings?.trustedAdminRoles,
      managePanelRoles: settings?.managePanelRoles
    });
  if (!ok) return res.status(403).json({ error: "Panel manager permission required" });
  return next();
}

export async function requireTicketManager(req: Request, res: Response, next: NextFunction) {
  const access = req.guildAccess;
  if (!access || !req.session) return res.status(401).json({ error: "Not authenticated" });
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: access.guildId } });
  const ok =
    access.role === "owner" ||
    access.role === "trusted_admin" ||
    access.role === "manager" ||
    canManageTickets({
      guildOwnerId: access.ownerId,
      userId: req.session.user.id,
      userRoleIds: access.roleIds,
      trustedAdminRoles: settings?.trustedAdminRoles,
      managerRoles: settings?.managerRoles,
      staffRoles: settings?.staffRoles,
      manageTicketRoles: settings?.manageTicketRoles
    });
  if (!ok) return res.status(403).json({ error: "Ticket manager permission required" });
  return next();
}
