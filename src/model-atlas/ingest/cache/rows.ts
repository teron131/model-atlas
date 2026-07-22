/** Shared source-cache row access and decoding for SQLite and collected publication rows. */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";

export type CacheDbRow = JsonObject;
export type CacheRowSource = DatabaseSync | CacheDbRow[];

/** Cache readers normalize SQLite's loose row objects before source-specific reconstruction begins. */
export function queryCacheRows(
	db: DatabaseSync,
	sql: string,
	params: readonly SQLInputValue[] = [],
): CacheDbRow[] {
	return db
		.prepare(sql)
		.all(...params)
		.map((row) => asRecord(row));
}

/** Read source rows from either a live database or an already collected row set. */
export function sourceCacheRows(
	cache: CacheRowSource,
	sql: string,
): CacheDbRow[] {
	return Array.isArray(cache) ? cache : queryCacheRows(cache, sql);
}

/** Source cache freshness follows the persisted fetch timestamp carried by the source row set. */
export function firstEpochSecond(
	rowsToScan: readonly CacheDbRow[],
): number | null {
	for (const row of rowsToScan) {
		const fetchedAt = asFiniteNumber(row.fetched_at_epoch_seconds);
		if (fetchedAt != null) {
			return fetchedAt;
		}
	}
	return null;
}

export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function booleanFromSql(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

export function assignIfString(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = stringValue(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function assignIfNumber(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = asFiniteNumber(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function assignIfBoolean(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = booleanFromSql(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function nonEmptyRecord(record: JsonObject): JsonObject | null {
	return Object.keys(record).length > 0 ? record : null;
}

export function modalityList(
	row: CacheDbRow,
	prefix: string,
	names: string[],
): string[] {
	return names.filter(
		(name) => booleanFromSql(row[`${prefix}_${name}`]) === true,
	);
}
