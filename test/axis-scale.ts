import assert from "node:assert/strict";
import { steppedLinearAxisScale } from "../app/dashboard/graphs/axisScale";

const benchmarkScoreAxisOptions = {
	formatTick: (tick: number) => `${tick}%`,
	max: 100,
	minimumTicks: 5,
	steps: [10, 5, 2] as const,
};

assert.deepEqual(
	steppedLinearAxisScale([13, 14.5, 15.4, 18], benchmarkScoreAxisOptions).ticks,
	[12, 14, 16, 18, 20],
	"tight benchmark score axes should use 2% ticks instead of forcing zero",
);

assert.deepEqual(
	steppedLinearAxisScale([0.1, 22, 31, 47.1], benchmarkScoreAxisOptions).ticks,
	[0, 10, 20, 30, 40, 50],
	"nearby round upper bounds should snap outward to include the next step",
);
