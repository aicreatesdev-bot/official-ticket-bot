import express, { type Request, type Response, type Router } from "express";
import { Prisma, prisma } from "@rose-ticket/db";
import {
  colorToInt,
  customId,
  guildSettingsSchema,
  hasManageGuild,
  intToHexColor,
  panelKeyFromName,
  panelOptionSchema,
  panelSchema,
  sanitizeDiscordName,
  ticketUpdateSchema
} from "@rose-ticket/shared";
import { env } from "./env.js";
import {
  exchangeCode,
  fetchMessages,
  getBotGuild,
  getCurrentUser,
  getCurrentUserGuilds,
  getGuildChannels,
  getGuildMember,
  getGuildRoles,
  patchChannel,
  sendPanelMessage,
  sendThreadMessage
} from "./discord.js";
import { clearSession, setSession } from "./session.js";
import { requireAuth, requireGuildAccess, requirePanelManager, requireTicketManager } from "./authz.js";

export function createRouter(): Router {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true, name: "Rose Ticket API" }));

  router.get("/auth/discord", (_req, res) => {
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: env.DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds",
      prompt: "consent"
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  router.get("/auth/callback", async (req, res, next) => {
    try {
      const code = String(req.query.code ?? "");
      if (!code) return res.redirect(`${env.APP_URL}/login?error=missing_code`);
      const token = await exchangeCode(code);
      const [user, guilds] = await Promise.all([
        getCurrentUser(token.access_token),
        getCurrentUserGuilds(token.access_token)
      ]);

      setSession(res, {
        user,
        guilds,
        issuedAt: Date.now()
      });
      return res.redirect(`${env.APP_URL}/servers`);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/auth/me", requireAuth, (req, res) => res.json({ user: req.session!.user }));
  router.post("/auth/logout", (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  router.get("/guilds", requireAuth, async (req, res, next) => {
    try {
      const manageable = [];
      for (const guild of req.session!.guilds) {
        const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
        const botGuild = await getBotGuild(guild.id).catch(() => null);
        if (!botGuild) continue;
        const member = await getGuildMember(guild.id, req.session!.user.id).catch(() => null);
        const roleIds = member?.roles ?? [];
        const trusted = settings?.trustedAdminRoles.some((roleId) => roleIds.includes(roleId)) ?? false;
        const manager = settings?.managerRoles.some((roleId) => roleIds.includes(roleId)) ?? false;
        if (guild.owner || hasManageGuild(guild.permissions) || trusted || manager) {
          manageable.push({
            ...guild,
            ownerId: botGuild.owner_id,
            role: guild.owner ? "owner" : trusted ? "trusted_admin" : manager ? "manager" : "manage_server"
          });
        }
      }
      res.json({ guilds: manageable });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/overview", requireAuth, requireGuildAccess, async (req, res, next) => {
    try {
      const guildId = req.params.guildId;
      const [total, open, claimed, closed, byCategory, firstResponses] = await Promise.all([
        prisma.ticket.count({ where: { guildId } }),
        prisma.ticket.count({ where: { guildId, status: "open" } }),
        prisma.ticket.count({ where: { guildId, status: "claimed" } }),
        prisma.ticket.count({ where: { guildId, status: "closed" } }),
        prisma.ticket.groupBy({ by: ["category"], where: { guildId }, _count: true }),
        prisma.ticket.findMany({
          where: { guildId, firstResponseAt: { not: null } },
          select: { createdAt: true, firstResponseAt: true },
          take: 500
        })
      ]);

      const avgResponseSeconds = firstResponses.length
        ? Math.round(
            firstResponses.reduce(
              (totalSeconds, ticket) => totalSeconds + (ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime()) / 1000,
              0
            ) / firstResponses.length
          )
        : 0;

      res.json({
        total,
        open,
        claimed,
        closed,
        averageResponseSeconds: avgResponseSeconds,
        ticketsByCategory: byCategory.map((item) => ({ category: item.category, count: item._count }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/settings", requireAuth, requireGuildAccess, async (req, res, next) => {
    try {
      const guildId = req.params.guildId!;
      const botGuild = await getBotGuild(guildId);
      const settings = await prisma.guildSettings.upsert({
        where: { guildId },
        update: { ownerId: botGuild.owner_id },
        create: { guildId, ownerId: botGuild.owner_id }
      });
      res.json({ settings: serializeSettings(settings) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/guilds/:guildId/settings", requireAuth, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const parsed = guildSettingsSchema.parse(req.body);
      const settings = await prisma.guildSettings.update({
        where: { guildId: req.params.guildId },
        data: {
          ...parsed,
          brandColor: colorToInt(parsed.brandColor)
        }
      });
      res.json({ settings: serializeSettings(settings) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/discord/roles-channels", requireAuth, requireGuildAccess, async (req, res, next) => {
    try {
      const guildId = req.params.guildId!;
      const [roles, channels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)]);
      res.json({
        roles: roles
          .filter((role) => !role.managed)
          .sort((a, b) => b.position - a.position)
          .map((role) => ({ id: role.id, name: role.name, color: role.color })),
        channels: channels
          .filter((channel) => channel.type === 0)
          .sort((a, b) => a.position - b.position)
          .map((channel) => ({ id: channel.id, name: channel.name, parentId: channel.parent_id ?? null }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/panels", requireAuth, requireGuildAccess, async (req, res, next) => {
    try {
      const panels = await prisma.ticketPanel.findMany({
        where: { guildId: req.params.guildId },
        include: { options: { orderBy: { sortOrder: "asc" } } },
        orderBy: { updatedAt: "desc" }
      });
      res.json({ panels: panels.map(serializePanel) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/guilds/:guildId/panels", requireAuth, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const guildId = req.params.guildId!;
      const parsed = panelSchema.parse(req.body);
      const panelId = await createReadablePanelId(parsed.name);
      const panel = await prisma.ticketPanel.create({
        data: {
          panelId,
          guildId,
          name: parsed.name,
          embedTitle: parsed.embedTitle,
          embedDescription: parsed.embedDescription,
          embedColor: colorToInt(parsed.embedColor),
          imageUrl: parsed.imageUrl,
          thumbnailUrl: parsed.thumbnailUrl,
          channelId: parsed.channelId,
          dropdownPlaceholder: parsed.dropdownPlaceholder,
          isEnabled: parsed.isEnabled,
          createdBy: req.session!.user.id
        },
        include: { options: true }
      });
      res.status(201).json({ panel: serializePanel(panel) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/panels/:panelId", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const parsed = panelSchema.partial().parse(req.body);
      const panel = await prisma.ticketPanel.update({
        where: { panelId: req.params.panelId },
        data: {
          name: parsed.name,
          embedTitle: parsed.embedTitle,
          embedDescription: parsed.embedDescription,
          embedColor: parsed.embedColor ? colorToInt(parsed.embedColor) : undefined,
          imageUrl: parsed.imageUrl,
          thumbnailUrl: parsed.thumbnailUrl,
          channelId: parsed.channelId,
          dropdownPlaceholder: parsed.dropdownPlaceholder,
          isEnabled: parsed.isEnabled
        },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      });
      res.json({ panel: serializePanel(panel) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/panels/:panelId", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      await prisma.ticketPanel.delete({ where: { panelId: req.params.panelId } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/panels/:panelId/send", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const panel = await prisma.ticketPanel.findUnique({
        where: { panelId: req.params.panelId },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      });
      if (!panel) return res.status(404).json({ error: "Panel not found" });
      const channelId = String(req.body.channelId ?? panel.channelId ?? "");
      if (!channelId) return res.status(400).json({ error: "Missing channelId" });
      const message = await sendPanelMessage(channelId, panelMessagePayload(panel));
      const updated = await prisma.ticketPanel.update({
        where: { panelId: panel.panelId },
        data: { channelId, messageId: message.id },
        include: { options: true }
      });
      res.json({ panel: serializePanel(updated), messageId: message.id });
    } catch (error) {
      next(error);
    }
  });

  router.post("/panels/:panelId/templates", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const panel = await prisma.ticketPanel.findUnique({
        where: { panelId: req.params.panelId },
        include: { options: true }
      });
      if (!panel) return res.status(404).json({ error: "Panel not found" });
      const template = await prisma.panelTemplate.create({
        data: {
          guildId: panel.guildId,
          panelId: panel.panelId,
          name: String(req.body.name ?? `${panel.name} Template`),
          data: serializePanel(panel) as Prisma.InputJsonValue,
          createdBy: req.session!.user.id
        }
      });
      res.status(201).json({ template });
    } catch (error) {
      next(error);
    }
  });

  router.get("/panels/:panelId/options", requireAuth, attachPanelGuild, requireGuildAccess, async (req, res, next) => {
    try {
      const options = await prisma.ticketPanelOption.findMany({
        where: { panelId: req.params.panelId },
        orderBy: { sortOrder: "asc" }
      });
      res.json({ options });
    } catch (error) {
      next(error);
    }
  });

  router.post("/panels/:panelId/options", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const panelId = req.params.panelId!;
      const parsed = panelOptionSchema.parse(req.body);
      const option = await prisma.ticketPanelOption.create({
        data: {
          panelId,
          ...parsed
        }
      });
      res.status(201).json({ option });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/panels/:panelId/options/:optionId", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      const parsed = panelOptionSchema.partial().parse(req.body);
      const option = await prisma.ticketPanelOption.update({
        where: { optionId: req.params.optionId },
        data: parsed
      });
      res.json({ option });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/panels/:panelId/options/:optionId", requireAuth, attachPanelGuild, requireGuildAccess, requirePanelManager, async (req, res, next) => {
    try {
      await prisma.ticketPanelOption.delete({ where: { optionId: req.params.optionId } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/tickets", requireAuth, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
      const tickets = await prisma.ticket.findMany({
        where: {
          guildId: req.params.guildId,
          status: status && status !== "all" ? (status as never) : undefined,
          priority: priority && priority !== "all" ? (priority as never) : undefined
        },
        orderBy: { updatedAt: "desc" },
        take: 200
      });
      res.json({ tickets });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tickets/:ticketId", requireAuth, attachTicketGuild, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { ticketId: req.params.ticketId }, include: { transcript: true } });
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tickets/:ticketId/close", requireAuth, attachTicketGuild, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { ticketId: req.params.ticketId } });
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      const transcript = await saveApiTranscript(ticket);
      const updated = await prisma.ticket.update({
        where: { ticketId: ticket.ticketId },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedBy: req.session!.user.id,
          closeReason: String(req.body.reason ?? "Closed from dashboard"),
          transcriptId: transcript?.transcriptId ?? ticket.transcriptId
        }
      });
      await sendThreadMessage(ticket.threadId, {
        embeds: [{ title: "Ticket Closed", description: `Closed from dashboard by <@${req.session!.user.id}>.`, color: 0xef4444 }]
      }).catch(() => null);
      await patchChannel(ticket.threadId, { archived: true, locked: true }).catch(() => null);
      res.json({ ticket: updated, transcript });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tickets/:ticketId/rename", requireAuth, attachTicketGuild, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const parsed = ticketUpdateSchema.pick({ title: true }).parse(req.body);
      const name = sanitizeDiscordName(parsed.title!);
      const ticket = await prisma.ticket.update({ where: { ticketId: req.params.ticketId }, data: { title: name } });
      await patchChannel(ticket.threadId, { name }).catch(() => null);
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tickets/:ticketId/priority", requireAuth, attachTicketGuild, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const parsed = ticketUpdateSchema.pick({ priority: true }).parse(req.body);
      const ticket = await prisma.ticket.update({ where: { ticketId: req.params.ticketId }, data: { priority: parsed.priority } });
      await sendThreadMessage(ticket.threadId, {
        embeds: [{ title: "Priority Updated", description: `Priority changed to **${ticket.priority}** from dashboard.`, color: 0x8b5cf6 }]
      }).catch(() => null);
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  router.get("/guilds/:guildId/transcripts", requireAuth, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const transcripts = await prisma.transcripts.findMany({
        where: {
          guildId: req.params.guildId,
          ticket: q
            ? {
                OR: [
                  { creatorId: { contains: q } },
                  { claimedBy: { contains: q } },
                  { category: { contains: q, mode: "insensitive" } },
                  { title: { contains: q, mode: "insensitive" } }
                ]
              }
            : undefined
        },
        include: { ticket: true },
        orderBy: { createdAt: "desc" },
        take: 100
      });
      res.json({ transcripts });
    } catch (error) {
      next(error);
    }
  });

  router.get("/transcripts/:transcriptId", requireAuth, attachTranscriptGuild, requireGuildAccess, requireTicketManager, async (req, res, next) => {
    try {
      const transcript = await prisma.transcripts.findUnique({
        where: { transcriptId: req.params.transcriptId },
        include: { ticket: true }
      });
      if (!transcript) return res.status(404).json({ error: "Transcript not found" });
      res.json({ transcript });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function attachPanelGuild(req: Request, res: Response, next: () => void) {
  const panel = await prisma.ticketPanel.findUnique({ where: { panelId: req.params.panelId } });
  if (!panel) return res.status(404).json({ error: "Panel not found" });
  req.params.guildId = panel.guildId;
  return next();
}

async function attachTicketGuild(req: Request, res: Response, next: () => void) {
  const ticket = await prisma.ticket.findUnique({ where: { ticketId: req.params.ticketId } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  req.params.guildId = ticket.guildId;
  return next();
}

async function attachTranscriptGuild(req: Request, res: Response, next: () => void) {
  const transcript = await prisma.transcripts.findUnique({ where: { transcriptId: req.params.transcriptId } });
  if (!transcript) return res.status(404).json({ error: "Transcript not found" });
  req.params.guildId = transcript.guildId;
  return next();
}

function serializeSettings(settings: { brandColor: number; [key: string]: unknown }) {
  return { ...settings, brandColor: intToHexColor(settings.brandColor) };
}

function serializePanel(panel: {
  embedColor: number;
  options?: unknown[];
  [key: string]: unknown;
}) {
  return { ...panel, embedColor: intToHexColor(panel.embedColor) };
}

function panelMessagePayload(panel: {
  panelId: string;
  name: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  dropdownPlaceholder: string;
  isEnabled: boolean;
  options: Array<{
    optionId: string;
    label: string;
    description: string | null;
    emoji: string | null;
  }>;
}) {
  return {
    embeds: [
      {
        title: panel.embedTitle,
        description: panel.embedDescription,
        color: panel.embedColor,
        image: panel.imageUrl ? { url: panel.imageUrl } : undefined,
        thumbnail: panel.thumbnailUrl ? { url: panel.thumbnailUrl } : undefined,
        footer: { text: `Rose Ticket panel - ${panel.name}` }
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: customId("panel", "select", panel.panelId),
            placeholder: panel.dropdownPlaceholder,
            disabled: !panel.isEnabled || panel.options.length === 0,
            options: panel.options.slice(0, 25).map((option) => ({
              label: option.label,
              value: option.optionId,
              description: option.description ?? undefined,
              emoji: option.emoji ? { name: option.emoji } : undefined
            }))
          }
        ]
      }
    ]
  };
}

async function saveApiTranscript(ticket: {
  ticketId: string;
  publicId: number;
  guildId: string;
  threadId: string;
  creatorId: string;
  claimedBy: string | null;
  category: string;
  priority: string;
  createdAt: Date;
  closedAt: Date | null;
  transcriptId: string | null;
}) {
  const existing = ticket.transcriptId
    ? await prisma.transcripts.findUnique({ where: { transcriptId: ticket.transcriptId } })
    : await prisma.transcripts.findUnique({ where: { ticketId: ticket.ticketId } });
  if (existing) return existing;

  const messages = await fetchMessages(ticket.threadId, 100).catch(() => []);
  const ordered = [...messages].reverse();
  const attachmentLinks = ordered.flatMap((message) => message.attachments.map((attachment) => attachment.url));
  const textContent = [
    `Rose Ticket Transcript`,
    `Ticket ID: ${ticket.ticketId}`,
    `Creator: ${ticket.creatorId}`,
    `Claimed staff: ${ticket.claimedBy ?? "Unclaimed"}`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    "",
    ...ordered.map(
      (message) =>
        `[${message.timestamp}] ${message.author.username}: ${message.content} ${message.attachments.map((a) => a.url).join(" ")}`
    )
  ].join("\n");
  const htmlContent = `<!doctype html><html><body><h1>Rose Ticket #${ticket.publicId}</h1>${ordered
    .map((message) => `<p><strong>${escapeHtml(message.author.username)}</strong>: ${escapeHtml(message.content)}</p>`)
    .join("")}</body></html>`;

  return prisma.transcripts.create({
    data: {
      ticketId: ticket.ticketId,
      guildId: ticket.guildId,
      htmlContent,
      textContent,
      messageCount: ordered.length,
      attachmentLinks
    }
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function createReadablePanelId(name: string) {
  const base = panelKeyFromName(name);
  let candidate = base;
  let suffix = 2;

  while (await prisma.ticketPanel.findUnique({ where: { panelId: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
