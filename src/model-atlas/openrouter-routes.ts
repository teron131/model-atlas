/** Shared OpenRouter route identity rules for scraping, storage, and public stats rows. */

import { claudeRouteIdentityKey } from "./matcher/claude-identity";
import {
	modelSlugFromModelId,
	normalizeProviderModelId,
	reasoningEffortRank,
} from "./shared";

export const OPENROUTER_FREE_ROUTE_SUFFIX = ":free";

const REASONING_EFFORT_ROUTES = [
	["-reasoning-ultra", "ultra"],
	["-ultra", "ultra"],
	["-reasoning-max", "max"],
	["-max", "max"],
	["-adaptive", "adaptive"],
	["-reasoning-xhigh", "xhigh"],
	["-xhigh", "xhigh"],
	["-reasoning-high", "high"],
	["-high", "high"],
	["-reasoning-medium", "medium"],
	["-medium", "medium"],
	["-reasoning-low", "low"],
	["-low", "low"],
	["-reasoning-minimal", "minimal"],
	["-minimal", "minimal"],
	["-reasoning", "minimal"],
	["-non-reasoning", "non-reasoning"],
] as const;
const REASONING_EFFORT_SUFFIXES = REASONING_EFFORT_ROUTES.map(
	([suffix]) => suffix,
);
const GPT_5_6_PRO_ROUTE_PATTERN =
	/(^|\/)gpt(?:[.-])5(?:[.-])6-(?:sol|terra|luna)-pro$/;
const CATALOG_ALIAS_SUFFIXES = [
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

function isOpenRouterVersionSuffix(value: string): boolean {
	return (
		/^(?:preview|beta|experimental)(?:-\d{2,4}(?:-\d{2,4})*)?$/i.test(value) ||
		/^\d{8}$/i.test(value) ||
		/^\d{4}-\d{2}-\d{2}$/i.test(value) ||
		/^\d{2}-\d{2}$/i.test(value) ||
		/^\d{2}-\d{4}$/i.test(value)
	);
}

function openRouterRouteParts(route: string): [string, string] | null {
	const [provider, modelName = ""] = route.toLowerCase().split("/", 2);
	return provider && modelName ? [provider, modelName] : null;
}

function normalizedEffortSelectionRoute(route: string): string {
	return claudeRouteIdentityKey(route) ?? normalizeProviderModelId(route);
}

function isSameOpenRouterModelVersion(
	targetModelName: string,
	candidateModelName: string,
): boolean {
	const targetBase = stripOpenRouterVersionSuffix(targetModelName);
	const candidateBase = stripOpenRouterVersionSuffix(candidateModelName);
	if (candidateBase !== targetBase) {
		const targetClaudeIdentity = claudeRouteIdentityKey(targetBase);
		return (
			targetClaudeIdentity != null &&
			targetClaudeIdentity === claudeRouteIdentityKey(candidateBase)
		);
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
	// GPT-5.6 keeps Pro as a request mode on each tier, despite catalog aliases presenting it like a model suffix.
	if (GPT_5_6_PRO_ROUTE_PATTERN.test(normalized)) {
		return normalized.slice(0, -"-pro".length);
	}
	for (const suffix of CATALOG_ALIAS_STRIP_SUFFIXES) {
		if (normalized.endsWith(suffix)) {
			normalized = normalized.slice(0, -suffix.length);
			break;
		}
	}
	return normalized;
}

/** Ranks an effort observation by its reported label, using route suffixes only when the source omits that label. */
export function reasoningEffortSelectionPriority(
	reasoningEffort: unknown,
	artificialAnalysisSlug: string | null,
	canonicalSlug: string | null,
): number {
	if (artificialAnalysisSlug == null || canonicalSlug == null) {
		return 0;
	}
	const normalizedArtificialAnalysisSlug = normalizedEffortSelectionRoute(
		artificialAnalysisSlug,
	);
	const normalizedCanonicalSlug = normalizedEffortSelectionRoute(canonicalSlug);
	const exactRoute =
		normalizedArtificialAnalysisSlug === normalizedCanonicalSlug;
	const routeIndex = exactRoute
		? -1
		: REASONING_EFFORT_ROUTES.findIndex(
				([suffix]) =>
					normalizedArtificialAnalysisSlug ===
					`${normalizedCanonicalSlug}${suffix}`,
			);
	const reportedRank =
		typeof reasoningEffort === "string" && reasoningEffort.trim().length > 0
			? reasoningEffortRank(reasoningEffort)
			: -1;
	const inferredRank = exactRoute
		? reasoningEffortRank(null)
		: routeIndex >= 0
			? reasoningEffortRank(REASONING_EFFORT_ROUTES[routeIndex]?.[1])
			: -1;
	const effortRank = reportedRank >= 0 ? reportedRank : inferredRank;
	if (effortRank < 0) {
		return 0;
	}
	const routeTieBreak =
		exactRoute || routeIndex < 0
			? REASONING_EFFORT_ROUTES.length + 1
			: REASONING_EFFORT_ROUTES.length - routeIndex;
	return (effortRank + 1) * 100 + routeTieBreak;
}

export function nonFreeOpenRouterModelId(modelId: string): string | null {
	return modelId.endsWith(OPENROUTER_FREE_ROUTE_SUFFIX)
		? modelId.slice(0, -OPENROUTER_FREE_ROUTE_SUFFIX.length)
		: null;
}

export function publicOpenRouterModelId(modelId: string | null): string | null {
	if (modelId == null) {
		return null;
	}
	const paidModelId = nonFreeOpenRouterModelId(modelId) ?? modelId;
	const publicModelId = stripCatalogAliasSuffixes(paidModelId).replace(
		DATED_PREVIEW_ROUTE_PATTERN,
		"$1",
	);
	return publicModelId.replace(/(^|[-/])(\d)-(\d)(?=$|-)/g, "$1$2.$3");
}

export function isOpenRouterFreeRouteId(
	modelId: string | null | undefined,
): boolean {
	return modelId?.endsWith(OPENROUTER_FREE_ROUTE_SUFFIX) === true;
}

export function hasPublicFreeRouteLabel(
	modelName: string | null | undefined,
): boolean {
	return /\s+\(free\)\s*$/i.test(modelName ?? "");
}

/** Removes transient preview/latest/free labels from public OpenRouter model names. */
export function publicOpenRouterModelName(
	modelName: string | null,
	modelId: string | null = null,
): string | null {
	if (modelName == null) {
		return null;
	}
	const hasPlainLatestSuffix = /\s+latest\s*$/i.test(modelName);
	let publicName = modelName
		.replace(
			/^Gemini (.+?) Preview(?: \d{2}-\d{2}|\s+\d{2}-\d{4})?$/i,
			"Gemini $1",
		)
		.replace(/\s+(?:\(latest\)|latest)\s*$/i, "")
		.replace(/\s+\(free\)\s*$/i, "")
		.trim();
	if (hasPlainLatestSuffix && !/\d/.test(publicName)) {
		const version = modelSlugFromModelId(modelId)?.match(
			/(?:^|-)(\d+(?:\.\d+)+)$/,
		)?.[1];
		if (version != null) {
			publicName = `${publicName} ${version}`;
		}
	}
	return publicName;
}
