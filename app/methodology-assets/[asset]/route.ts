/** Serve the small methodology SVG set from its documentation-owned source directory. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";

import {
	isMethodologyAsset,
	METHODOLOGY_ASSET_NAMES,
} from "../../methodology/documents";

export function generateStaticParams() {
	return METHODOLOGY_ASSET_NAMES.map((asset) => ({ asset }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ asset: string }> },
) {
	const { asset } = await params;
	if (!isMethodologyAsset(asset)) {
		notFound();
	}
	const source = await readFile(
		join(process.cwd(), "docs", "assets", "methodology", asset),
	);
	return new Response(source, {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			"Content-Type": "image/svg+xml",
		},
	});
}
