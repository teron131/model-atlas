import assert from "node:assert/strict";

import { valueDistribution } from "../app/dashboard/graphs/chart-stats";
import { fmtCompact, fmtPercentScore } from "../app/dashboard/graphs/format";

const contextDistribution = valueDistribution([
	131_072, 1_000_000, 1_000_000, 2_000_000,
]);

assert.equal(
	contextDistribution.median,
	1_000_000,
	"context spread summaries should use raw context tokens, not log-space values",
);
assert.equal(fmtCompact(contextDistribution.min), "131K");
assert.equal(fmtCompact(contextDistribution.median), "1M");
assert.equal(fmtCompact(contextDistribution.max), "2M");

assert.equal(
	fmtPercentScore(0.28571428571428603),
	"0.3%",
	"already-percent benchmark scores below 1% should not be multiplied as ratios",
);
assert.equal(
	fmtPercentScore(99.52699483854614),
	"99.5%",
	"near-perfect benchmark scores should keep one decimal instead of rounding to 100%",
);
assert.equal(
	fmtPercentScore(99.96),
	"99.9%",
	"below-perfect benchmark scores should not round up to a perfect 100%",
);
assert.equal(
	fmtPercentScore(70.04504504504504),
	"70%",
	"whole-tenth benchmark scores should not spam .0%",
);
