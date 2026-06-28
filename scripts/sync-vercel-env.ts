/** Vercel environment syncing for Model Atlas. */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const envFile = process.env.ENV_FILE ?? ".env";
const previewBranches = (process.env.VERCEL_PREVIEW_BRANCHES ?? "")
	.split(",")
	.map((branch) => branch.trim())
	.filter(Boolean);
const targets = [
	["production"],
	["development"],
	...previewBranches.map((branch) => ["preview", branch]),
];
const entries = envEntries();
const localKeys = new Set(entries.map(([key]) => key));

/** Removes one layer of shell quotes from dotenv values. */
function unquote(value: string): string {
	const trimmed = value.trim();
	return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
		? trimmed.slice(1, -1)
		: trimmed;
}

function envEntries(): [string, string][] {
	return readFileSync(envFile, "utf8")
		.split(/\r?\n/)
		.flatMap((line) => {
			const trimmed = line.trim();
			const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
			return !trimmed || trimmed.startsWith("#") || match == null
				? []
				: [[match[1] ?? "", unquote(match[2] ?? "")]];
		});
}

function vercel(
	args: string[],
	options: { secret?: string; printOutput?: boolean } = {},
): string {
	const result = spawnSync("vercel", args, { encoding: "utf8" });
	if (options.printOutput) {
		process.stdout.write(result.stdout);
	}
	if (result.status !== 0) {
		const rawOutput = `${result.stderr}${result.stdout}`;
		const output = options.secret
			? rawOutput.replaceAll(options.secret, "<redacted>")
			: rawOutput;
		throw new Error(
			[`vercel ${args.slice(0, 4).join(" ")} failed`, output.trim()]
				.filter(Boolean)
				.join("\n"),
		);
	}
	return result.stdout;
}

type ListedEnv = {
	key: string;
	target: string[];
	gitBranch?: string;
};

function listedEnvs(): ListedEnv[] {
	const output = vercel(["env", "list", "--format", "json"]);
	const json = JSON.parse(output.slice(output.indexOf("{"))) as {
		envs: ListedEnv[];
	};
	return json.envs;
}

for (const [key, value] of entries) {
	for (const target of targets) {
		console.log(`sync ${key} ${target.join("/")}`);
		vercel(
			["env", "add", key, ...target, "--value", value, "--yes", "--force"],
			{ secret: value },
		);
	}
}

for (const env of listedEnvs().filter((env) => !localKeys.has(env.key))) {
	for (const target of env.target) {
		const branch = env.gitBranch ? [env.gitBranch] : [];
		console.log(`remove ${env.key} ${[target, ...branch].join("/")}`);
		vercel(["env", "remove", env.key, target, ...branch, "--yes"]);
	}
}

if (previewBranches.length === 0) {
	console.warn(
		"Skipping Preview envs. Set VERCEL_PREVIEW_BRANCHES=branch-a,branch-b to sync branch-scoped Preview envs.",
	);
}

vercel(["env", "ls"], { printOutput: true });
