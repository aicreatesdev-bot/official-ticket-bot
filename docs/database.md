# Database Schema

Rose Ticket uses Supabase/PostgreSQL with Prisma.

Main models:

- `GuildSettings`: guild-level roles, channels, limits, auto-close, and branding.
- `TicketPanel`: Discord panel embed and sent message metadata.
- `TicketPanelOption`: dropdown option routing, staff roles, parent support channel, modal questions, priority support, and claim mode.
- `PanelTemplate`: reusable saved panel definitions.
- `Ticket`: active and historical ticket state linked to Discord private threads.
- `Transcripts`: HTML/text transcript content and attachment links.
- `TicketEvent`: audit log for actions and failures.
- `GuildTicketCounter`: per-guild/per-category counters for names like `support-satyam-0001`.
- `TicketCooldown`: per-user cooldown tracking.

Run migrations:

```bash
pnpm db:migrate
```

Generate Prisma client:

```bash
pnpm db:generate
```
