/** Cross-cutting runtime policies for coercing source values, checking freshness, and writing JSON artifacts. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NumberOrNull } from "./math-utils";

export type { NumberOrNull } from "./math-utils";
export {
	finiteNumbers,
	meanOrNull,
	percentileRank,
} from "./math-utils";

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

/** Freshness checks reject future timestamps so bad clocks cannot extend cache lifetimes indefinitely. */
export function isFreshEpochSeconds(
	fetchedAtEpochSeconds: unknown,
	ttlSeconds: number,
): boolean {
	if (typeof fetchedAtEpochSeconds !== "number") {
		return false;
	}
	const ageSeconds = nowEpochSeconds() - fetchedAtEpochSeconds;
	return ageSeconds >= 0 && ageSeconds <= ttlSeconds;
}

export async function writeJsonFile(
	path: string,
	payload: unknown,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
