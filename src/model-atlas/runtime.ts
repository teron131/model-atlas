/** Package-wide runtime policies for coercing source values and bounded async work. */

import type { NumberOrNull } from "./numeric";

export type JsonObject = Record<string, unknown>;

export function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/** Treat only non-array objects as JSON records so callers can safely inspect scraper/API payload fields. */
export function asRecord(value: unknown): JsonObject {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: {};
}

/** Coerce loose scraper values to finite numbers while preserving empty and invalid values as missing evidence. */
export function asFiniteNumber(value: unknown): NumberOrNull {
	if (value == null) {
		return null;
	}
	if (typeof value === "string" && value.trim().length === 0) {
		return null;
	}
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

/** Bound external fetches with AbortController while preserving the caller's request options. */
export async function fetchWithTimeout(
	input: string | URL,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

/** Run async work through a small worker pool so scraper fan-out stays friendly to source hosts. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const safeConcurrency = Math.max(1, Math.floor(concurrency));
	const results = new Array<R>(items.length);
	let cursor = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) {
				return;
			}
			results[index] = await mapper(items[index] as T, index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(safeConcurrency, items.length) }, () =>
			worker(),
		),
	);
	return results;
}
