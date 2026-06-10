/** Model-name token helpers for matcher scoring. */
import { normalizeModelToken } from "../shared";

const MODEL_NAME_TAG_TOKENS = new Set([
	"free",
	"extended",
	"exacto",
	"instruct",
	"vl",
	"thinking",
	"reasoning",
	"online",
	"nitro",
]);
/** Return the model-id segment without the provider prefix. */
export function splitBaseModelId(modelId: string): string {
	const modelIdParts = modelId.split("/");
	return modelIdParts.at(-1) ?? modelId;
}

/** Split the base model id into comparable name tokens. */
export function splitBaseModelTokens(modelId: string): string[] {
	return splitTokens(splitBaseModelId(modelId));
}

/** Return whether a token represents dense or active billion-parameter scale. */
function isBScaleToken(token: string): boolean {
	return /^\d+b$/.test(token) || /^a\d+b$/.test(token);
}

/** Split mixed alpha-numeric variants while preserving parameter-scale tokens. */
function splitMixedAlphaNumericToken(token: string): string[] {
	if (isBScaleToken(token)) {
		return [token];
	}
	return token.split(/(?<=\D)(?=\d)|(?<=\d)(?=\D)/g).filter(Boolean);
}

/** Normalize a model name or id into matcher tokens. */
export function splitTokens(value: string): string[] {
	return normalizeModelToken(value)
		.split("-")
		.flatMap((token) => splitMixedAlphaNumericToken(token))
		.filter((token) => token && !MODEL_NAME_TAG_TOKENS.has(token));
}

/** Return the first token value accepted by a parser. */
export function firstParsedNumber(
	tokens: string[],
	parser: (token: string | undefined) => number | null,
): number | null {
	for (const token of tokens) {
		const parsedValue = parser(token);
		if (parsedValue != null) {
			return parsedValue;
		}
	}
	return null;
}

/** Return whether a token is only decimal digits. */
export function isNumericToken(token: string | undefined): boolean {
	return Boolean(token && /^\d+$/.test(token));
}

/** Parse plain numbers plus dense or active billion-parameter scale tokens. */
function parseNumericOrBScaleToken(token: string | undefined): number | null {
	if (!token) {
		return null;
	}
	if (/^\d+$/.test(token)) {
		return Number(token);
	}
	const billionMatch = /^(\d+)b$/.exec(token);
	if (billionMatch) {
		return Number(billionMatch[1]);
	}
	const aBillionMatch = /^a(\d+)b$/.exec(token);
	if (aBillionMatch) {
		return Number(aBillionMatch[1]);
	}
	return null;
}

/** Parse a dense billion-parameter scale token such as `70b`. */
export function parseBScaleToken(token: string | undefined): number | null {
	if (!token) {
		return null;
	}
	const billionMatch = /^(\d+)b$/.exec(token);
	return billionMatch ? Number(billionMatch[1]) : null;
}

/** Parse an active billion-parameter scale token such as `a3b`. */
export function parseActiveBToken(token: string | undefined): number | null {
	if (!token) {
		return null;
	}
	const activeMatch = /^a(\d+)b$/.exec(token);
	return activeMatch ? Number(activeMatch[1]) : null;
}

/** Parse every numeric or parameter-scale token in order. */
export function parsedNumericTokens(tokens: string[]): number[] {
	return tokens
		.map((token) => parseNumericOrBScaleToken(token))
		.filter((value): value is number => value != null);
}

/** Count matching leading characters between two strings. */
export function commonPrefixLength(left: string, right: string): number {
	const maxLength = Math.min(left.length, right.length);
	let index = 0;
	while (index < maxLength && left[index] === right[index]) {
		index += 1;
	}
	return index;
}
