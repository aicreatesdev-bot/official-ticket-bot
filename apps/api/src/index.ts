import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { prisma } from "@rose-ticket/db";
import { env } from "./env.js";
import { createRouter } from "./routes.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(createRouter());

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", issues: error.issues });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("[Rose Ticket API]", error);
  return res.status(500).json({ error: message });
});

const server = app.listen(env.API_PORT, () => {
  console.log(`[Rose Ticket API] Listening on http://localhost:${env.API_PORT}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
