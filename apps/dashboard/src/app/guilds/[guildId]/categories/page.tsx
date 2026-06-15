"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/Shell";

type Panel = {
  panelId: string;
  name: string;
  options: Option[];
};

type Option = {
  optionId: string;
  label: string;
  categoryKey: string;
  staffRoleIds: string[];
  parentChannelId: string;
  ticketNameFormat: string;
  priorityEnabled: boolean;
  pingStaff: boolean;
  claimMode: string;
};

type Role = { id: string; name: string };
type Channel = { id: string; name: string };

export default function CategoriesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [panelId, setPanelId] = useState("");
  const [message, setMessage] = useState("");
  const selected = useMemo(() => panels.find((panel) => panel.panelId === panelId), [panels, panelId]);

  async function load() {
    const [panelData, discordData] = await Promise.all([
      api<{ panels: Panel[] }>(`/guilds/${guildId}/panels`),
      api<{ roles: Role[]; channels: Channel[] }>(`/guilds/${guildId}/discord/roles-channels`)
    ]);
    setPanels(panelData.panels);
    setPanelId((current) => current || panelData.panels[0]?.panelId || "");
    setRoles(discordData.roles);
    setChannels(discordData.channels);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load categories"));
  }, [guildId]);

  async function createOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!panelId) return;
    const form = new FormData(event.currentTarget);
    await api(`/panels/${panelId}/options`, {
      method: "POST",
      body: JSON.stringify({
        label: form.get("label"),
        description: form.get("description") || null,
        emoji: form.get("emoji") || null,
        categoryKey: form.get("categoryKey"),
        staffRoleIds: [form.get("staffRoleId")],
        parentChannelId: form.get("parentChannelId"),
        ticketNameFormat: form.get("ticketNameFormat"),
        modalQuestions: [
          { id: "title", label: "Issue title", required: true, paragraph: false },
          { id: "description", label: "Problem description", required: true, paragraph: true },
          { id: "priority", label: "Priority: Low, Medium, High, Urgent", required: true, paragraph: false },
          { id: "proof", label: "Proof/link/image note", required: false, paragraph: true }
        ],
        priorityEnabled: form.get("priorityEnabled") === "on",
        pingStaff: form.get("pingStaff") === "on",
        claimMode: form.get("claimMode")
      })
    });
    event.currentTarget.reset();
    setMessage("Category option created.");
    await load();
  }

  async function deleteOption(optionId: string) {
    if (!panelId) return;
    await api(`/panels/${panelId}/options/${optionId}`, { method: "DELETE" });
    setMessage("Category option deleted.");
    await load();
  }

  return (
    <>
      <PageHeader title="Ticket Categories" description="Configure dropdown options, role routing, claim mode, and ticket naming." />
      {message ? <p className="mb-4 rounded-md bg-white/10 p-3 text-sm text-slate-200">{message}</p> : null}
      <label className="mb-4 block max-w-xl">
        <span className="label">Panel</span>
        <select className="input" value={panelId} onChange={(event) => setPanelId(event.target.value)}>
          {panels.map((panel) => (
            <option key={panel.panelId} value={panel.panelId}>
              {panel.name}
            </option>
          ))}
        </select>
      </label>

      {!selected ? (
        <EmptyState title="Create a panel first" description="Categories belong to ticket panels." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <form onSubmit={createOption} className="glass grid gap-4 p-5">
            <h2 className="text-lg font-semibold">Create Option</h2>
            <label>
              <span className="label">Label</span>
              <input name="label" className="input" required placeholder="General Support" />
            </label>
            <label>
              <span className="label">Description</span>
              <input name="description" className="input" placeholder="Get help from staff" />
            </label>
            <label>
              <span className="label">Emoji</span>
              <input name="emoji" className="input" placeholder="ticket" />
            </label>
            <label>
              <span className="label">Category key</span>
              <input name="categoryKey" className="input" required placeholder="general_support" />
            </label>
            <label>
              <span className="label">Staff role</span>
              <select name="staffRoleId" className="input" required>
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Parent support channel</span>
              <select name="parentChannelId" className="input" required>
                <option value="">Select channel</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Ticket naming format</span>
              <input name="ticketNameFormat" className="input" defaultValue="{category}-{username}-{count}" />
            </label>
            <label>
              <span className="label">Claim mode</span>
              <select name="claimMode" className="input" defaultValue="open_claim">
                <option value="open_claim">Open Claim</option>
                <option value="read_only_claim">Read-only Claim</option>
                <option value="private_claim">Private Claim</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input name="priorityEnabled" type="checkbox" defaultChecked />
              Enable priority field
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input name="pingStaff" type="checkbox" defaultChecked />
              Ping staff role on open
            </label>
            <button className="button">Create Category</button>
          </form>

          <section className="glass p-5">
            <h2 className="mb-4 text-lg font-semibold">Options for {selected.name}</h2>
            <div className="grid gap-3">
              {selected.options.map((option) => (
                <article key={option.optionId} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{option.label}</h3>
                      <p className="text-sm text-slate-400">
                        {option.categoryKey} - {option.claimMode.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Name: {option.ticketNameFormat}</p>
                    </div>
                    <button className="button-secondary text-red-200" onClick={() => deleteOption(option.optionId).catch((err) => setMessage(String(err)))}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {selected.options.length === 0 ? <p className="text-sm text-slate-400">No options on this panel yet.</p> : null}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
