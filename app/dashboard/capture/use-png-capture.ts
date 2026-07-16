"use client";

/** React state and lifecycle for rendering a referenced dashboard surface as a PNG. */

import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { downloadElementPng } from "./export-png";

export type CaptureState = "idle" | "rendering" | "saved" | "error";

/** Capture a referenced element while exposing compact progress and completion state. */
export function usePngCapture(
	targetRef: RefObject<HTMLElement | null>,
	fileName: string,
	captureWidth?: number,
) {
	const [state, setState] = useState<CaptureState>("idle");
	const resetTimeoutRef = useRef<number | null>(null);

	const capture = useCallback(async () => {
		const target = targetRef.current;
		if (target == null || state === "rendering") {
			return;
		}
		if (resetTimeoutRef.current != null) {
			window.clearTimeout(resetTimeoutRef.current);
		}
		setState("rendering");
		try {
			await downloadElementPng(target, fileName, captureWidth);
			setState("saved");
		} catch (error) {
			console.error("Unable to render PNG", error);
			setState("error");
		}
		resetTimeoutRef.current = window.setTimeout(() => {
			setState("idle");
			resetTimeoutRef.current = null;
		}, 1800);
	}, [captureWidth, fileName, state, targetRef]);

	useEffect(() => {
		return () => {
			if (resetTimeoutRef.current != null) {
				window.clearTimeout(resetTimeoutRef.current);
			}
		};
	}, []);

	return { capture, state };
}
