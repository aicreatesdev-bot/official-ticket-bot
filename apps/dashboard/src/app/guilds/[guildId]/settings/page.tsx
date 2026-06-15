"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Shell";

type Settings = {
  logChannelId: string | null;
  transcriptChannelId: string | null;
  maxOpenTickets: number;
  ticketCooldown: number;
  autoCloseEnabled: boolean;
  autoCloseTime: number;
  dmTranscriptOnClose: boolean;
  brandName: string;
  brandColor: string;
  trustedAdminRoles: string[];
  staffRoles: string[];
  managerRoles: string[];
  allowedCreateRoles: string[];
  blockedCreateRoles: string[];
  managePanelRoles: string[];
  manageTicketRoles: string[];
};

type Channel = { id: string; name: string };

export default function SettingsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [settingsData, discordData] = await Promise.all([
      api<{ settings: Settings }>(`/guilds/${guildId}/settings`),
      api<{ channels: Channel[] }>(`/guilds/${guildId}/discord/roles-channels`)
    ]);
    setSettings(settingsData.settings);
    setChannels(discordData.channels);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load settings"));
  }, [guildId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);
    await api(`/guilds/${guildId}/settings`, {
      method: "PUT",
      body: JSON.stringify({
        ...settings,
        logChannelId: form.get("logChannelId") || null,
        transcriptChannelId: form.get("transcriptChannelId") || null,
        maxOpenTickets: Number(form.get("maxOpenTickets")),
        ticketCooldown: Number(form.get("ticketCooldown")),
        autoCloseEnabled: form.get("autoCloseEnabled") === "on",
        autoCloseTime: Number(form.get("autoCloseHours")) * 60 * 60,
        dmTranscriptOnClose: form.get("dmTranscriptOnClose") === "on",
        brandName: form.get("brandName"),
        brandColor: form.get("brandColor")
      })
    });
    setMessage("Settings saved.");
    await load();
  }

  if (!settings) return <PageHeader title="Settings" description="Loading settings..." />;

  return (
    <>
      <PageHeader title="Settings" description="Configure pending logs, closed-ticket logs, ticket limits, auto-close, and branding." />
      {message ? <p className="mb-4 rounded-md bg-white/10 p-3 text-sm text-slate-200">{message}</p> : null}
      <form onSubmit={save} className="glass grid gap-4 p-5 lg:grid-cols-2">
        <label>
          <span className="label">Pending ticket log channel</span>
          <select name="logChannelId" className="input" defaultValue={settings.logChannelId ?? ""}>
            <option value="">None</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Closed ticket log / transcript channel</span>
          <select name="transcriptChannelId" className="input" defaultValue={settings.transcriptChannelId ?? ""}>
            <option value="">None</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Max open tickets per user</span>
          <input name="maxOpenTickets" type="number" min={1} max={50} className="input" defaultValue={settings.maxOpenTickets} />
        </label>
        <label>
          <span className="label">Ticket cooldown seconds</span>
          <input name="ticketCooldown" type="number" min={0} className="input" defaultValue={settings.ticketCooldown} />
        </label>
        <label>
          <span className="label">Auto-close hours</span>
          <input name="autoCloseHours" type="number" min={1} className="input" defaultValue={Math.round(settings.autoCloseTime / 3600)} />
        </label>
        <label>
          <span className="label">Brand name</span>
          <input name="brandName" className="input" defaultValue={settings.brandName} />
        </label>
        <label>
          <span className="label">Brand color</span>
          <input name="brandColor" className="input" defaultValue={settings.brandColor} />
        </label>
        <div className="grid gap-3 rounded-lg border border-white/10 p-4 lg:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input name="autoCloseEnabled" type="checkbox" defaultChecked={settings.autoCloseEnabled} />
            Enable inactive ticket auto-close
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input name="dmTranscriptOnClose" type="checkbox" defaultChecked={settings.dmTranscriptOnClose} />
            DM transcript to creator on close
          </label>
        </div>
        <button className="button lg:col-span-2">Save Settings</button>
      </form>
    </>
  );
}
