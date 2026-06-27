/** Shared model alias rules for OpenRouter identity and public display cleanup. */

import { normalizeProviderModelId } from "../shared";

export const OPENROUTER_FREE_ROUTE_SUFFIX = ":free";

const EPHEMERAL_SUFFIXES = ["-adaptive"] as const;
const REASONING_EFFORT_SUFFIXES = [
	"-reasoning-xhigh",
	"-xhigh",
	"-reasoning-high",
	"-high",
	"-reasoning-medium",
	"-medium",
	"-reasoning-low",
	"-low",
	"-reasoning-minimal",
	"-minimal",
	"-reasoning",
	"-non-reasoning",
] as const;
const CATALOG_ALIAS_SUFFIXES = [
	...EPHEMERAL_SUFFIXES,
	"-fast",
	"-non-reasoning-low-effort",
	...REASONING_EFFORT_SUFFIXES,
] as const;
const CATALOG_ALIAS_STRIP_SUFFIXES = [...CATALOG_ALIAS_SUFFIXES].sort(
	(left, right) => right.length - left.length,
);
const DATED_PREVIEW_ROUTE_PATTERN = /^(.+)-preview-\d{2}-(?:\d{2}|\d{4})$/;

/** Removes dated and preview suffixes from OpenRouter model names. */
function stripOpenRouterVersionSuffix(modelName: string): string {
	return modelName
		.replace(/-(?:preview|beta|experimental)(?:-\d{2,4}(?:-\d{2,4})*)?$/i, "")
		.replace(/-\d{8}$/i, "")
		.replace(/-\d{4}-\d{2}-\d{2}$/i, "")
		.replace(/-\d{2}-\d{2}$/i, "")
		.replace(/-\d{2}-\d{4}$/i, "");
}

/** Checks whether OpenRouter version suffix for model alias normalization. */
function isOpenRouterVersionSuffix(value: string): boolean {
	return (
		/^(?:preview|beta|experimental)(?:-\d{2,4}(?:-\d{2,4})*)?$/i.test(value) ||
		/^\d{8}$/i.test(value) ||
		/^\d{4}-\d{2}-\d{2}$/i.test(value) ||
		/^\d{2}-\d{2}$/i.test(value) ||
		/^\d{2}-\d{4}$/i.test(value)
	);
}

/** Splits provider/model routes into normalized comparison parts. */
function openRouterRouteParts(route: string): [string, string] | null {
	const [provider, modelName = ""] = route.toLowerCase().split("/", 2);
	return provider && modelName ? [provider, modelName] : null;
}

/** Checks whether same OpenRouter model version for model alias normalization. */
function isSameOpenRouterModelVersion(
	targetModelName: string,
	candidateModelName: string,
): boolean {
	const targetBase = stripOpenRouterVersionSuffix(targetModelName);
	const candidateBase = stripOpenRouterVersionSuffix(candidateModelName);
	if (candidateBase !== targetBase) {
		return false;
	}
	if (candidateModelName === targetBase) {
		return true;
	}
	const suffix = candidateModelName.slice(targetBase.length + 1);
	return (
		candidateModelName.startsWith(`${targetBase}-`) &&
		isOpenRouterVersionSuffix(suffix)
	);
}

/** Checks whether same OpenRouter model route for model alias normalization. */
export function isSameOpenRouterModelRoute(
	targetRoute: string,
	candidateRoute: string,
): boolean {
	const targetParts = openRouterRouteParts(targetRoute);
	const candidateParts = openRouterRouteParts(candidateRoute);
	return (
		targetParts != null &&
		candidateParts != null &&
		targetParts[0] === candidateParts[0] &&
		isSameOpenRouterModelVersion(targetParts[1], candidateParts[1])
	);
}

/** Removes catalog-only effort and alias suffixes before matching. */
export function stripCatalogAliasSuffixes(value: string): string {
	let normalized = value.replace(/-\d{8}$/, "");
	for (const suffix of CATALOG_ALIAS_STRIP_SUFFIXES) {
		if (normalized.endsWith(suffix)) {
			normalized = normalized.slice(0, -suffix.length);
			break;
		}
	}
	return normalized;
}

/** Ranks Artificial Analysis aliases by reasoning-effort specificity. */
export function reasoningEffortPriority(
	artificialAnalysisSlug: string | null,
	canonicalSlug: string | null,
): number {
	if (artificialAnalysisSlug == null || canonicalSlug == null) {
		return 0;
	}
	const normalizedArtificialAnalysisSlug = normalizeProviderModelId(
		artificialAnalysisSlug,
	);
	const normalizedCanonicalSlug = normalizeProviderModelId(canonicalSlug);
	for (const suffix of EPHEMERAL_SUFFIXES) {
		if (
			normalizedArtificialAnalysisSlug === `${normalizedCanonicalSlug}${suffix}`
		) {
			return 6;
		}
	}
	if (normalizedArtificialAnalysisSlug === normalizedCanonicalSlug) {
		return REASONING_EFFORT_SUFFIXES.length + 1;
	}
	for (const [index, suffix] of REASONING_EFFORT_SUFFIXES.entries()) {
		if (
			normalizedArtificialAnalysisSlug === `${normalizedCanonicalSlug}${suffix}`
		) {
			return REASONING_EFFORT_SUFFIXES.length - index;
		}
	}
	return 0;
}

/** Maps free OpenRouter route IDs back to their paid base route. */
export function nonFreeOpenRouterModelId(modelId: string): string | null {
	return modelId.endsWith(OPENROUTER_FREE_ROUTE_SUFFIX)
		? modelId.slice(0, -OPENROUTER_FREE_ROUTE_SUFFIX.length)
		: null;
}

/** Builds the public OpenRouter ID after hiding free and dated variants. */
export function publicOpenRouterModelId(modelId: string | null): string | null {
	if (modelId == null) {
		return null;
	}
	const paidModelId = nonFreeOpenRouterModelId(modelId) ?? modelId;
	return normalizePublicVersionSeparators(
		stripDatedPreviewRoute(stripCatalogAliasSuffixes(paidModelId)),
	);
}

/** Removes dated preview suffixes from public model IDs. */
function stripDatedPreviewRoute(modelId: string): string {
	return modelId.replace(DATED_PREVIEW_ROUTE_PATTERN, "$1");
}

/** Rewrites numeric release separators into public version notation. */
function normalizePublicVersionSeparators(modelId: string): string {
	return modelId.replace(/(^|[-/])(\d)-(\d)(?=$|-)/g, "$1$2.$3");
}

/** Checks whether OpenRouter free route ID for model alias normalization. */
export function isOpenRouterFreeRouteId(
	modelId: string | null | undefined,
): boolean {
	return modelId?.endsWith(OPENROUTER_FREE_ROUTE_SUFFIX) === true;
}

/** Detects display names that still expose the free-route label. */
export function hasPublicFreeRouteLabel(
	modelName: string | null | undefined,
): boolean {
	return /\s+\(free\)\s*$/i.test(modelName ?? "");
}

/** Removes transient preview/latest/free labels from public model names. */
export function publicModelDisplayName(
	modelName: string | null,
): string | null {
	return (
		modelName
			?.replace(
				/^Gemini (.+?) Preview(?: \d{2}-\d{2}|\s+\d{2}-\d{4})?$/i,
				"Gemini $1",
			)
			?.replace(/\s+\(latest\)\s*$/i, "")
			.replace(/\s+\(free\)\s*$/i, "")
			.trim() ?? null
	);
}
