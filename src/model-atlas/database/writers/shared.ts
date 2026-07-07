/** SQLite writer coercion rules keep nullable scraper fields and booleans stored consistently across sources. */

import { asFiniteNumber, type JsonObject } from "../../shared";

export type SqlValue = string | number | null;

export function booleanValue(value: unknown): number | null {
	return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

export function hasModality(values: unknown, modality: string): number {
	return Array.isArray(values) && values.includes(modality) ? 1 : 0;
}

export function firstString(
	row: JsonObject,
	keys: readonly string[],
): string | null {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}
	return null;
}

export function firstNumber(
	row: JsonObject,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = asFiniteNumber(row[key]);
		if (value != null) {
			return value;
		}
	}
	return null;
}
