"use client";

/** Scroll-synchronized navigation tree for the active methodology document. */

import { useEffect, useRef, useState } from "react";

import type { TableOfContentsItem } from "./documents";
import styles from "./methodology.module.css";

export function DocumentOutline({
	items,
	onNavigate,
}: {
	items: TableOfContentsItem[];
	onNavigate?: () => void;
}) {
	const outlineRef = useRef<HTMLElement>(null);
	const [activeId, setActiveId] = useState(items[0]?.id ?? "");

	useEffect(() => {
		const headings = items.flatMap((item) => {
			const heading = document.getElementById(item.id);
			return heading == null ? [] : [heading];
		});
		if (headings.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const activeEntry = entries
					.filter((entry) => entry.isIntersecting)
					.sort(
						(left, right) =>
							left.boundingClientRect.top - right.boundingClientRect.top,
					)
					.at(-1);
				if (activeEntry?.target.id != null) {
					setActiveId(activeEntry.target.id);
				}
			},
			{ rootMargin: "0px 0px -78% 0px" },
		);

		for (const heading of headings) {
			observer.observe(heading);
		}
		return () => observer.disconnect();
	}, [items]);

	useEffect(() => {
		const activeLink = outlineRef.current?.querySelector<HTMLAnchorElement>(
			`a[href="#${CSS.escape(activeId)}"]`,
		);
		activeLink?.scrollIntoView({ block: "nearest" });
	}, [activeId]);

	return (
		<nav className={styles.outline} aria-label="On this page" ref={outlineRef}>
			<p className={styles.railLabel}>On this page</p>
			<ol>
				{items.map((item) => (
					<li key={item.id} data-level={item.level}>
						<a
							href={`#${item.id}`}
							aria-current={item.id === activeId ? "location" : undefined}
							onClick={onNavigate}
						>
							{item.label}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}
