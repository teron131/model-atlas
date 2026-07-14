/** Scripted test runner for Model Atlas. */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const testDir = "test";
const testFiles = readdirSync(testDir)
	.filter((file) => file.endsWith(".ts") && !file.endsWith("-fixtures.ts"))
	.sort();

for (const testFile of testFiles) {
	const testPath = join(testDir, testFile);
	console.log(`\n${testPath}`);
	const result = spawnSync("tsx", [testPath], { stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
