"use client";

/** Shared Model Atlas header with route navigation and theme control. */

import {
	BookOpenText,
	ChartNoAxesColumnIncreasing,
	ListTree,
	Moon,
	Sun,
} from "lucide-react";
import Link from "next/link";

import {
	toggleModelAtlasTheme,
	useModelAtlasThemeSynchronization,
} from "./theme";

export function ModelAtlasHeader({
	page,
	documentNavigationOpen = false,
	onToggleDocumentNavigation,
}: {
	page: "dashboard" | "methodology";
	documentNavigationOpen?: boolean;
	onToggleDocumentNavigation?: () => void;
}) {
	useModelAtlasThemeSynchronization();
	const route =
		page === "dashboard"
			? {
					href: "/methodology",
					label: "Methodology",
					Icon: BookOpenText,
				}
			: {
					href: "/",
					label: "Leaderboard",
					Icon: ChartNoAxesColumnIncreasing,
				};

	return (
		<header className="dashboard-header">
			<Link className="brand-lockup" href="/" aria-label="Model Atlas home">
				<span className="brand-mark" aria-hidden="true" />
				{page === "dashboard" ? (
					<h1>Model Atlas</h1>
				) : (
					<span className="brand-title">Model Atlas</span>
				)}
			</Link>
			<div className="header-actions">
				{onToggleDocumentNavigation == null ? null : (
					<button
						className="theme-toggle"
						type="button"
						aria-label={
							documentNavigationOpen
								? "Hide document navigation"
								: "Show document navigation"
						}
						aria-controls="document-navigation"
						aria-expanded={documentNavigationOpen}
						onClick={onToggleDocumentNavigation}
					>
						<ListTree aria-hidden="true" />
					</button>
				)}
				<Link className="header-route" href={route.href}>
					<route.Icon aria-hidden="true" />
					<span>{route.label}</span>
				</Link>
				<button
					className="theme-toggle"
					type="button"
					aria-label="Toggle color theme"
					title="Toggle color theme"
					onClick={toggleModelAtlasTheme}
				>
					<Sun className="theme-icon-light" aria-hidden="true" />
					<Moon className="theme-icon-dark" aria-hidden="true" />
				</button>
			</div>
		</header>
	);
}
