/** Next.js runtime configuration for local development and production builds. */

import type { NextConfig } from "next";

const DEV_IGNORED_DIRS = [".git", ".next", ".cache", "node_modules"] as const;
const DEV_IGNORED_PATHS = new RegExp(
	`(^|[/\\\\])(${DEV_IGNORED_DIRS.map(escapeRegExp).join("|")})([/\\\\]|$)`,
);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const nextConfig: NextConfig = {
	turbopack: {},
	webpack(config, { dev }) {
		if (dev) {
			config.watchOptions = {
				...config.watchOptions,
				ignored: DEV_IGNORED_PATHS,
			};
		}
		return config;
	},
};

export default nextConfig;
