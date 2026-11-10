/** Browser-side PNG renderer for dashboard captures: a research region or the model sheet restaged in an off-screen frame as wide as the export, so a phone saves the same image as a desktop, or an export-only surface such as the leaderboard's captured as it is. */

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

/** Filesystem-safe filename token for a visible capture option: `"GPT-5 (high)"` → `"gpt-5-high"`. */
export function captureFileToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Render one dashboard element at its deterministic CSS pixel dimensions.
 * A copy staged at `captureWidth` only restyles the live markup, so `onStaged` lets the surface redraw whatever it measured to its on-screen width, such as a plot, for the copy's own width before the image renders.
 */
export async function downloadElementPng(
  element: HTMLElement,
  fileName: string,
  captureWidth?: number,
  onStaged?: (staged: HTMLElement, live: HTMLElement) => void,
): Promise<void> {
  const rendererPromise = import("html-to-image");
  await document.fonts.ready;
  const stagedCapture = captureWidth == null ? null : await stageCapture(element, captureWidth);
  const captureElement = stagedCapture?.element ?? element;
  let blob: Blob | null;
  try {
    if (stagedCapture != null) onStaged?.(stagedCapture.element, element);
    // Fonts load as text is laid out, so the frame lays its copy out before waiting on them.
    captureElement.getBoundingClientRect();
    const [{ toBlob }] = await Promise.all([
      rendererPromise,
      captureElement.ownerDocument.fonts.ready,
      waitForImages(captureElement),
    ]);
    const backgroundColor = captureBackgroundColor(captureElement);
    const restoreSvgStyles = materializeSvgStyles(captureElement);
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
    }
  } finally {
    stagedCapture?.remove();
  }
  if (blob == null) {
    throw new Error("PNG rendering returned no image data.");
  }
  downloadBlob(blob, `${fileName}.png`);
}

/**
 * Copy `element` into an off-screen frame `width` pixels wide, so media queries answer for the frame rather than the viewer's screen and the copy takes the layout and type sizes a window of that width gives it.
 * The frame repeats the page's stylesheets and the element's ancestors, shallowly, so every selector and inherited token that reaches the element on the page reaches the copy.
 */
async function stageCapture(element: HTMLElement, width: number) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.top = "0";
  frame.style.left = CAPTURE_STAGE_OFFSET;
  frame.style.width = `${width}px`;
  frame.style.border = "0";
  frame.srcdoc = "<!doctype html><title>Capture</title>";
  const frameLoaded = new Promise((resolve) =>
    frame.addEventListener("load", resolve, { once: true }),
  );
  document.body.append(frame);
  try {
    await frameLoaded;
    const frameDocument = frame.contentDocument;
    if (frameDocument == null) throw new Error("The capture frame has no document.");
    // The root's attributes carry the theme.
    for (const { name, value } of Array.from(document.documentElement.attributes)) {
      frameDocument.documentElement.setAttribute(name, value);
    }
    const stylesheetsLoaded = Array.from(
      document.head.querySelectorAll('link[rel="stylesheet"], style'),
      (source) => {
        const sheet = frameDocument.importNode(source, true);
        const loaded = source instanceof HTMLLinkElement ? stylesheetLoaded(sheet) : null;
        frameDocument.head.append(sheet);
        return loaded;
      },
    );
    // The copy joins the frame once its styles apply, so its first style is final instead of a transition from the browser's defaults.
    await Promise.all(stylesheetsLoaded);
    let parent: Element = frameDocument.body;
    for (const ancestor of ancestorsBelowBody(element)) {
      parent = parent.appendChild(frameDocument.importNode(ancestor, false));
    }
    // A fixed stage lets the copy take its own width whatever layout its ancestors set.
    const stage = frameDocument.createElement("div");
    stage.style.position = "fixed";
    stage.style.top = "0";
    stage.style.left = "0";
    stage.style.width = `${width}px`;
    const captureElement = frameDocument.importNode(element, true);
    captureElement.dataset.captureLayout = "artifact";
    captureElement.style.width = `${width}px`;
    captureElement.style.maxWidth = "none";
    captureElement.style.margin = "0";
    // Parts left out of the image leave the copy before layout, so they leave no gap behind.
    captureElement.querySelectorAll("[data-capture-exclude]").forEach((node) => {
      node.remove();
    });
    // Lazy images never start loading in an off-screen frame, so the copy asks for every image now.
    captureElement.querySelectorAll("img").forEach((image) => {
      image.loading = "eager";
    });
    stage.append(captureElement);
    parent.append(stage);
    return {
      element: captureElement,
      remove: () => frame.remove(),
    };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

function stylesheetLoaded(link: Element): Promise<void> {
  return new Promise((resolve, reject) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener(
      "error",
      () =>
        reject(
          new Error(`Stylesheet ${link.getAttribute("href")} failed to load for the capture.`),
        ),
      { once: true },
    );
  });
}

/** The element's ancestors from the one inside `<body>` down to its parent. */
function ancestorsBelowBody(element: HTMLElement): Element[] {
  const ancestors: Element[] = [];
  for (
    let node = element.parentElement;
    node != null && node !== document.body;
    node = node.parentElement
  ) {
    ancestors.unshift(node);
  }
  return ancestors;
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

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
