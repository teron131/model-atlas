/** Shared SQLite row decoding and latest-run mechanics for source cache readers. */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import { quoteIdentifier } from "../schema";

export type CacheDbRow = JsonObject;

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

export function latestTableRunId(
	db: DatabaseSync,
	table: string,
): number | null {
	const row = asRecord(
		db
			.prepare(`SELECT MAX(run_id) AS run_id FROM ${quoteIdentifier(table)}`)
			.get(),
	);
	return asFiniteNumber(row.run_id);
}

export function queryLatestCacheRows(
	db: DatabaseSync,
	table: string,
	sql: string,
): CacheDbRow[] {
	const runId = latestTableRunId(db, table);
	return runId == null ? [] : queryCacheRows(db, sql, [runId]);
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
