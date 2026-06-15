import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$queryRaw`select 1`;
  console.log("database ok");
} finally {
  await prisma.$disconnect();
}
