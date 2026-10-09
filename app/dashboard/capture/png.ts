/** Browser-side PNG renderer for dashboard panels and export-only leaderboard views. */

// Every export shares one width, wider only for a two-model comparison card, and renders at twice its CSS size so text stays sharp when shared or zoomed.
export const ARTIFACT_WIDTH = 1200;
export const WIDE_ARTIFACT_WIDTH = 1440;
const PNG_PIXEL_RATIO = 2;
const CAPTURE_STAGE_OFFSET = "-10000px";
// An image still loading after this long renders as an empty slot rather than holding the export.
const IMAGE_WAIT_MS = 5_000;
// A logo that fails to load renders as an empty slot, as it does on the page, instead of failing the whole export.
const MISSING_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
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
  const rendererPromise = import("html-to-image");
  await document.fonts.ready;
  const stagedCapture = captureWidth == null ? null : stageGraphRender(element, captureWidth);
  const captureElement = stagedCapture?.element ?? element;
  const [{ toBlob }] = await Promise.all([rendererPromise, waitForImages(captureElement)]);
  const backgroundColor = captureBackgroundColor(captureElement);
  const restoreSvgStyles = materializeSvgStyles(captureElement);
  let blob: Blob | null;
  try {
    blob = await toBlob(captureElement, {
      backgroundColor,
      cacheBust: true,
      imagePlaceholder: MISSING_IMAGE,
      filter: (node) => !(node instanceof Element) || !node.hasAttribute("data-capture-exclude"),
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
  // Parts left out of the image leave the clone before layout, so they leave no gap behind.
  captureElement.querySelectorAll("[data-capture-exclude]").forEach((node) => {
    node.remove();
  });
  // Lazy images never start loading in an off-screen stage, so the clone asks for every image now.
  captureElement.querySelectorAll("img").forEach((image) => {
    image.loading = "eager";
  });
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
function copyResolvedCustomProperties(source: HTMLElement, target: HTMLElement): void {
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
  const snapshots = Array.from(element.querySelectorAll<SVGElement>("svg *"), (node) => {
    const computedStyle = window.getComputedStyle(node);
    return {
      node,
      originalStyle: node.getAttribute("style"),
      resolvedStyles: SVG_STYLE_PROPERTIES.map((property) =>
        computedStyle.getPropertyValue(property),
      ),
    };
  });
  for (const { node, resolvedStyles } of snapshots) {
    for (const [propertyIndex, property] of SVG_STYLE_PROPERTIES.entries()) {
      node.style.setProperty(property, resolvedStyles[propertyIndex] ?? "");
    }
  }
  return () => {
    for (const { node, originalStyle } of snapshots) {
      if (originalStyle == null) {
        node.removeAttribute("style");
      } else {
        node.setAttribute("style", originalStyle);
      }
    }
  };
}

function captureBackgroundColor(element: HTMLElement): string {
  return window.getComputedStyle(element).getPropertyValue("--paper").trim() || "#080909";
}

/** Wait for image resources in the cloned surface so logos are present in the PNG, giving each a bounded time so one stuck image cannot hold the export. */
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
          window.setTimeout(resolve, IMAGE_WAIT_MS);
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
