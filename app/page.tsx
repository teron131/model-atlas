/** The dashboard at the page's top. */

import { DashboardPage } from "./dashboard/DashboardPage";

export const runtime = "nodejs";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <DashboardPage section={null} searchParams={searchParams} />;
}
