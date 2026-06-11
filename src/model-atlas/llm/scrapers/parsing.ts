import { asFiniteNumber, asRecord } from "../shared";

export type ZeroEvalModelScoreFields = {
	model: string;
	provider: string;
	provider_name?: string | null;
	score: number;
	source_url?: string | null;
	analysis_method?: string | null;
	verified?: boolean | null;
	self_reported?: boolean | null;
};

export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function booleanValue(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

export function unitScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	if (score == null || score < 0 || score > 1) {
		return null;
	}
	return Number(score.toFixed(6));
}

export function percentToUnitScore(
	value: string | null | undefined,
): number | null {
	if (value == null) {
		return null;
	}
	const score = Number(value);
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return null;
	}
	return Number((score / 100).toFixed(6));
}

export function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&#xA0;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&mdash;/g, "\u2014")
		.replace(/&#8212;/g, "\u2014");
}

export function stripHtmlTags(value: string): string {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

export function htmlAttribute(html: string, name: string): string | null {
	const match = html.match(new RegExp(`${name}="([^"]+)"`, "i"));
	return match == null ? null : decodeHtmlEntities(match[1] ?? "").trim();
}

export function htmlTextLines(pageHtml: string): string[] {
	return decodeHtmlEntities(
		pageHtml
			.replace(/<script[\s\S]*?<\/script>/g, " ")
			.replace(/<style[\s\S]*?<\/style>/g, " ")
			.replace(/<[^>]+>/g, "\n"),
	)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => line.length > 0);
}

export function providerFromLogoAlt(value: string | null): string | null {
	if (value == null) {
		return null;
	}
	const provider = value.replace(/\s+logo$/i, "").trim();
	return provider.length > 0 ? provider : null;
}

export function zeroEvalModelScoreFields(
	value: unknown,
): ZeroEvalModelScoreFields | null {
	const row = asRecord(value);
	const model = stringValue(row?.model_name);
	const provider = stringValue(row?.organization_id);
	const score = unitScore(row?.normalized_score) ?? unitScore(row?.score);
	if (model == null || provider == null || score == null) {
		return null;
	}
	return {
		model,
		provider,
		provider_name: stringValue(row?.organization_name),
		score,
		source_url: stringValue(row?.self_reported_source),
		analysis_method: stringValue(row?.analysis_method),
		verified: booleanValue(row?.verified),
		self_reported: booleanValue(row?.self_reported),
	};
}

export function zeroEvalModelRows<T>(
	payload: unknown,
	modelScoreRow: (value: unknown) => T | null,
): T[] {
	const root = asRecord(payload);
	const modelRows = Array.isArray(root?.models) ? root.models : [];
	const rows: T[] = [];
	for (const modelRow of modelRows) {
		const row = modelScoreRow(modelRow);
		if (row != null) {
			rows.push(row);
		}
	}
	return rows;
}
