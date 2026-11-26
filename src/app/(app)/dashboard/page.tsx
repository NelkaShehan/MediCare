import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard-view";
import { getSession } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const data = await loadDashboard(user);
  return <DashboardView initialData={data} />;
}
