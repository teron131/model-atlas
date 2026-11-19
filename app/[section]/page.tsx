/** The dashboard opened at a section, `/duels`, as a link names it; any other path is not found. */

import { notFound } from "next/navigation";

import { DashboardPage } from "../dashboard/DashboardPage";
import { isDashboardSection } from "../dashboard/url-state";

export const runtime = "nodejs";

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (!isDashboardSection(section)) notFound();
  return <DashboardPage section={section} searchParams={searchParams} />;
}
