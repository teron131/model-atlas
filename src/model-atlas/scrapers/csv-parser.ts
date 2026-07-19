/** CSV parser preserves quoted fields and multiline values for benchmark source adapters. */

/** Parse RFC 4180-style CSV text into rows without coercing source values. */
function parseCsvRows(csv: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < csv.length; index += 1) {
		const character = csv[index] ?? "";
		if (quoted) {
			if (character === '"' && csv[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				field += character;
			}
			continue;
		}
		if (character === '"' && field.length === 0) {
			quoted = true;
		} else if (character === ",") {
			row.push(field);
			field = "";
		} else if (character === "\n") {
			row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += character;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
		rows.push(row);
	}
	return rows;
}

/** Map CSV body rows to their source header names. */
export function parseCsvRecords(csv: string): Record<string, string>[] {
	const [headers, ...rows] = parseCsvRows(csv);
	if (headers == null) return [];
	return rows
		.filter((row) => row.some((value) => value.length > 0))
		.map((row) =>
			Object.fromEntries(
				headers.map((header, index) => [header, row[index] ?? ""]),
			),
		);
}
