# Discord Bot Invite Permission Guide

Use OAuth2 scopes:

- `bot`
- `applications.commands`

Recommended bot permissions:

- View Channels
- Send Messages
- Send Messages in Threads
- Create Private Threads
- Manage Threads
- Manage Channels
- Manage Messages
- Embed Links
- Attach Files
- Read Message History
- Use Slash Commands
- Mention Everyone, Users, and Roles only if your server wants staff role pings

Minimum practical permissions for private-thread tickets:

- View Channels
- Send Messages
- Send Messages in Threads
- Create Private Threads
- Manage Threads
- Embed Links
- Attach Files
- Read Message History

Invite URL template:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=397553948752&scope=bot%20applications.commands
```

After inviting:

1. Run `/setup`.
2. Assign trusted admin, staff, and manager roles.
3. Create a panel with `/panel create` or the dashboard.
4. Send the panel with `/panel send` or from the dashboard.

Notes:

- Private threads cannot grant access to an entire role directly. Rose Ticket invites cached/fetched members with configured staff roles and also pings the staff role.
- For best staff invitation behavior, enable the Server Members intent for the bot in the Discord Developer Portal.
- For read-only claim mode, Rose Ticket enforces replies at message time because Discord threads do not provide per-thread per-user write permissions.
