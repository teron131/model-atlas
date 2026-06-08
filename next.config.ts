import type { NextConfig } from "next";

const DEV_WATCH_IGNORED_DIRECTORY_NAMES = [
	".git",
	".next",
	".cache",
	"node_modules",
] as const;
const DEV_WATCH_IGNORED_PATHS = new RegExp(
	`(^|[/\\\\])(${DEV_WATCH_IGNORED_DIRECTORY_NAMES.map(escapeRegExp).join("|")})([/\\\\]|$)`,
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
				ignored: DEV_WATCH_IGNORED_PATHS,
			};
		}
		return config;
	},
};

export default nextConfig;
