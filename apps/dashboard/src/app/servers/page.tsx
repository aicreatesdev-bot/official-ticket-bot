"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Server } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/Shell";

type Guild = {
  id: string;
  name: string;
  icon: string | null;
  role: string;
};

export default function ServersPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ guilds: Guild[] }>("/guilds")
      .then((data) => setGuilds(data.guilds))
      .catch((err) => {
        if (err instanceof Error && err.message.includes("authenticated")) window.location.href = "/login";
        else setError(err instanceof Error ? err.message : "Could not load servers");
      });
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-4 sm:p-8">
      <PageHeader title="Select Server" description="Servers shown here are ones you own, can manage, or are trusted to configure." />
      {error ? <p className="mb-4 rounded-md bg-red-500/15 p-3 text-sm text-red-200">{error}</p> : null}
      {guilds.length === 0 ? (
        <EmptyState title="No manageable servers found" description="Invite Rose Ticket or ask the server owner to configure your trusted admin role." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild) => (
            <Link key={guild.id} href={`/guilds/${guild.id}/overview`} className="glass group p-5 transition hover:-translate-y-0.5 hover:bg-white/10">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                <Server className="text-violet-300" />
              </div>
              <h2 className="text-lg font-semibold">{guild.name}</h2>
              <p className="mt-1 text-sm capitalize text-slate-400">{guild.role.replace("_", " ")}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
