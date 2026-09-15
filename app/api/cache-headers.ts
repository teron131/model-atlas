/** Public API cache headers and conditional-request validators for Model Atlas. */
type PublicCacheHeaderOptions = {
  browserMaxAgeSeconds: number;
  cdnMaxAgeSeconds?: number;
  staleWhileRevalidateSeconds?: number;
  contentType?: string;
};

export function publicCacheHeaders({
  browserMaxAgeSeconds,
  cdnMaxAgeSeconds,
  staleWhileRevalidateSeconds,
  contentType,
}: PublicCacheHeaderOptions): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${browserMaxAgeSeconds}`,
  };
  if (cdnMaxAgeSeconds != null) {
    const cdnCacheControl = [
      `public, s-maxage=${cdnMaxAgeSeconds}`,
      staleWhileRevalidateSeconds == null
        ? null
        : `stale-while-revalidate=${staleWhileRevalidateSeconds}`,
    ]
      .filter((part): part is string => part != null)
      .join(", ");
    headers["CDN-Cache-Control"] = cdnCacheControl;
    headers["Vercel-CDN-Cache-Control"] = cdnCacheControl;
  }
  if (contentType != null) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

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
