/** Render the dashboard page with compact server-provided stats payloads. */

import { readDisplaySnapshotPayload } from "../src/model-atlas/database/runtime-snapshot";
import { scoreJsonPayload } from "../src/model-atlas/stats/public-json";
import { Dashboard } from "./dashboard";
import { compactDashboardPayload } from "./dashboard/payload";

export const revalidate = 300;
export const runtime = "nodejs";
export const maxDuration = 300;

export default async function Home() {
	const initialPayload = await readDisplaySnapshotPayload();
	const scorePayload =
		initialPayload == null ? null : scoreJsonPayload(initialPayload);
	const dashboardPayload =
		initialPayload == null ? null : compactDashboardPayload(initialPayload);
	return (
		<>
			<link
				rel="alternate"
				type="application/json"
				title="Model Atlas scores"
				href="/score"
			/>
			<link
				rel="alternate"
				type="application/json"
				title="Model Atlas core table"
				href="/core"
			/>
			<link
				rel="alternate"
				type="application/json"
				title="Model Atlas benchmarks"
				href="/benchmarks"
			/>
			{scorePayload == null ? null : (
				<script id="model-atlas-score-json" type="application/json">
					{scriptJson(scorePayload)}
				</script>
			)}
			<Dashboard initialPayload={dashboardPayload} />
		</>
	);
}

/** Escape JSON for safe embedding inside an HTML script element. */
function scriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll(">", "\\u003e")
		.replaceAll("&", "\\u0026")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}
