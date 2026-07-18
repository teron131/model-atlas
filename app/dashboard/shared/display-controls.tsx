"use client";

/** Shared Top-N and variant controls for model data surfaces. */

import { type CSSProperties, useState } from "react";
import styles from "./display-controls.module.css";

export const MINIMUM_DISPLAY_ITEMS = 3;
export const DEFAULT_DISPLAY_ITEMS = 30;

const variantOptions = [
	{ expanded: false, label: "Collapsed" },
	{ expanded: true, label: "Expanded" },
];

/** Keep a requested display count inside the available data-backed range. */
export function clampDisplayLimit(limit: number, maximum: number): number {
	if (maximum <= 0) {
		return 0;
	}
	const minimum = Math.min(MINIMUM_DISPLAY_ITEMS, maximum);
	return Math.min(Math.max(limit, minimum), maximum);
}

/** Clamp the rendered limit without discarding the user's requested value as filters change. */
export function useDisplayLimit(
	maximum: number,
): [number, (value: number) => void] {
	const [limit, setLimit] = useState(DEFAULT_DISPLAY_ITEMS);
	return [clampDisplayLimit(limit, maximum), setLimit];
}

export type DisplayControlsProps = {
	id: string;
	label: string;
	itemKind: "models" | "variants";
	maximum: number;
	value: number;
	onValueChange: (value: number) => void;
	variantControl?: {
		expanded: boolean;
		onExpandedChange: (expanded: boolean) => void;
	};
};

/** Render the shared compact Top-N and variant toolbar. */
export function DisplayControls({
	id,
	label,
	itemKind,
	maximum,
	value,
	onValueChange,
	variantControl,
}: DisplayControlsProps) {
	const minimum = Math.min(MINIMUM_DISPLAY_ITEMS, maximum);
	const progress =
		maximum <= minimum ? 0 : ((value - minimum) / (maximum - minimum)) * 100;
	const sliderStyle = {
		"--display-slider-progress": `${progress}%`,
	} as CSSProperties;

	return (
		<fieldset className={styles.controls} data-capture-exclude>
			<legend className={styles.visuallyHidden}>{label}</legend>
			<label className={styles.limit} htmlFor={id}>
				<strong>Top {value}</strong>
				<small>{`of ${maximum} ${itemKind}`}</small>
			</label>
			<div className={styles.range}>
				<input
					className={styles.slider}
					id={id}
					type="range"
					min={minimum}
					max={maximum}
					step={1}
					value={value}
					disabled={maximum === 0}
					style={sliderStyle}
					onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
				/>
			</div>
			{variantControl == null ? null : (
				<div className={styles.variants}>
					<span>Variants</span>
					<div className={styles.variantOptions}>
						{variantOptions.map((option) => (
							<button
								className={styles.variantOption}
								type="button"
								aria-pressed={variantControl.expanded === option.expanded}
								key={option.label}
								onClick={() => variantControl.onExpandedChange(option.expanded)}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			)}
		</fieldset>
	);
}
