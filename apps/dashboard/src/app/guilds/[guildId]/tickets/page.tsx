"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/Shell";

type Ticket = {
  ticketId: string;
  publicId: number;
  creatorId: string;
  threadId: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  claimedBy: string | null;
  createdAt: string;
  closedAt: string | null;
};

export default function LiveTicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [message, setMessage] = useState("");

  async function load() {
    const query = new URLSearchParams({ status, priority });
    const data = await api<{ tickets: Ticket[] }>(`/guilds/${guildId}/tickets?${query.toString()}`);
    setTickets(data.tickets);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load tickets"));
  }, [guildId, status, priority]);

  async function closeTicket(ticketId: string) {
    const reason = window.prompt("Close reason", "Closed from dashboard") ?? "Closed from dashboard";
    await api(`/tickets/${ticketId}/close`, { method: "POST", body: JSON.stringify({ reason }) });
    setMessage("Ticket closed.");
    await load();
  }

  async function renameTicket(ticketId: string) {
    const title = window.prompt("New ticket name");
    if (!title) return;
    await api(`/tickets/${ticketId}/rename`, { method: "POST", body: JSON.stringify({ title }) });
    setMessage("Ticket renamed.");
    await load();
  }

  async function updatePriority(ticketId: string, nextPriority: string) {
    await api(`/tickets/${ticketId}/priority`, { method: "POST", body: JSON.stringify({ priority: nextPriority }) });
    setMessage("Priority updated.");
    await load();
  }

  return (
    <>
      <PageHeader title="Live Tickets" description="Filter active and closed tickets, jump to threads, and handle common staff actions." />
      {message ? <p className="mb-4 rounded-md bg-white/10 p-3 text-sm text-slate-200">{message}</p> : null}
      <div className="mb-4 flex flex-wrap gap-3">
        <select className="input max-w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="claimed">Claimed</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input max-w-48" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      {tickets.length === 0 ? (
        <EmptyState title="No tickets found" description="Try another filter or create a ticket from a Discord panel." />
      ) : (
        <div className="grid gap-3">
          {tickets.map((ticket) => (
            <article key={ticket.ticketId} className="glass p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    #{ticket.publicId} {ticket.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {ticket.category} - {ticket.status} - {ticket.priority}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Creator: {ticket.creatorId} - Claimed: {ticket.claimedBy ?? "Unclaimed"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="button-secondary" href={`https://discord.com/channels/${guildId}/${ticket.threadId}`} target="_blank">
                    Thread
                  </a>
                  <button className="button-secondary" onClick={() => renameTicket(ticket.ticketId).catch((err) => setMessage(String(err)))}>
                    Rename
                  </button>
                  <select className="input max-w-32" value={ticket.priority} onChange={(event) => updatePriority(ticket.ticketId, event.target.value).catch((err) => setMessage(String(err)))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  {ticket.status !== "closed" ? (
                    <button className="button-secondary text-red-200" onClick={() => closeTicket(ticket.ticketId).catch((err) => setMessage(String(err)))}>
                      Close
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
