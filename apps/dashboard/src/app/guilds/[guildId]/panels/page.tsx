"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/Shell";

type Panel = {
  panelId: string;
  name: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  channelId?: string;
  dropdownPlaceholder: string;
  isEnabled: boolean;
  options: unknown[];
};

type Channel = { id: string; name: string };

export default function PanelsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [panelData, discordData] = await Promise.all([
      api<{ panels: Panel[] }>(`/guilds/${guildId}/panels`),
      api<{ channels: Channel[] }>(`/guilds/${guildId}/discord/roles-channels`)
    ]);
    setPanels(panelData.panels);
    setChannels(discordData.channels);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load panels"));
  }, [guildId]);

  async function createPanel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/guilds/${guildId}/panels`, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        embedTitle: form.get("embedTitle"),
        embedDescription: form.get("embedDescription"),
        embedColor: form.get("embedColor"),
        channelId: form.get("channelId") || null,
        dropdownPlaceholder: form.get("dropdownPlaceholder") || "Select a ticket category",
        isEnabled: true
      })
    });
    event.currentTarget.reset();
    setMessage("Panel created.");
    await load();
  }

  async function sendPanel(panelId: string, channelId: string) {
    await api(`/panels/${panelId}/send`, { method: "POST", body: JSON.stringify({ channelId }) });
    setMessage("Panel sent to Discord.");
    await load();
  }

  async function deletePanel(panelId: string) {
    await api(`/panels/${panelId}`, { method: "DELETE" });
    setMessage("Panel deleted.");
    await load();
  }

  return (
    <>
      <PageHeader title="Panels" description="Create, preview, send, and reuse ticket panel embeds." />
      {message ? <p className="mb-4 rounded-md bg-white/10 p-3 text-sm text-slate-200">{message}</p> : null}
      <form onSubmit={createPanel} className="glass mb-6 grid gap-4 p-5 lg:grid-cols-2">
        <label>
          <span className="label">Panel name</span>
          <input name="name" className="input" required placeholder="Support Panel" />
        </label>
        <label>
          <span className="label">Embed title</span>
          <input name="embedTitle" className="input" required placeholder="Need help?" />
        </label>
        <label className="lg:col-span-2">
          <span className="label">Embed description</span>
          <textarea name="embedDescription" className="input min-h-24" required placeholder="Select an option below to open a private support thread." />
        </label>
        <label>
          <span className="label">Color</span>
          <input name="embedColor" className="input" defaultValue="#f174d2" />
        </label>
        <label>
          <span className="label">Send channel</span>
          <select name="channelId" className="input">
            <option value="">Choose later</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="label">Dropdown placeholder</span>
          <input name="dropdownPlaceholder" className="input" defaultValue="Select a ticket category" />
        </label>
        <button className="button lg:col-span-2">Create Panel</button>
      </form>

      {panels.length === 0 ? (
        <EmptyState title="No panels yet" description="Create your first panel, then add category options on the Categories page." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {panels.map((panel) => (
            <article key={panel.panelId} className="glass p-5">
              <div className="mb-4 rounded-lg border border-white/10 p-4" style={{ borderColor: panel.embedColor }}>
                <h2 className="text-xl font-semibold">{panel.embedTitle}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{panel.embedDescription}</p>
                <p className="mt-3 text-xs text-slate-500">{panel.dropdownPlaceholder}</p>
              </div>
              <p className="text-xs text-slate-400">ID: {panel.panelId}</p>
              <p className="mt-1 text-sm text-slate-300">{panel.options.length} option(s)</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <select className="input max-w-56" id={`send-${panel.panelId}`} defaultValue={panel.channelId ?? ""}>
                  <option value="">Select channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button-secondary"
                  onClick={() => {
                    const select = document.getElementById(`send-${panel.panelId}`) as HTMLSelectElement | null;
                    if (select?.value) sendPanel(panel.panelId, select.value).catch((err) => setMessage(String(err)));
                  }}
                >
                  Send
                </button>
                <button className="button-secondary" onClick={() => api(`/panels/${panel.panelId}/templates`, { method: "POST", body: JSON.stringify({}) }).then(() => setMessage("Template saved."))}>
                  Save Template
                </button>
                <button className="button-secondary text-red-200" onClick={() => deletePanel(panel.panelId).catch((err) => setMessage(String(err)))}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
