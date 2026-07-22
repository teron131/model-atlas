/** Vending-Bench 2 scraper fixtures protect full curves, signed balances, ranking, and matching. */

import assert from "node:assert/strict";
import { buildBenchmarkModelMap } from "../src/model-atlas/identity/normalization";
import { processVendingBench2DataModule } from "../src/model-atlas/scrapers/vending-bench-2";

const rows = processVendingBench2DataModule(`
	const metadata={time_grid:[1,2,3]};
	const runs={vb2:{
		"Claude Opus 4.7":{num_epochs:6,time_series:[500,700,10936.76],final_value:10936.76},
		"GPT-5 mini":{num_epochs:5,time_series:[500,100,-31.18],final_value:-31.18},
		"Escaped \\"Model\\"":{num_epochs:5,time_series:[500,550,600],final_value:600}
	},arena:{}};
`);

assert.deepEqual(rows, [
	{
		rank: 1,
		model: "Claude Opus 4.7",
		base_model: "Claude Opus 4.7",
		reasoning_effort: null,
		run_count: 6,
		final_balance_usd: 10936.76,
		daily_balance_usd: [500, 700, 10936.76],
	},
	{
		rank: 2,
		model: 'Escaped "Model"',
		base_model: 'Escaped "Model"',
		reasoning_effort: null,
		run_count: 5,
		final_balance_usd: 600,
		daily_balance_usd: [500, 550, 600],
	},
	{
		rank: 3,
		model: "GPT-5 mini",
		base_model: "GPT-5 mini",
		reasoning_effort: null,
		run_count: 5,
		final_balance_usd: -31.18,
		daily_balance_usd: [500, 100, -31.18],
	},
]);

const rowsByModelName = buildBenchmarkModelMap(rows);
assert.equal(
	rowsByModelName.get("claude-opus-4-7")?.final_balance_usd,
	10936.76,
);
assert.equal(rowsByModelName.get("gpt-5-mini")?.final_balance_usd, -31.18);

const effortRows = processVendingBench2DataModule(`
	const runs={vb2:{
		"Example - High":{num_epochs:5,time_series:[500,700],final_value:700},
		"Example - Max":{num_epochs:5,time_series:[500,900],final_value:900}
	}};
`);
assert.equal(
	buildBenchmarkModelMap(effortRows).get("example")?.final_balance_usd,
	900,
);
