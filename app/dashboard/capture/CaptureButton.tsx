/** Direct graph screenshot action. */

"use client";

import type { RefObject } from "react";
import { ScreenshotIcon } from "../shared/DashboardIcons";
import styles from "./capture.module.css";
import { captureFileToken } from "./png";
import { usePngCapture } from "./use-png";

/** Download a referenced graph panel while keeping the action itself out of the image. */
export function CaptureButton({
	targetRef,
	title,
	captureWidth,
	fileName,
}: {
	targetRef: RefObject<HTMLElement | null>;
	title: string;
	captureWidth: number;
	fileName?: string;
}) {
	const { capture, state } = usePngCapture(
		targetRef,
		fileName ?? `model-atlas-${captureFileToken(title)}`,
		captureWidth,
	);
	const label =
		state === "rendering"
			? `Rendering ${title} graph PNG`
			: state === "saved"
				? `${title} graph PNG saved`
				: state === "error"
					? `${title} graph PNG failed`
					: `Download ${title} graph PNG`;

	return (
		<button
			className={styles.graphButton}
			type="button"
			aria-label={label}
			aria-busy={state === "rendering"}
			data-state={state}
			data-capture-exclude
			disabled={state === "rendering"}
			title={label}
			onClick={() => void capture()}
		>
			<ScreenshotIcon />
		</button>
	);
}
