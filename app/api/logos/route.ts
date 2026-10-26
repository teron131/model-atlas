/** Route for GET /api/logos, returning the full provider-logo dictionary. */

import { providerAssets } from "../../../src/model-atlas/logos/provider-assets.generated";
import { LOGO_CACHE_HEADERS } from "../cache-headers";

export const revalidate = 86400;

export function GET() {
  return Response.json(
    Object.fromEntries(
      Object.entries(providerAssets).map(([provider, asset]) => [provider, asset.logo]),
    ),
    { headers: LOGO_CACHE_HEADERS },
  );
}
