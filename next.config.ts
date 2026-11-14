/** Next.js configuration: Markdown documents load through the document loader under both Turbopack and webpack, and dev file watching skips tool and build directories. */

import { resolve } from "node:path";

import type { NextConfig } from "next";

const DEV_IGNORED_DIRS = [".git", ".next", ".cache", "node_modules"] as const;
// Matches a path with one of those directories as a whole segment: `/repo/.cache/plan.md` matches, `/repo/app/.cachex/a.ts` does not.
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
