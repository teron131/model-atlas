/** Refresh the local Model Atlas database and publish it to Cloudflare D1. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { publishModelAtlasD1 } from "../src/model-atlas/llm/database/d1-publish";

if (existsSync(".env")) {
	loadEnvFile(".env");
}

const result = await publishModelAtlasD1();

console.log(JSON.stringify(result, null, 2));
