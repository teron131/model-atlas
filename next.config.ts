/** Next.js runtime configuration for local development and production builds. */

import { resolve } from "node:path";

import type { NextConfig } from "next";

const DEV_IGNORED_DIRS = [".git", ".next", ".cache", "node_modules"] as const;
const DEV_IGNORED_PATHS = new RegExp(
  `(^|[/\\\\])(${DEV_IGNORED_DIRS.map(escapeRegExp).join("|")})([/\\\\]|$)`,
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.md": { loaders: ["./scripts/document-loader.cjs"], as: "*.js" },
    },
  },
  webpack(config, { dev }) {
    config.module.rules.push({
      test: /\.md$/,
      use: [resolve(process.cwd(), "scripts/document-loader.cjs")],
    });
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
