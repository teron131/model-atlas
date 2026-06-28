/** Route for GET /api/logos/[logo], returning one logo as a single-entry dictionary. */

import { providerAssets } from "../../../dashboard/shared/providerAssets.generated";
import { publicCacheHeaders } from "../../cache-headers";

export const revalidate = 86400;

const LOGO_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 3600,
	cdnMaxAgeSeconds: 86400,
	staleWhileRevalidateSeconds: 604800,
});

type LogoRouteContext = {
	params: Promise<{
		logo: string;
	}>;
};

export async function GET(_request: Request, { params }: LogoRouteContext) {
	const { logo } = await params;
	const requestedLogo = logoSlug(logo);
	const icon =
		providerAssets[requestedLogo as keyof typeof providerAssets]?.logo;
	if (icon == null) {
		return Response.json(
			{
				error: "Logo not found",
				logo: requestedLogo,
			},
			{
				status: 404,
				headers: LOGO_CACHE_HEADERS,
			},
		);
	}
	return Response.json(
		{ [requestedLogo]: icon },
		{ headers: LOGO_CACHE_HEADERS },
	);
}

function logoSlug(logo: string | null | undefined) {
	return String(logo ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
