import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { GroupWorkspace } from "@/components/group-workspace";

export default async function CompetitionPage({ params }: PageProps<"/competition/[competitionId]">) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect("/");
  const { competitionId } = await params;
  return <GroupWorkspace competitionId={competitionId} userName={session.user?.name ?? "Organizador"} />;
}
