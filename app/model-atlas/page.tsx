import type { Metadata } from "next";

import { readDisplaySnapshotPayload } from "../api/llm-stats/snapshot-store";
import { ModelGraphLab } from "./modelGraphLab";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
	title: "Model Atlas",
	description:
		"Model capability, cost, speed, context, and reliability graphs.",
};

export default async function ModelAtlasPage() {
	const payload = await readDisplaySnapshotPayload();
	return <ModelGraphLab initialPayload={payload} />;
}
