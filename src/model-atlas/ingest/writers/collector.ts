/** Direct publication collects existing writer output into table-shaped rows without creating a SQLite database. */

import type { DatabaseStatement, DatabaseWriter, SqlValue } from "./database";

export type CollectedTableRows = {
	columns: string[];
	rows: SqlValue[][];
};

/** Captures trusted INSERT writer calls so D1 can publish their rows directly. */
export class SnapshotRowCollector implements DatabaseWriter {
	readonly tables = new Map<string, CollectedTableRows>();

	prepare(sql: string): DatabaseStatement {
		const match = /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
		if (match?.[1] == null || match[2] == null) {
			throw new Error("Snapshot row collector only accepts INSERT statements");
		}
		const table = match[1];
		const columns = match[2].split(",").map((column) => column.trim());
		const collected = this.tables.get(table) ?? { columns, rows: [] };
		if (collected.columns.join("|") !== columns.join("|")) {
			throw new Error(`Inconsistent collected columns for ${table}`);
		}
		this.tables.set(table, collected);
		return {
			run: (...values) => {
				if (values.length !== columns.length) {
					throw new Error(
						`Collected ${values.length} values for ${table}; expected ${columns.length}`,
					);
				}
				collected.rows.push(values);
				return {};
			},
		};
	}

	records(table: string): Record<string, SqlValue>[] {
		const collected = this.tables.get(table);
		if (collected == null) {
			return [];
		}
		return collected.rows.map((values) =>
			Object.fromEntries(
				collected.columns.map((column, index) => [
					column,
					values[index] ?? null,
				]),
			),
		);
	}
}
