"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Shell";

type Overview = {
  total: number;
  open: number;
  claimed: number;
  closed: number;
  averageResponseSeconds: number;
  ticketsByCategory: Array<{ category: string; count: number }>;
};

export default function OverviewPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<{ total: number; open: number; claimed: number; closed: number; averageResponseSeconds: number; ticketsByCategory: Overview["ticketsByCategory"] }>(
      `/guilds/${guildId}/overview`
    ).then(setData);
  }, [guildId]);

  const stats = data
    ? [
        ["Total Tickets", data.total],
        ["Open Tickets", data.open],
        ["Claimed Tickets", data.claimed],
        ["Closed Tickets", data.closed],
        ["Avg Response", data.averageResponseSeconds ? `${Math.round(data.averageResponseSeconds / 60)}m` : "n/a"]
      ]
    : [];

  return (
    <>
      <PageHeader title="Overview" description="Server ticket health, response time, and category volume." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="glass p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <section className="glass mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold">Tickets by Category</h2>
        <div className="grid gap-3">
          {(data?.ticketsByCategory ?? []).map((item) => (
            <div key={item.category} className="flex items-center justify-between rounded-md bg-white/5 px-4 py-3">
              <span>{item.category}</span>
              <span className="font-semibold text-violet-200">{item.count}</span>
            </div>
          ))}
          {data?.ticketsByCategory.length === 0 ? <p className="text-sm text-slate-400">No ticket data yet.</p> : null}
        </div>
      </section>
    </>
  );
}
