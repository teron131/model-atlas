/** Section wrapper used by dashboard graph panels. */

import type { ReactNode } from "react";

import styles from "./graphs.module.css";

export function Panel({
	kicker,
	title,
	copy,
	chips,
	summary,
	children,
	note,
	wide = false,
}: {
	kicker?: string;
	title: string;
	copy?: string;
	chips?: string[];
	summary?: ReactNode;
	children: ReactNode;
	note?: ReactNode;
	wide?: boolean;
}) {
	const showChips = chips != null && chips.length > 0;
	const panelClassName = [
		styles.panel,
		wide ? styles.wide : null,
		kicker ? null : styles.noKicker,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<article className={panelClassName}>
			<div className={styles.panelHead}>
				<div className={styles.panelMeta}>
					{kicker ? <p className={styles.chartKicker}>{kicker}</p> : null}
					{summary != null || showChips ? (
						<div className={styles.panelSide}>
							{showChips ? (
								<div className={styles.chips}>
									{chips.map((chip) => (
										<span key={chip} className={styles.chip}>
											{chip}
										</span>
									))}
								</div>
							) : null}
							{summary}
						</div>
					) : null}
				</div>
				<div className={styles.panelTitleBlock}>
					<div className={styles.panelTitleWrap}>
						<h2>{title}</h2>
					</div>
					{copy ? <p className={styles.panelCopy}>{copy}</p> : null}
				</div>
			</div>
			{children}
			{note ? <div className={styles.note}>{note}</div> : null}
		</article>
	);
}
