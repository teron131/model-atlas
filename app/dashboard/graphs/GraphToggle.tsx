import type { ReactNode } from "react";

import styles from "./graphs.module.css";

type GraphToggleOption<TKey extends string> = {
	key: TKey;
	label: ReactNode;
	detail?: ReactNode;
	disabled?: boolean;
};

export function GraphToggle<TKey extends string>({
	legend,
	options,
	selectedKey,
	onSelect,
	layout = "inline",
}: {
	legend: string;
	options: Array<GraphToggleOption<TKey>>;
	selectedKey: TKey;
	onSelect: (key: TKey) => void;
	layout?: "inline" | "stacked";
}) {
	const className =
		layout === "stacked"
			? `${styles.metricToggle} ${styles.metricToggleStacked}`
			: styles.metricToggle;

	return (
		<fieldset className={className}>
			<legend className={styles.visuallyHidden}>{legend}</legend>
			{options.map((option) => (
				<button
					key={option.key}
					type="button"
					aria-pressed={option.key === selectedKey}
					disabled={option.disabled}
					onClick={() => onSelect(option.key)}
				>
					{option.detail == null ? (
						option.label
					) : (
						<>
							<span className={styles.metricToggleDetail}>{option.detail}</span>
							<b className={styles.metricToggleLabel}>{option.label}</b>
						</>
					)}
				</button>
			))}
		</fieldset>
	);
}
