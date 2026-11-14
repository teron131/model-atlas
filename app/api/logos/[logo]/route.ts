/** One provider's logo data URL under its normalized provider key; an unknown provider's 404 carries the same day-long cache headers. */

import { providerAssets } from "../../../../src/model-atlas/logos/provider-assets.generated";
import { providerAssetKey } from "../../../../src/model-atlas/logos/resolve";
import { LOGO_CACHE_HEADERS } from "../../cache-headers";

export const revalidate = 86400;

type LogoRouteContext = {
  params: Promise<{
    logo: string;
  }>;
};

export async function GET(_request: Request, { params }: LogoRouteContext) {
  const { logo } = await params;
  const requestedLogo = providerAssetKey(logo);
  const icon = providerAssets[requestedLogo as keyof typeof providerAssets]?.logo;
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
  return Response.json({ [requestedLogo]: icon }, { headers: LOGO_CACHE_HEADERS });
}
