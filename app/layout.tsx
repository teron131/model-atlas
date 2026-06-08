import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
		<html lang="en">
			<body>
				{children}
				<SpeedInsights />
			</body>
		</html>
	);
}
