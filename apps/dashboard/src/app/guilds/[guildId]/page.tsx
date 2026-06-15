import { redirect } from "next/navigation";

export default function GuildIndex({ params }: { params: { guildId: string } }) {
  redirect(`/guilds/${params.guildId}/overview`);
}
