/** Matcher tokenization strips non-identity labels while preserving model scale and version evidence. */
import { modelSlugFromModelId, normalizeModelToken } from "../shared";

const MODEL_NAME_TAG_TOKENS = new Set([
	"free",
	"extended",
	"exacto",
	"instruct",
	"thinking",
	"reasoning",
	"preview",
	"online",
	"nitro",
]);
export function splitBaseModelTokens(modelId: string): string[] {
	return splitTokens(modelSlugFromModelId(modelId) ?? modelId);
}

/** Produces a strict model identity key after removing matcher-owned non-identity labels. */
export function modelNameIdentityKey(value: string): string {
	return splitBaseModelTokens(value).join("-");
}

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

export function splitTokens(value: string): string[] {
	return normalizeModelToken(value)
		.split("-")
		.flatMap((token) => splitMixedAlphaNumericToken(token))
		.filter((token) => token && !MODEL_NAME_TAG_TOKENS.has(token));
}

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

export function isNumericToken(token: string | undefined): boolean {
	return Boolean(token && /^\d+$/.test(token));
}

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

export function parseBScaleToken(token: string | undefined): number | null {
	if (!token) {
		return null;
	}
	const billionMatch = /^(\d+)b$/.exec(token);
	return billionMatch ? Number(billionMatch[1]) : null;
}

export function parseActiveBToken(token: string | undefined): number | null {
	if (!token) {
		return null;
	}
	const activeMatch = /^a(\d+)b$/.exec(token);
	return activeMatch ? Number(activeMatch[1]) : null;
}

export function parsedNumericTokens(tokens: string[]): number[] {
	return tokens
		.map((token) => parseNumericOrBScaleToken(token))
		.filter((value): value is number => value != null);
}

export function commonPrefixLength(left: string, right: string): number {
	const maxLength = Math.min(left.length, right.length);
	let index = 0;
	while (index < maxLength && left[index] === right[index]) {
		index += 1;
	}
	return index;
}
