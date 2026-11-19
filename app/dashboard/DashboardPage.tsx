/** The dashboard document for a request: the shell and the URL state its path and query select, with the API's dashboard view starting to download beside its scripts; the client draws from its stored copy or that cached response, and the page stays hidden until it has. */

import { cookies } from "next/headers";
import { preload } from "react-dom";

import { Dashboard } from ".";
import { DASHBOARD_PAYLOAD_PATH } from "./payload-cache";
import { type DashboardSection, GRAPH_VARIANTS_COOKIE } from "./url-state";
import { DashboardUrlProvider } from "./use-url-state";

export async function DashboardPage({
  section,
  searchParams,
}: {
  section: DashboardSection | null;
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
      <DashboardUrlProvider url={`/${section ?? ""}?${search}`}>
        <Dashboard
          initialShowReasoningVariants={savedPreferences.get(GRAPH_VARIANTS_COOKIE)?.value === "1"}
        />
      </DashboardUrlProvider>
    </>
  );
}
