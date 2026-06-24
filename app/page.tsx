/** Render the dashboard page with lean server-provided stats payloads. */

import { scoreJsonPayload } from "./api/llm-stats/public-json";
import { readDisplaySnapshotPayload } from "./api/llm-stats/snapshot-store";
import { Dashboard } from "./dashboard";
import { leanDashboardPayload } from "./dashboard/payload";

export const revalidate = 300;
export const runtime = "nodejs";
export const maxDuration = 300;

/** Render the home dashboard route with embedded score JSON and initial table data. */
export default async function Home() {
	const initialPayload = await readDisplaySnapshotPayload();
	const scorePayload =
		initialPayload == null ? null : scoreJsonPayload(initialPayload);
	const dashboardPayload =
		initialPayload == null ? null : leanDashboardPayload(initialPayload);
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
					{jsonScriptPayload(scorePayload)}
				</script>
			)}
			<Dashboard initialPayload={dashboardPayload} />
		</>
	);
}

/** Escape JSON for safe embedding inside an HTML script element. */
function jsonScriptPayload(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll(">", "\\u003e")
		.replaceAll("&", "\\u0026")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}
