# Deployment Guide

Rose Ticket targets VPS/Docker first.

## 1. Server Requirements

- Node.js 20+ if running outside Docker
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 15+ or Supabase Postgres
- A Discord application with bot and OAuth2 credentials

## 2. Environment

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `DISCORD_REDIRECT_URI`
- `SESSION_SECRET`
- `APP_URL`
- `API_URL`
- `NEXT_PUBLIC_API_URL`
- `CORS_ORIGIN`

Use a long random value for `SESSION_SECRET`.

## 3. Discord Developer Portal

Bot settings:

- Server Members Intent and Message Content Intent are optional by default.
- Enable both privileged intents only if you set `DISCORD_ENABLE_PRIVILEGED_INTENTS=true`.
- Message Content Intent is needed if you want full transcript message text from normal user messages.
- Add redirect URI matching `DISCORD_REDIRECT_URI`.

OAuth2 scopes:

- `identify`
- `guilds`

Bot invite scopes:

- `bot`
- `applications.commands`

## 4. Database

For local Docker Postgres:

```bash
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
```

For Supabase:

1. Create a Supabase project.
2. Copy the Postgres connection string.
3. Set `DATABASE_URL`.
4. Run `pnpm db:migrate`.

## 5. Slash Commands

Register commands after setting Discord env vars:

```bash
pnpm --filter @rose-ticket/bot commands:register
```

Use `BOT_DEV_GUILD_ID` during development for instant guild command registration. Remove it for global production registration.

## 6. Run With Docker Compose

```bash
docker compose up -d --build
```

Services:

- Dashboard: port `3000`
- API: port `4000`
- Bot: background worker
- Postgres: port `5432`

## 7. Deploy Bot On Railway

The repository includes `railway.json` for a Railway bot worker deploy. It uses:

```bash
pnpm railway:bot:build
pnpm railway:bot:start
```

Set Railway variables for `DATABASE_URL`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, and `BOT_DEV_GUILD_ID`, then deploy from GitHub. See [Railway deployment](railway.md).

## 8. Reverse Proxy

Put HTTPS in front of the dashboard and API.

Example public URLs:

- `APP_URL=https://tickets.example.com`
- `API_URL=https://tickets-api.example.com`
- `NEXT_PUBLIC_API_URL=https://tickets-api.example.com`
- `CORS_ORIGIN=https://tickets.example.com`
- `DISCORD_REDIRECT_URI=https://tickets-api.example.com/auth/callback`

Set `COOKIE_DOMAIN=.example.com` only if dashboard and API share a parent domain and you understand cookie scope.

## 9. Operational Checks

After deploy:

1. Open `/health` on the API.
2. Confirm dashboard login works.
3. Invite the bot with the documented permissions.
4. Run `/setup`.
5. Create and send a panel.
6. Open a test ticket.
7. Claim, rename, set priority, save transcript, and close.
8. Confirm transcript appears in the dashboard.

## 10. Updating

```bash
git pull
pnpm install
pnpm db:migrate
pnpm --filter @rose-ticket/bot commands:register
docker compose up -d --build
```
