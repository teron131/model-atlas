/** Direct PNG capture for the leaderboard's currently visible four-score rows. */

"use client";

import { useRef } from "react";
import { ScreenshotIcon } from "../shared/DashboardIcons";
import { scoreMetricColumns, scoreSortableColumns } from "../table/Columns";
import type { SortState, TableRow } from "../table/models";
import { ScoreModelRow } from "../table/Rows";
import styles from "./capture.module.css";
import { usePngCapture } from "./use-png";

/** Render the visible leaderboard row selection as the compact four-score PNG. */
export function LeaderboardCapture({
	rows,
	rowKind,
	sortState,
}: {
	rows: TableRow[];
	rowKind: "models" | "variants";
	sortState: SortState;
}) {
	const captureRef = useRef<HTMLDivElement>(null);
	const { capture, state } = usePngCapture(
		captureRef,
		`model-atlas-leaderboard-top-${rows.length}-${rowKind}`,
	);
	const label =
		state === "rendering"
			? "Rendering leaderboard PNG"
			: state === "saved"
				? "Leaderboard PNG saved"
				: state === "error"
					? "Leaderboard PNG failed"
					: "Screenshot";

	return (
		<div className={styles.leaderboardCapture} data-capture-exclude>
			<button
				className={styles.leaderboardButton}
				type="button"
				aria-label={label}
				aria-busy={state === "rendering"}
				data-state={state}
				disabled={state === "rendering" || rows.length === 0}
				title={label}
				onClick={() => void capture()}
			>
				<ScreenshotIcon />
			</button>
			<div className={styles.stage} aria-hidden="true" inert>
				<div className={styles.leaderboard} ref={captureRef}>
					<table>
						<colgroup>
							<col className={styles.rankColumn} />
							<col className={styles.modelColumn} />
							{scoreMetricColumns.map((column) => (
								<col className={styles.scoreColumn} key={column.key} />
							))}
						</colgroup>
						<thead>
							<tr>
								{scoreSortableColumns.map((column) => (
									<th
										className={column.className}
										data-sort-state={
											column.key === sortState.key
												? sortState.direction
												: undefined
										}
										key={column.key}
										scope="col"
									>
										<span className={styles.captureHeader}>
											{column.label}
											<span className="sort-indicator" aria-hidden="true" />
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<ScoreModelRow
									key={`${row.originalIndex}-${row.model.reasoning_effort ?? ""}`}
									rowData={row}
								/>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
