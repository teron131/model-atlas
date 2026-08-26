/** Render the dashboard as a static shell whose payload comes from the CDN-cached public API. */

import { Dashboard } from "./dashboard";

export default function Home() {
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
      <Dashboard initialPayload={null} />
    </>
  );
}
