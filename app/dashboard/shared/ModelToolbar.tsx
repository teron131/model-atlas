"use client";

/** Shared model search, provider filtering, display, and capture toolbar. */

import { Boxes } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { DisplayControls, type DisplayControlsProps } from "./DisplayControls";
import { toggleProviderFilter } from "./model-display";
import styles from "./model-toolbar.module.css";

type ProviderControlOption = {
	slug: string;
	label: string;
	count: number;
	logo: string;
};

type ProviderControl = {
	id: string;
	label: string;
	options: ProviderControlOption[];
	totalCount: number;
	selectedProviders: string[];
	onSelectedProvidersChange: (providers: string[]) => void;
};

/** Render the shared model-control layout without owning its filtering state. */
export function ModelToolbar({
	filterQuery,
	rowCountLabel,
	provider,
	display,
	screenshotControl,
	onFilterQueryChange,
}: {
	filterQuery: string;
	rowCountLabel: string | null;
	provider: ProviderControl;
	display: DisplayControlsProps;
	screenshotControl: ReactNode;
	onFilterQueryChange: (value: string) => void;
}) {
	return (
		<div className={styles.controls} data-capture-exclude>
			<div className={styles.row}>
				<input
					className={styles.search}
					type="search"
					autoComplete="off"
					spellCheck="false"
					placeholder="Filter models"
					value={filterQuery}
					onChange={(event) => onFilterQueryChange(event.target.value)}
				/>
				<div className={styles.provider}>
					<ProviderDropdown {...provider} />
				</div>
				<div className={styles.display}>
					<DisplayControls {...display} />
				</div>
				<div className={styles.meta}>
					{rowCountLabel == null ? null : (
						<div className={styles.count}>{rowCountLabel}</div>
					)}
					{screenshotControl}
				</div>
			</div>
		</div>
	);
}

/** Render a reusable multi-select provider menu. */
function ProviderDropdown({
	id,
	label,
	options,
	totalCount,
	selectedProviders,
	onSelectedProvidersChange,
}: {
	id: string;
	label: string;
	options: ProviderControlOption[];
	totalCount: number;
	selectedProviders: string[];
	onSelectedProvidersChange: (providers: string[]) => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const selectedOptions = options.filter((option) =>
		selectedProviders.includes(option.slug),
	);
	const summary =
		selectedOptions.length === 0
			? "All providers"
			: selectedOptions.length === 1
				? selectedOptions[0]?.label
				: `${selectedOptions.length} providers`;

	useEffect(() => {
		if (!open) {
			return;
		}
		const closeOutside = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", closeOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [open]);

	const toggleProvider = (provider: string) => {
		onSelectedProvidersChange(
			toggleProviderFilter(selectedProviders, provider),
		);
	};

	return (
		<div className={styles.dropdown} ref={rootRef}>
			<button
				type="button"
				className={styles.trigger}
				aria-controls={id}
				aria-expanded={open}
				onClick={() => setOpen((current) => !current)}
			>
				<span>Provider</span>
				<strong>{summary}</strong>
			</button>
			{open ? (
				<fieldset className={styles.menu} id={id}>
					<legend className="visually-hidden">{label}</legend>
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={selectedProviders.length === 0}
							onChange={() => onSelectedProvidersChange([])}
						/>
						<span className={styles.logo} aria-hidden="true">
							<Boxes strokeWidth={2.1} />
						</span>
						<span>All providers</span>
						<small>{totalCount}</small>
					</label>
					{options.map((option) => (
						<label className={styles.option} key={option.slug}>
							<input
								type="checkbox"
								checked={selectedProviders.includes(option.slug)}
								onChange={() => toggleProvider(option.slug)}
							/>
							<span className={styles.logo} aria-hidden="true">
								{option.logo ? (
									// biome-ignore lint/performance/noImgElement: Provider marks are tiny internal UI icons, not page content.
									<img src={option.logo} alt="" width={16} height={16} />
								) : (
									<span>{option.label.slice(0, 1)}</span>
								)}
							</span>
							<span>{option.label}</span>
							<small>{option.count}</small>
						</label>
					))}
				</fieldset>
			) : null}
		</div>
	);
}
