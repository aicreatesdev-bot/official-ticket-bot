import { ActivityType, Client, GatewayIntentBits, Partials } from "discord.js";
import { prisma } from "@rose-ticket/db";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { registerInteractionHandlers } from "./interactions.js";
import { ensurePanelMessages } from "./panels.js";
import { ensureVisibleTicketControls, updateTicketActivity } from "./tickets.js";
import { startAutoCloseWorker } from "./worker.js";
import { sweepLocks } from "./locks.js";

logger.info("Starting Rose Ticket bot process.");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

registerInteractionHandlers(client);

client.once("ready", async () => {
  logger.info(`Logged in as ${client.user?.tag}.`);
  client.user?.setPresence({
    activities: [{ name: "private ticket threads", type: ActivityType.Watching }],
    status: "online"
  });

  const activeTickets = await prisma.ticket
    .count({ where: { status: { in: ["open", "claimed"] } } })
    .catch((error) => {
      logger.warn("Database restore check failed. The bot will stay online, but ticket actions need database access.", error);
      return null;
    });
  if (activeTickets !== null) {
    logger.info(`Restored ${activeTickets} active ticket record(s) from the database.`);
  }
  const repairedControls = await ensureVisibleTicketControls(client).catch((error) => {
    logger.warn("Failed to repair visible ticket controls.", error);
    return null;
  });
  if (repairedControls !== null) {
    logger.info(`Repaired ${repairedControls} visible ticket control message(s).`);
  }
  const repaintedPanels = await ensurePanelMessages(client).catch((error) => {
    logger.warn("Failed to repaint ticket panel messages.", error);
    return null;
  });
  if (repaintedPanels !== null) {
    logger.info(`Repainted ${repaintedPanels} ticket panel message(s).`);
  }
  startAutoCloseWorker(client);
  setInterval(sweepLocks, 30000);
});

client.on("messageCreate", (message) => {
  updateTicketActivity(message).catch((error) => logger.warn("Failed to update ticket activity.", error));
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  logger.info("Shutting down Rose Ticket bot.");
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

await client.login(env.DISCORD_BOT_TOKEN);
