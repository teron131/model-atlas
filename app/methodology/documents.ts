/** Document registry, headings, and local link rules for the methodology surface. */

export const DOCUMENTS = [
	{
		slug: "methodology",
		title: "Methodology",
		description:
			"Scoring, calibration, missing evidence, and publication gates.",
	},
	{
		slug: "benchmarks",
		title: "Benchmarks",
		description: "Selected benchmark portfolio and source-specific policies.",
	},
	{
		slug: "standards",
		title: "Standards",
		description: "Admission criteria for trustworthy benchmark evidence.",
	},
	{
		slug: "matching",
		title: "Matching",
		description: "Model identity, source rows, and reasoning-effort matching.",
	},
] as const;

export type DocumentSlug = (typeof DOCUMENTS)[number]["slug"];

export type TableOfContentsItem = {
	id: string;
	label: string;
	level: 2 | 3;
};

export const METHODOLOGY_ASSETS = {
	"coverage-confidence.svg": { width: 720, height: 420 },
	"elo-transform.svg": { width: 720, height: 420 },
	"logit-quality.svg": { width: 720, height: 520 },
	"quantile-imputation.svg": { width: 720, height: 420 },
	"resource-residual.svg": { width: 720, height: 420 },
	"resource-score-mapping.svg": { width: 720, height: 600 },
	"source-crosswalk.svg": { width: 720, height: 420 },
} as const;

type MethodologyAsset = keyof typeof METHODOLOGY_ASSETS;

export const METHODOLOGY_ASSET_NAMES = Object.keys(
	METHODOLOGY_ASSETS,
) as MethodologyAsset[];

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
	return asset != null && isMethodologyAsset(asset)
		? `/methodology-assets/${asset}`
		: source;
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
