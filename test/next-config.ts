import assert from "node:assert/strict";
import { join } from "node:path";

import nextConfig from "../next.config";

type WebpackHook = NonNullable<typeof nextConfig.webpack>;

const webpackConfig = (nextConfig.webpack as WebpackHook)({}, {
	buildId: "test",
	config: nextConfig,
	defaultLoaders: { babel: {} },
	dev: true,
	dir: process.cwd(),
	isServer: true,
	nextRuntime: "nodejs",
	totalPages: 1,
	webpack: {},
} as Parameters<WebpackHook>[1]);

const ignored = webpackConfig?.watchOptions?.ignored;

assert.ok(ignored instanceof RegExp, "dev watch ignore should be a regexp");
assert.match(
	join(process.cwd(), ".cache", "database.sqlite"),
	ignored,
	"dev watch ignore should exclude the repo cache directory",
);
assert.match(
	join(process.cwd(), ".cache", "model-logos", "openai.png"),
	ignored,
	"dev watch ignore should exclude nested cache writes",
);
assert.match(
	join(process.cwd(), ".next", "server", "app", "page.js"),
	ignored,
	"dev watch ignore should preserve Next's default dist ignore",
);
assert.match(
	join(process.cwd(), "node_modules", "next", "package.json"),
	ignored,
	"dev watch ignore should preserve dependency ignores",
);
