"use client";

/** Shared hover, filter, and summary UI for Model Atlas charts. */

import { Boxes } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useState } from "react";

import { fmtCompact } from "./format";
import styles from "./graphs.module.css";
import type { HoverState } from "./types";

export function HoverCard({ hover }: { hover: HoverState }) {
	const left = Math.min(Math.max(14, hover.left + 16), window.innerWidth - 280);
	const top = Math.min(Math.max(14, hover.top + 16), window.innerHeight - 210);
	return (
		<div
			className={styles.hoverCard}
			style={
				{
					"--hover-color": hover.color,
					transform: `translate3d(${left}px, ${top}px, 0)`,
				} as CSSProperties
			}
		>
			<div className={styles.hoverCardHead}>
				<span className={styles.hoverCardLogo}>
					{hover.logo ? (
						<Image
							src={hover.logo}
							alt=""
							width={26}
							height={26}
							loading="lazy"
							unoptimized
							onError={(event) => {
								event.currentTarget.hidden = true;
							}}
						/>
					) : null}
				</span>
				<div>
					<div className={styles.hoverCardTitle}>{hover.model}</div>
					<div className={styles.hoverCardProvider}>{hover.provider}</div>
				</div>
			</div>
			<div className={styles.hoverCardRows}>
				{hover.rows.map(([label, value]) => (
					<div key={label} className={styles.hoverCardRow}>
						<span>{label}</span>
						<span>{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function EmptyChart({
	message = "No models match the current filters.",
}: {
	message?: string;
}) {
	return <div className={styles.error}>{message}</div>;
}

export function FilterButton({
	active,
	color,
	logo,
	label,
	count,
	onClick,
}: {
	active: boolean;
	color: string;
	logo?: string;
	label: string;
	count: number;
	onClick: () => void;
}) {
	const [failedLogo, setFailedLogo] = useState<string | null>(null);
	const showLogo = logo && failedLogo !== logo;

	return (
		<button
			type="button"
			className={styles.filterButton}
			aria-pressed={active}
			style={{ "--provider-color": color } as CSSProperties}
			onClick={onClick}
		>
			<span className={styles.filterIcon} aria-hidden="true">
				{showLogo ? (
					// biome-ignore lint/performance/noImgElement: 16px internal provider icons are not LCP content, and next/image fails this static SSR path.
					<img
						className={styles.filterLogo}
						src={logo}
						alt=""
						width={16}
						height={16}
						loading="lazy"
						onError={() => {
							setFailedLogo(logo);
						}}
					/>
				) : logo ? (
					<span className={styles.filterIconFallback}>{label.slice(0, 1)}</span>
				) : (
					<Boxes className={styles.filterAllIcon} strokeWidth={2.1} />
				)}
			</span>
			<span>{label}</span>
			<span>{fmtCompact(count)}</span>
		</button>
	);
}

export function SummaryCard({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className={styles.summaryCard}>
			<div className={styles.summaryLabel}>{label}</div>
			<span className={styles.summaryValue}>{value}</span>
			<span className={styles.summaryDetail}>{detail}</span>
		</div>
	);
}
