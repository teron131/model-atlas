/** SQLite value rules shared by every table reader and writer: the minimal write surface, and how booleans, modality flags, and JSON text cross the column boundary. */

export type SqlValue = string | number | null;

export type DbRow = Record<string, unknown>;

export type DatabaseStatement = {
  run: (...values: SqlValue[]) => unknown;
};

/** Minimal write surface shared by SQLite and the in-memory verification collector. */
export type DatabaseWriter = {
  prepare: (sql: string) => DatabaseStatement;
};

export function sqliteBooleanValue(value: unknown): number | null {
  return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

export function modalityFlagValue(values: unknown, modality: string): number {
  return Array.isArray(values) && values.includes(modality) ? 1 : 0;
}

/** Decode a JSON text column; an absent or malformed value reads as missing evidence. */
export function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
