"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { BarChart3, FileText, LifeBuoy, LogOut, PanelTop, Settings, Shield, Tags, Ticket } from "lucide-react";
import { api } from "@/lib/api";

const nav = [
  { href: "overview", label: "Overview", icon: BarChart3 },
  { href: "panels", label: "Panels", icon: PanelTop },
  { href: "categories", label: "Categories", icon: Tags },
  { href: "tickets", label: "Live Tickets", icon: Ticket },
  { href: "transcripts", label: "Transcripts", icon: FileText },
  { href: "roles", label: "Roles", icon: Shield },
  { href: "settings", label: "Settings", icon: Settings }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ guildId: string }>();
  const pathname = usePathname();
  const guildId = params.guildId;

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-white/10 bg-black/25 p-4 backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <Link href="/servers" className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500">
            <LifeBuoy size={22} />
          </span>
          <span>
            <span className="block text-lg font-bold">Rose Ticket</span>
            <span className="text-xs text-slate-400">Ticket control center</span>
          </span>
        </Link>
        <nav className="grid gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = `/guilds/${guildId}/${item.href}`;
            const active = pathname === href;
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-violet-500 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="mt-6 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-white/10 hover:text-white">
          <LogOut size={17} />
          Logout
        </button>
      </aside>
      <section className="flex-1 p-4 sm:p-6 lg:p-8">{children}</section>
    </main>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>
    </header>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}
