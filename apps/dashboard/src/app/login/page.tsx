import { LifeBuoy } from "lucide-react";
import { loginUrl } from "@/lib/api";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="glass w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500">
            <LifeBuoy />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Rose Ticket</h1>
            <p className="text-sm text-slate-400">Premium Discord ticket dashboard</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-300">
          Sign in with Discord to manage ticket panels, live tickets, transcripts, roles, and server settings.
        </p>
        <a href={loginUrl()} className="button w-full">
          Login with Discord
        </a>
      </section>
    </main>
  );
}
