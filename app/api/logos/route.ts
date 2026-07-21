/** Route for GET /api/logos, returning the full provider-logo dictionary. */

import { providerAssets } from "../../dashboard/shared/provider-assets.generated";
import { publicCacheHeaders } from "../cache-headers";

export const revalidate = 86400;

const LOGO_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 3600,
	cdnMaxAgeSeconds: 86400,
	staleWhileRevalidateSeconds: 604800,
});

export function GET() {
	return Response.json(
		Object.fromEntries(
			Object.entries(providerAssets).map(([provider, asset]) => [
				provider,
				asset.logo,
			]),
		),
		{ headers: LOGO_CACHE_HEADERS },
	);
}
