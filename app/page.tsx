import { readDisplaySnapshotPayload } from "./api/llm-stats/snapshot-store";
import { Dashboard } from "./dashboard";

export const revalidate = 300;
export const runtime = "nodejs";

export default async function Home() {
	const initialPayload = await readDisplaySnapshotPayload();
	return <Dashboard initialPayload={initialPayload} />;
}
