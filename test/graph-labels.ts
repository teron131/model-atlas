import assert from "node:assert/strict";
import { extremeLabelRows } from "../app/dashboard/graphs/chart-stats";

type Row = {
	id: string;
	x: number;
	y: number;
};

const rows: Row[] = [
	{ id: "best-y", x: 10, y: 100 },
	{ id: "best-min-x", x: 1, y: 30 },
	{ id: "best-max-x", x: 20, y: 40 },
	{ id: "best-min-tradeoff", x: 2, y: 80 },
	{ id: "best-max-tradeoff", x: 15, y: 75 },
];

assert.deepEqual(
	labelIds({ xHigherIsBetter: false }),
	["best-y", "best-min-x", "best-min-tradeoff"],
	"extreme labels should use the minimum x value when lower x is better",
);

assert.deepEqual(
	labelIds({ xHigherIsBetter: true }),
	["best-y", "best-max-x", "best-max-tradeoff"],
	"extreme labels should use the maximum x value when higher x is better",
);

assert.deepEqual(
	[
		...extremeLabelRows(
			[
				{ id: "same", x: 10, y: 100 },
				{ id: "other", x: 5, y: 50 },
			],
			(row) => row.id,
			(row) => row.x,
			(row) => row.y,
			{ xHigherIsBetter: true },
		),
	].map((row) => row.id),
	["same"],
	"extreme labels should dedupe rows selected by more than one role",
);

function labelIds(options: { xHigherIsBetter: boolean }) {
	return [
		...extremeLabelRows(
			rows,
			(row) => row.id,
			(row) => row.x,
			(row) => row.y,
			options,
		),
	].map((row) => row.id);
}
