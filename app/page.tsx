/** Render the dashboard shell and start downloading the API's dashboard view beside its scripts; the client draws from its stored copy or that cached response, and the page stays hidden until it has. */

import { cookies } from "next/headers";
import { preload } from "react-dom";

import { Dashboard } from "./dashboard";
import { DASHBOARD_PAYLOAD_PATH } from "./dashboard/payload-cache";
import { GRAPH_VARIANTS_COOKIE } from "./dashboard/url-state";
import { DashboardUrlProvider } from "./dashboard/use-url-state";

export const runtime = "nodejs";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [selections, savedPreferences] = await Promise.all([searchParams, cookies()]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(selections)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
      search.append(key, item);
    }
  }
  // The data stays out of this per-request document so the CDN and the browser can cache it; it is most of a first visit's download.
  preload(DASHBOARD_PAYLOAD_PATH, { as: "fetch", crossOrigin: "anonymous" });
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
          initialShowReasoningVariants={savedPreferences.get(GRAPH_VARIANTS_COOKIE)?.value === "1"}
        />
      </DashboardUrlProvider>
    </>
  );
}
