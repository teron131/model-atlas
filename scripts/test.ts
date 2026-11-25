/** Run the standalone TypeScript behavior checks in parallel, one process each, reporting their output in deterministic filename order and stopping at the first failure in that order. */

import { type ChildProcess, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import PQueue from "p-queue";

type Outcome = { output: { stream: NodeJS.WriteStream; chunk: Buffer }[]; status: number };

const testDir = "test";
const testFiles = readdirSync(testDir)
  .filter((file) => file.endsWith(".ts") && !file.endsWith("-fixtures.ts"))
  .sort();
const running = new Set<ChildProcess>();
// Piped output is not a terminal, so children keep the colours they would print to one.
const env = process.stdout.isTTY ? { FORCE_COLOR: "1", ...process.env } : process.env;
const queue = new PQueue({ concurrency: availableParallelism() });
const outcomes = testFiles.map((testFile) => queue.add(() => runTest(join(testDir, testFile))));

for (const [index, testFile] of testFiles.entries()) {
  const { output, status } = await outcomes[index]!;
  console.log(`\n${join(testDir, testFile)}`);
  for (const { stream, chunk } of output) stream.write(chunk);
  if (status !== 0) {
    queue.clear();
    for (const child of running) child.kill();
    process.exit(status);
  }
}

function runTest(testPath: string): Promise<Outcome> {
  return new Promise((resolve) => {
    const output: Outcome["output"] = [];
    let spawnFailed = false;
    const child = spawn("tsx", [testPath], { stdio: ["inherit", "pipe", "pipe"], env });
    running.add(child);
    child.stdout.on("data", (chunk: Buffer) => output.push({ stream: process.stdout, chunk }));
    child.stderr.on("data", (chunk: Buffer) => output.push({ stream: process.stderr, chunk }));
    child.on("error", (error) => {
      spawnFailed = true;
      output.push({ stream: process.stderr, chunk: Buffer.from(`${error.message}\n`) });
    });
    child.on("close", (status) => {
      running.delete(child);
      resolve({ output, status: spawnFailed ? 1 : (status ?? 1) });
    });
  });
}
