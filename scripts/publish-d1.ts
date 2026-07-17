/** Refresh source evidence and publish derived Model Atlas rows directly to Cloudflare D1. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { publishD1Snapshot } from "../src/model-atlas/database/d1-publish";

if (existsSync(".env")) {
	loadEnvFile(".env");
}

const { result } = await publishD1Snapshot();

console.log(JSON.stringify(result, null, 2));
