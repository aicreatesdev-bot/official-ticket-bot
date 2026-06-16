# Rose Ticket

Rose Ticket is a production-oriented Discord ticket system inspired by Ticket King, focused only on ticket management. It uses private Discord threads, slash commands, persistent interaction handlers, transcripts, role-based permissions, and a Next.js dashboard.

## Stack

- Node.js 20+
- TypeScript
- discord.js v14
- Express.js dashboard API
- Next.js + Tailwind CSS dashboard
- Supabase/PostgreSQL with Prisma
- Discord OAuth2 dashboard login

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in Discord, database, API, and dashboard values in `.env`.

4. Start Postgres locally:

```bash
docker compose up -d postgres
```

5. Generate Prisma client and apply migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

6. Register slash commands:

```bash
pnpm --filter @rose-ticket/bot commands:register
```

7. Run the bot, API, and dashboard:

```bash
pnpm dev
```

Dashboard: `http://localhost:3000`

API: `http://localhost:4000`

## Project Structure

```text
apps/
  api/        Express API, Discord OAuth2, dashboard authorization
  bot/        Discord bot, commands, ticket interactions, workers
  dashboard/  Next.js dashboard
packages/
  db/         Prisma schema and database client
  shared/     Shared types, validators, constants, permission helpers
docs/
  invite-permissions.md
  deployment.md
  database.md
```

## Main Flow

1. Admin creates a panel with `/panel create` or the dashboard.
2. Admin sends the panel into a Discord channel.
3. User selects a dropdown option.
4. Bot opens a modal for issue details.
5. Bot creates a private thread under the configured support channel.
6. Staff can claim, transfer, rename, add/remove users, change priority, save transcript, and close.
7. On close, Rose Ticket saves the transcript to Postgres and posts it to the log/transcript channel.

## Docs

- [Invite permissions](docs/invite-permissions.md)
- [Deployment guide](docs/deployment.md)
- [Railway deployment](docs/railway.md)
- [Database schema](docs/database.md)
