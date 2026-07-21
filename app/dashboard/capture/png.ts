/** Browser-side PNG renderer for dashboard panels and export-only leaderboard views. */

const PNG_PIXEL_RATIO = 1;
const CAPTURE_STAGE_OFFSET = "-10000px";
const SVG_STYLE_PROPERTIES = [
	"color",
	"display",
	"fill",
	"filter",
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"opacity",
	"paint-order",
	"stroke",
	"stroke-dasharray",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-width",
	"text-transform",
	"visibility",
] as const;

/** Normalize a visible capture option into a filesystem-safe filename token. */
export function captureFileToken(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Render one dashboard element at its deterministic CSS pixel dimensions. */
export async function downloadElementPng(
	element: HTMLElement,
	fileName: string,
	captureWidth?: number,
): Promise<void> {
	await document.fonts.ready;
	const stagedCapture =
		captureWidth == null ? null : stageGraphRender(element, captureWidth);
	const captureElement = stagedCapture?.element ?? element;
	await waitForImages(captureElement);
	const { toBlob } = await import("html-to-image");
	const backgroundColor = captureBackgroundColor(captureElement);
	const restoreSvgStyles = materializeSvgStyles(captureElement);
	let blob: Blob | null;
	try {
		blob = await toBlob(captureElement, {
			backgroundColor,
			cacheBust: true,
			filter: (node) =>
				!(node instanceof Element) ||
				!node.hasAttribute("data-capture-exclude"),
			pixelRatio: PNG_PIXEL_RATIO,
			width: captureWidth,
		});
	} finally {
		restoreSvgStyles();
		stagedCapture?.remove();
	}
	if (blob == null) {
		throw new Error("PNG rendering returned no image data.");
	}
	downloadBlob(blob, `${fileName}.png`);
}

/** Render a graph panel clone at its intrinsic artifact width outside the responsive browser layout. */
function stageGraphRender(element: HTMLElement, width: number) {
	const stage = document.createElement("div");
	stage.style.position = "fixed";
	stage.style.top = "0";
	stage.style.left = CAPTURE_STAGE_OFFSET;
	stage.style.width = `${width}px`;
	stage.style.pointerEvents = "none";
	stage.style.zIndex = "-1";
	const captureElement = element.cloneNode(true) as HTMLElement;
	copyResolvedCustomProperties(element, captureElement);
	captureElement.dataset.captureLayout = "artifact";
	captureElement.style.width = `${width}px`;
	captureElement.style.maxWidth = "none";
	captureElement.style.margin = "0";
	stage.append(captureElement);
	(
		element.closest("[data-capture-theme]") ??
		element.closest(".dashboard-main") ??
		document.body
	).append(stage);
	return {
		element: captureElement,
		remove: () => stage.remove(),
	};
}

/** Preserve inherited theme tokens when the capture root is moved outside its CSS-module ancestor. */
function copyResolvedCustomProperties(
	source: HTMLElement,
	target: HTMLElement,
): void {
	const sourceStyle = window.getComputedStyle(source);
	for (let index = 0; index < sourceStyle.length; index += 1) {
		const property = sourceStyle.item(index);
		if (!property.startsWith("--")) {
			continue;
		}
		target.style.setProperty(
			property,
			sourceStyle.getPropertyValue(property),
			sourceStyle.getPropertyPriority(property),
		);
	}
}

/** Inline computed SVG presentation styles because the renderer deep-clones SVG children without decorating them. */
function materializeSvgStyles(element: HTMLElement): () => void {
	const styledElements = Array.from(
		element.querySelectorAll<SVGElement>("svg *"),
	);
	const originalStyles = styledElements.map((node) =>
		node.getAttribute("style"),
	);
	for (const node of styledElements) {
		const computedStyle = window.getComputedStyle(node);
		for (const property of SVG_STYLE_PROPERTIES) {
			node.style.setProperty(
				property,
				computedStyle.getPropertyValue(property),
			);
		}
	}
	return () => {
		for (const [index, node] of styledElements.entries()) {
			const originalStyle = originalStyles[index];
			if (originalStyle == null) {
				node.removeAttribute("style");
			} else {
				node.setAttribute("style", originalStyle);
			}
		}
	};
}

function captureBackgroundColor(element: HTMLElement): string {
	return (
		window.getComputedStyle(element).getPropertyValue("--paper").trim() ||
		"#080909"
	);
}

/** Wait for image resources in the cloned surface so logos are present in the PNG. */
async function waitForImages(element: HTMLElement): Promise<void> {
	await Promise.all(
		Array.from(element.querySelectorAll("img")).map(
			(image) =>
				new Promise<void>((resolve) => {
					if (image.complete) {
						resolve();
						return;
					}
					image.addEventListener("load", () => resolve(), { once: true });
					image.addEventListener("error", () => resolve(), { once: true });
				}),
		),
	);
}

/** Trigger the browser download and release the temporary object URL afterward. */
function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.download = fileName;
	link.href = url;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
