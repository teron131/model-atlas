"use client";

/** Responsive documentation shell with shared navigation and reading controls. */

import { ArrowUp } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DocumentNavigation } from "./DocumentNavigation";
import type { DocumentSlug, TableOfContentsItem } from "./documents";
import { MobileDocumentToolbar } from "./MobileDocumentToolbar";
import styles from "./methodology.module.css";

export function DocumentShell({
	children,
	activeDocument,
	outline,
}: {
	children: ReactNode;
	activeDocument: DocumentSlug;
	outline: TableOfContentsItem[];
}) {
	const [showBackToTop, setShowBackToTop] = useState(false);
	const [isDesktop, setIsDesktop] = useState(false);
	const [navigationPreference, setNavigationPreference] = useState<
		boolean | null
	>(null);
	const navigationOpen = navigationPreference ?? isDesktop;
	const toggleNavigation = useCallback(() => {
		setNavigationPreference((preference) => !(preference ?? isDesktop));
	}, [isDesktop]);
	const closeNavigation = useCallback(() => setNavigationPreference(false), []);

	useEffect(() => {
		const updateVisibility = () => setShowBackToTop(window.scrollY > 480);
		updateVisibility();
		window.addEventListener("scroll", updateVisibility, { passive: true });
		return () => window.removeEventListener("scroll", updateVisibility);
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(min-width: 781px)");
		const updateLayout = () => setIsDesktop(media.matches);
		updateLayout();
		media.addEventListener("change", updateLayout);
		return () => media.removeEventListener("change", updateLayout);
	}, []);

	const scrollToPageTop = () => {
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
	};

	return (
		<main className={styles.page}>
			<ModelAtlasHeader
				page="methodology"
				documentNavigationOpen={navigationOpen}
				onToggleDocumentNavigation={toggleNavigation}
			/>
			<MobileDocumentToolbar
				activeDocument={activeDocument}
				navigationOpen={navigationOpen}
				onToggleNavigation={toggleNavigation}
			/>
			<div
				className={`${styles.documentLayout} ${
					navigationOpen && isDesktop ? styles.documentLayoutWithNavigation : ""
				}`}
			>
				{children}
				{navigationOpen ? (
					<DocumentNavigation
						activeDocument={activeDocument}
						outline={outline}
						mode={isDesktop ? "docked" : "sheet"}
						onClose={closeNavigation}
					/>
				) : null}
			</div>
			<button
				className={`${styles.backToTop} ${
					showBackToTop ? styles.backToTopVisible : ""
				}`}
				type="button"
				aria-label="Back to top"
				aria-hidden={!showBackToTop}
				tabIndex={showBackToTop ? 0 : -1}
				onClick={scrollToPageTop}
			>
				<ArrowUp aria-hidden="true" />
			</button>
		</main>
	);
}
