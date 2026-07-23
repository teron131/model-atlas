"use client";

/** Fixed mobile controls for home, document navigation, and theme. */

import { ArrowLeft, ListTree, Moon, Sun } from "lucide-react";
import Link from "next/link";

import { toggleModelAtlasTheme } from "../shared/theme";
import { DOCUMENTS, type DocumentSlug } from "./documents";
import styles from "./methodology.module.css";

export function MobileDocumentToolbar({
	activeDocument,
	navigationOpen,
	onToggleNavigation,
}: {
	activeDocument: DocumentSlug;
	navigationOpen: boolean;
	onToggleNavigation: () => void;
}) {
	const currentDocument =
		DOCUMENTS.find((item) => item.slug === activeDocument) ?? DOCUMENTS[0];

	return (
		<header className={styles.mobileToolbar}>
			<Link
				className={styles.navigationIconButton}
				href="/"
				prefetch={false}
				aria-label="Back to leaderboard"
			>
				<ArrowLeft aria-hidden="true" />
			</Link>
			<span className={styles.mobileToolbarTitle}>{currentDocument.title}</span>
			<div className={styles.mobileToolbarActions}>
				<button
					className={styles.navigationIconButton}
					type="button"
					aria-label={
						navigationOpen
							? "Hide document navigation"
							: "Show document navigation"
					}
					aria-controls="document-navigation"
					aria-expanded={navigationOpen}
					onClick={onToggleNavigation}
				>
					<ListTree aria-hidden="true" />
				</button>
				<button
					className={styles.navigationIconButton}
					type="button"
					aria-label="Toggle color theme"
					onClick={toggleModelAtlasTheme}
				>
					<Sun className="theme-icon-light" aria-hidden="true" />
					<Moon className="theme-icon-dark" aria-hidden="true" />
				</button>
			</div>
		</header>
	);
}
