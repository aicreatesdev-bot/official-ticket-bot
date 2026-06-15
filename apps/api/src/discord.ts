import { env } from "./env.js";

const discordApi = "https://discord.com/api/v10";

export type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI
  });

  return discordFetch<DiscordTokenResponse>("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    auth: "none"
  });
}

export async function getCurrentUser(accessToken: string) {
  return discordFetch<{ id: string; username: string; avatar: string | null; discriminator?: string }>("/users/@me", {
    userToken: accessToken
  });
}

export async function getCurrentUserGuilds(accessToken: string) {
  return discordFetch<Array<{ id: string; name: string; icon: string | null; owner: boolean; permissions: string }>>(
    "/users/@me/guilds",
    { userToken: accessToken }
  );
}

export async function getBotGuild(guildId: string) {
  return discordFetch<{ id: string; name: string; owner_id: string; icon: string | null }>(`/guilds/${guildId}`);
}

export async function getGuildMember(guildId: string, userId: string) {
  return discordFetch<{ user?: { id: string }; roles: string[]; permissions?: string }>(`/guilds/${guildId}/members/${userId}`);
}

export async function getGuildRoles(guildId: string) {
  return discordFetch<Array<{ id: string; name: string; color: number; position: number; managed: boolean }>>(`/guilds/${guildId}/roles`);
}

export async function getGuildChannels(guildId: string) {
  return discordFetch<
    Array<{ id: string; name: string; type: number; parent_id?: string | null; position: number; permission_overwrites?: unknown[] }>
  >(`/guilds/${guildId}/channels`);
}

export async function sendPanelMessage(channelId: string, payload: unknown) {
  return discordFetch<{ id: string; channel_id: string }>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function sendThreadMessage(threadId: string, payload: unknown) {
  return discordFetch<{ id: string }>(`/channels/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function patchChannel(channelId: string, payload: unknown) {
  return discordFetch(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function fetchMessages(channelId: string, limit = 100) {
  return discordFetch<
    Array<{
      id: string;
      timestamp: string;
      content: string;
      author: { id: string; username: string; discriminator?: string };
      attachments: Array<{ url: string; filename: string }>;
    }>
  >(`/channels/${channelId}/messages?limit=${limit}`);
}

async function discordFetch<T>(
  path: string,
  options: RequestInit & { userToken?: string; auth?: "bot" | "none" } = {}
) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.userToken) headers.set("Authorization", `Bearer ${options.userToken}`);
  else if (options.auth !== "none") headers.set("Authorization", `Bot ${env.DISCORD_BOT_TOKEN}`);

  const response = await fetch(path.startsWith("http") ? path : `${discordApi}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord API ${response.status}: ${text}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
