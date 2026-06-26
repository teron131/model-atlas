/** Scripted test runner for Model Atlas. */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const testDir = "test";
const tests = readdirSync(testDir)
	.filter((file) => file.endsWith(".ts") && !file.endsWith("-fixtures.ts"))
	.sort();

for (const test of tests) {
	const testPath = join(testDir, test);
	console.log(`\n${testPath}`);
	const result = spawnSync("tsx", [testPath], { stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
