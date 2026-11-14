/** Public API cache headers and conditional-request validators for Model Atlas. */

/** The published payload and its change history are replaced together, so both share one freshness policy. */
export const SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
  browserMaxAgeSeconds: 60,
  cdnMaxAgeSeconds: 300,
  staleWhileRevalidateSeconds: 3600,
});

export const LOGO_CACHE_HEADERS = publicCacheHeaders({
  browserMaxAgeSeconds: 3600,
  cdnMaxAgeSeconds: 86400,
  staleWhileRevalidateSeconds: 604800,
});

/** Responses that must reach the origin every time: error replies and community data that changes on submission. */
export const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/** GET validators accept weak tags, lists, and the wildcard without changing the representation's own ETag. */
export function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  const value = etag.replace(/^W\//, "");
  return (
    ifNoneMatch?.split(",").some((tag) => {
      const candidate = tag.trim();
      return candidate === "*" || candidate.replace(/^W\//, "") === value;
    }) ?? false
  );
}

function publicCacheHeaders({
  browserMaxAgeSeconds,
  cdnMaxAgeSeconds,
  staleWhileRevalidateSeconds,
}: {
  browserMaxAgeSeconds: number;
  cdnMaxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
}): HeadersInit {
  const cdnCacheControl = `public, s-maxage=${cdnMaxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
  return {
    "Cache-Control": `public, max-age=${browserMaxAgeSeconds}`,
    "CDN-Cache-Control": cdnCacheControl,
    "Vercel-CDN-Cache-Control": cdnCacheControl,
  };
}
