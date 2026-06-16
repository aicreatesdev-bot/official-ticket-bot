# Railway Deployment

This repository includes a root `railway.json` for deploying the Discord bot as a Railway worker service.

## What Railway Runs

Build command:

```bash
pnpm railway:bot:build
```

Start command:

```bash
pnpm railway:bot:start
```

Pre-deploy command:

```bash
pnpm railway:bot:predeploy
```

The start command runs the bot in the foreground. Do not use `scripts/launch-bot.mjs` on Railway because that script is only for local desktop use and detaches the bot process.

## Required Variables

Set these Railway service variables:

```text
DATABASE_URL=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
BOT_DEV_GUILD_ID=
AUTO_CLOSE_INTERVAL_MS=300000
TRANSCRIPT_MAX_MESSAGES=5000
NODE_ENV=production
```

`BOT_DEV_GUILD_ID` is recommended for this server because it registers commands instantly for the configured guild. Remove it only when you want global command registration.

If your database password contains special characters such as `@`, encode them in `DATABASE_URL`. For example, `@` becomes `%40`.

For Supabase on Railway, use Supabase's **Session pooler** connection string instead of the direct `db.<project>.supabase.co:5432` string. Supabase direct connections are IPv6 unless the project has the IPv4 add-on, while the shared pooler is IPv4-compatible.

Use the connection string from:

```text
Supabase Dashboard -> Connect -> Session pooler
```

It looks like this:

```text
DATABASE_URL=postgresql://postgres.<project-ref>:<encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=20
```

Do not use the Transaction pooler on port `6543` for Prisma schema sync unless you know what you are doing, because transaction pooling does not support prepared statements.

Keep the real value in Railway variables only. Do not commit secrets.

## First Deploy

1. Create a new Railway project.
2. Add a service from your GitHub repository.
3. Add the variables above.
4. Deploy the service.
5. After deploy, run command registration once from Railway shell or locally with Railway variables:

```bash
pnpm railway:bot:commands
```

Railway runs the schema sync before each deploy through `preDeployCommand`:

```bash
pnpm railway:bot:predeploy
```

If this command fails, the bot should not start because commands would fail without the database schema. Fix `DATABASE_URL`, redeploy, and then check the logs again.

## Expected Logs

Healthy startup logs look like:

```text
[Rose Ticket] Starting Rose Ticket bot process.
[Rose Ticket] Logged in as ...
[Rose Ticket] Restored 0 active ticket record(s) from the database.
[Rose Ticket] Repaired 0 visible ticket control message(s).
[Rose Ticket] Repainted 1 ticket panel message(s).
```

## API And Dashboard

This `railway.json` is for the bot worker. If you later deploy the API and dashboard on Railway, create separate services and override their commands:

API:

```bash
pnpm --filter @rose-ticket/shared build && pnpm --filter @rose-ticket/db build && pnpm --filter @rose-ticket/api build
pnpm --filter @rose-ticket/api start
```

Dashboard:

```bash
pnpm --filter @rose-ticket/shared build && pnpm --filter @rose-ticket/dashboard build
pnpm --filter @rose-ticket/dashboard start
```
