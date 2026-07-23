/** Root document shell, metadata, and production page-speed instrumentation. */

import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT } from "./shared/theme-storage";

import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
	title: "Model Atlas",
	description: "Live model ranking and visualization graphs.",
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
			{ url: "/icons/icon.svg", type: "image/svg+xml" },
			{ url: "/icons/icon.png", type: "image/png" },
		],
		shortcut: "/favicon.ico",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* The saved theme must be applied before body paint on every route. */}
				<script>{MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT}</script>
			</head>
			<body>
				{children}
				<SpeedInsights />
			</body>
		</html>
	);
}
