import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../..", ".env")]) {
  if (existsSync(envPath)) dotenv.config({ path: envPath });
}

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  BOT_DEV_GUILD_ID: z.string().optional(),
  DISCORD_ENABLE_PRIVILEGED_INTENTS: z
    .preprocess((value) => value === "true" || value === "1" || value === true, z.boolean())
    .default(false),
  AUTO_CLOSE_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  TRANSCRIPT_MAX_MESSAGES: z.coerce.number().int().positive().default(5000)
});

export const env = envSchema.parse(process.env);
