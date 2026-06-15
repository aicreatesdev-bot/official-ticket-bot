import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var roseTicketPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.roseTicketPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.roseTicketPrisma = prisma;
}

export * from "@prisma/client";
