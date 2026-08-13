/** Document registry, headings, and local link rules for the methodology surface. */

export const DOCUMENTS = [
  {
    slug: "methodology",
    title: "Methodology",
    description:
      "How Model Atlas scores models, handles missing evidence, and admits public results.",
  },
  {
    slug: "benchmarks",
    title: "Benchmarks",
    description: "Selected benchmarks, capability roles, weights, and source policy.",
  },
  {
    slug: "standards",
    title: "Standards",
    description: "How benchmarks are admitted, reviewed, retained, or rejected.",
  },
  {
    slug: "matching",
    title: "Matching",
    description: "How source rows map to model identities and reasoning-effort variants.",
  },
] as const;

export type DocumentSlug = (typeof DOCUMENTS)[number]["slug"];

export type TableOfContentsItem = {
  id: string;
  label: string;
  level: 2 | 3;
};

export const METHODOLOGY_ASSETS = {
  "confidence.svg": { width: 720, height: 360 },
  "elo-transform.svg": { width: 720, height: 420 },
  "final-score-assembly.svg": { width: 720, height: 500 },
  "logit-quality.svg": { width: 720, height: 520 },
  "model-balanced-weight.svg": { width: 720, height: 350 },
  "pipeline-overview.svg": { width: 720, height: 420 },
  "quantile-imputation.svg": { width: 720, height: 420 },
  "resource-residual.svg": { width: 720, height: 420 },
  "resource-score-mapping.svg": { width: 720, height: 600 },
  "sibling-resource-imputation.svg": { width: 720, height: 410 },
  "source-crosswalk.svg": { width: 720, height: 420 },
  "sparse-effort-calibration.svg": { width: 720, height: 420 },
} as const;

type MethodologyAsset = keyof typeof METHODOLOGY_ASSETS;

export const METHODOLOGY_ASSET_NAMES = Object.keys(METHODOLOGY_ASSETS) as MethodologyAsset[];

export function isDocumentSlug(value: string): value is DocumentSlug {
  return DOCUMENTS.some((document) => document.slug === value);
}

export function isMethodologyAsset(value: string): value is MethodologyAsset {
  return Object.hasOwn(METHODOLOGY_ASSETS, value);
}

export function documentHref(slug: DocumentSlug): string {
  return slug === "methodology" ? "/methodology" : `/methodology/${slug}`;
}

/** Extract the two heading levels used by the sticky on-page outline. */
export function tableOfContents(markdown: string): TableOfContentsItem[] {
  return markdown.split("\n").flatMap((line): TableOfContentsItem[] => {
    const match = /^(##|###) (.+)$/.exec(line);
    if (match == null) {
      return [];
    }
    const heading = match[2];
    if (heading == null) {
      return [];
    }
    const label = heading.replaceAll(/[`*_]/g, "").trim();
    return [
      {
        id: headingId(label),
        label,
        level: match[1] === "##" ? 2 : 3,
      },
    ];
  });
}

export function headingId(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
}

/** Map repository-relative Markdown links onto public document routes. */
export function documentLink(href: string): string {
  if (href.startsWith("#")) {
    return href;
  }
  const match = /^([a-z-]+)\.md(#[a-z0-9-]+)?$/.exec(href);
  const slug = match?.[1];
  if (slug == null || !isDocumentSlug(slug)) {
    return href;
  }
  return `${documentHref(slug)}${match?.[2] ?? ""}`;
}

/** Map methodology diagram paths onto the static asset endpoint. */
export function documentImageSource(source: string): string {
  const match = /^assets\/methodology\/([a-z0-9-]+\.svg)$/.exec(source);
  const asset = match?.[1];
  return asset != null && isMethodologyAsset(asset) ? `/methodology-assets/${asset}` : source;
}

export function documentImageSize(source: string): {
  width: number;
  height: number;
} {
  const asset = source.split("/").at(-1);
  return asset != null && isMethodologyAsset(asset)
    ? METHODOLOGY_ASSETS[asset]
    : { width: 720, height: 420 };
}
