import { Landing } from "@/components/Landing";
import { StudioApp } from "@/components/StudioApp";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();
  if (!user) return <Landing />;
  return <StudioApp />;
}
