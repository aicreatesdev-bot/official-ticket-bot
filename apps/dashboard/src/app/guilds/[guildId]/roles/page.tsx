"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Shell";

type Settings = Record<string, string[] | string | number | boolean | null>;
type Role = { id: string; name: string };

const roleFields = [
  ["trustedAdminRoles", "Trusted admin roles"],
  ["staffRoles", "Staff roles"],
  ["managerRoles", "Manager roles"],
  ["allowedCreateRoles", "Roles allowed to create tickets"],
  ["blockedCreateRoles", "Roles blocked from creating tickets"],
  ["managePanelRoles", "Roles allowed to manage panels"],
  ["manageTicketRoles", "Roles allowed to manage tickets"]
] as const;

export default function RolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [settingsData, discordData] = await Promise.all([
      api<{ settings: Settings }>(`/guilds/${guildId}/settings`),
      api<{ roles: Role[] }>(`/guilds/${guildId}/discord/roles-channels`)
    ]);
    setSettings(settingsData.settings);
    setRoles(discordData.roles);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load roles"));
  }, [guildId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);
    const payload = { ...settings };
    for (const [field] of roleFields) {
      payload[field] = String(form.get(field) ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
    await api(`/guilds/${guildId}/settings`, { method: "PUT", body: JSON.stringify(payload) });
    setMessage("Role permissions saved.");
    await load();
  }

  return (
    <>
      <PageHeader title="Roles & Permissions" description="Configure trusted admins, staff, managers, creator allowlists, and blocklists." />
      {message ? <p className="mb-4 rounded-md bg-white/10 p-3 text-sm text-slate-200">{message}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <form onSubmit={save} className="glass grid gap-4 p-5">
          {roleFields.map(([field, label]) => (
            <label key={field}>
              <span className="label">{label}</span>
              <input className="input" name={field} defaultValue={Array.isArray(settings?.[field]) ? (settings?.[field] as string[]).join(",") : ""} placeholder="Comma-separated role IDs" />
            </label>
          ))}
          <button className="button">Save Roles</button>
        </form>
        <aside className="glass p-5">
          <h2 className="mb-3 text-lg font-semibold">Server Roles</h2>
          <div className="max-h-[680px] space-y-2 overflow-auto pr-2">
            {roles.map((role) => (
              <div key={role.id} className="rounded-md bg-white/5 p-3">
                <p className="font-medium">{role.name}</p>
                <p className="text-xs text-slate-500">{role.id}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
