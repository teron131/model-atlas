/** Mirror local dotenv keys into selected Vercel scopes and remove absent keys from those same scopes. */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const envFile = process.env.ENV_FILE ?? ".env";
const previewBranches = (process.env.VERCEL_PREVIEW_BRANCHES ?? "")
  .split(",")
  .map((branch) => branch.trim())
  .filter(Boolean);
const targets: [string, ...string[]][] = [
  ["production"],
  ["development"],
  ...previewBranches.map((branch): [string, string] => ["preview", branch]),
];
const entries = Object.entries(parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>);
const localKeys = new Set(entries.map(([key]) => key));
const project = (
  process.env.VERCEL_PROJECT_ID && process.env.VERCEL_ORG_ID
    ? { projectId: process.env.VERCEL_PROJECT_ID, orgId: process.env.VERCEL_ORG_ID }
    : JSON.parse(readFileSync(".vercel/project.json", "utf8"))
) as {
  projectId: string;
  orgId: string;
};

function runVercel(
  args: string[],
  options: { secret?: string; printOutput?: boolean; input?: string } = {},
): string {
  const result = spawnSync("vercel", args, {
    encoding: "utf8",
    input: options.input,
    timeout: 120_000,
  });
  if (result.error) throw new Error("Unable to run Vercel CLI", { cause: result.error });
  if (options.printOutput) {
    process.stdout.write(result.stdout);
  }
  if (result.status !== 0) {
    const rawOutput = `${result.stderr}${result.stdout}`;
    const errorOutput = options.secret
      ? rawOutput.replaceAll(options.secret, "<redacted>")
      : rawOutput;
    throw new Error(
      [`vercel ${args.slice(0, 4).join(" ")} failed`, errorOutput.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

type ListedEnv = {
  id: string;
  key: string;
  target: string[];
  gitBranch?: string;
  customEnvironmentIds?: string[];
};

function listEnvs(): ListedEnv[] {
  // The env-list presentation omits record IDs, which are needed to edit shared targets without deleting their values.
  const output = runVercel([
    "api",
    `/v10/projects/${encodeURIComponent(project.projectId)}/env`,
    "--scope",
    project.orgId,
    "--raw",
  ]);
  const response = JSON.parse(output.slice(output.indexOf("{"))) as {
    envs: ListedEnv[];
  };
  return response.envs;
}

for (const [key, value] of entries) {
  for (const target of targets) {
    console.log(`sync ${key} ${target.join("/")}`);
    runVercel(["env", "add", key, ...target, "--value", value, "--yes", "--force"], {
      secret: value,
    });
  }
}

for (const env of listEnvs().filter((env) => !localKeys.has(env.key))) {
  // Deletions must use the same scopes and explicit preview branches as additions.
  const selected = targets.filter(
    ([scope, branch]) => env.target.includes(scope) && (env.gitBranch ?? "") === (branch ?? ""),
  );
  if (selected.length === 0) continue;
  const remaining = env.target.filter((scope) => !selected.some(([target]) => target === scope));
  console.log(`remove ${env.key} ${selected.map((target) => target.join("/")).join(",")}`);
  if (remaining.length > 0 || env.customEnvironmentIds?.length) {
    // `env remove` deletes the entire record; a target-only patch preserves Preview, custom environments, and the stored secret.
    runVercel(
      [
        "api",
        `/v9/projects/${encodeURIComponent(project.projectId)}/env/${encodeURIComponent(env.id)}`,
        "--scope",
        project.orgId,
        "--method",
        "PATCH",
        "--input",
        "-",
        "--silent",
      ],
      { input: JSON.stringify({ target: remaining }) },
    );
  } else {
    runVercel(["env", "remove", env.key, ...selected[0]!, "--yes"]);
  }
}

if (previewBranches.length === 0) {
  console.warn(
    "Skipping Preview envs. Set VERCEL_PREVIEW_BRANCHES=branch-a,branch-b to sync branch-scoped Preview envs.",
  );
}

runVercel(["env", "ls"], { printOutput: true });
