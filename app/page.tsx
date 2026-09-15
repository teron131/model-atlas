/** Render the complete cached dashboard immediately; the client refreshes its snapshot in the background. */

import { cookies } from "next/headers";

import { readDisplaySnapshotPayload } from "../src/model-atlas/database/runtime-snapshot";
import { Dashboard } from "./dashboard";
import { GRAPH_VARIANTS_COOKIE } from "./dashboard/url-state";
import { DashboardUrlProvider } from "./dashboard/use-url-state";

export const runtime = "nodejs";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [initialPayload, selections, savedPreferences] = await Promise.all([
    readDisplaySnapshotPayload(),
    searchParams,
    cookies(),
  ]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(selections)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
      search.append(key, item);
    }
  }
  return (
    <>
      <link rel="alternate" type="application/json" title="Model Atlas scores" href="/score" />
      <link rel="alternate" type="application/json" title="Model Atlas core table" href="/core" />
      <link
        rel="alternate"
        type="application/json"
        title="Model Atlas benchmarks"
        href="/benchmarks"
      />
      <DashboardUrlProvider search={search.toString()}>
        <Dashboard
          initialPayload={initialPayload}
          initialShowReasoningVariants={savedPreferences.get(GRAPH_VARIANTS_COOKIE)?.value === "1"}
        />
      </DashboardUrlProvider>
    </>
  );
}
