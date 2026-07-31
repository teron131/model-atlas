"use client";

/**
 * THESIS: Live model evidence becomes the dashboard material instead of sitting inside a decorative hero card.
 * OWN-WORLD: Mineral paper or blue-charcoal fields, provider pigments, square measurement controls, and four-score geometry.
 * STORY: Read the leading filtered models, see which scores control the material, then continue into the same evidence in the table and charts.
 * FIRST VIEWPORT: The shared header leads directly into a full-width generative field with factual copy, three material alternatives, and a five-model rail.
 * FORM: Living Evidence Field, adapted from the selected reference; Evidence Field is the default while Phase Ledger and Signal Type remain equal alternatives.
 */

import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import {
  applyModelAtlasTheme,
  currentModelAtlasTheme,
  type ModelAtlasTheme,
} from "../../shared/theme";
import { BotIcon, BrainIcon, DollarIcon } from "../shared/DashboardIcons";
import {
  type MaterialPalette,
  type MaterialPointer,
  renderMaterial,
  stepMaterialPointer,
} from "./material";
import { type SignatureMode, signatureModeLabels, signatureModels } from "./models";

import styles from "./signature.module.css";

const MATERIAL_MODEL_LIMIT = 5;
const MATERIAL_FRAME_INTERVAL_MS = 1_000 / 30;
const MATERIAL_VISIBILITY_MARGIN_PX = 120;
const DEFAULT_DARK_MODE: SignatureMode = "phase";

/**
 * Each material was authored against one page field: Evidence Field on mineral paper, Phase Ledger
 * and Signal Type on blue charcoal. Mode and theme therefore move together, but the root attribute
 * stays authoritative so the saved theme survives a reload and the header toggle keeps working.
 */
function themeForMode(mode: SignatureMode): ModelAtlasTheme {
  return mode === "field" ? "light" : "dark";
}

export function ModelSignature({ models }: { models: ModelAtlasModel[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const pointerRef = useRef<MaterialPointer>({
    active: false,
    energy: 0,
    phase: 0,
    targetX: 0,
    targetY: 0,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
  });
  const [mode, setMode] = useState<SignatureMode>("field");
  const [paused, setPaused] = useState(false);
  const lastDarkModeRef = useRef<SignatureMode>(DEFAULT_DARK_MODE);
  const signatureModelRows = useMemo(() => signatureModels(models, MATERIAL_MODEL_LIMIT), [models]);

  // Adopt the saved theme on mount, then follow any later theme change from the header toggle.
  useEffect(() => {
    const root = document.documentElement;
    const adoptTheme = () => {
      const theme = currentModelAtlasTheme();
      setMode((current) =>
        themeForMode(current) === theme
          ? current
          : theme === "light"
            ? "field"
            : lastDarkModeRef.current,
      );
    };
    adoptTheme();
    const observer = new MutationObserver(adoptTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-model-atlas-theme"] });
    return () => observer.disconnect();
  }, []);

  const selectMode = (nextMode: SignatureMode) => {
    if (nextMode !== "field") {
      lastDarkModeRef.current = nextMode;
    }
    setMode(nextMode);
    applyModelAtlasTheme(themeForMode(nextMode));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (canvas == null || stage == null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context == null) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    let lastRenderTime = 0;
    let previousTime = performance.now();
    let visible =
      stage.getBoundingClientRect().bottom >= -MATERIAL_VISIBILITY_MARGIN_PX &&
      stage.getBoundingClientRect().top <= window.innerHeight + MATERIAL_VISIBILITY_MARGIN_PX;
    let width = 1;
    let height = 1;
    let palette = readPalette(stage);
    const resolveModelColors = () =>
      signatureModelRows.map((model) => ({
        ...model,
        color: resolveCanvasColor(model.color),
      }));
    let resolvedModels = resolveModelColors();

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(density, 0, 0, density, 0, 0);
      lastRenderTime = 0;
    };
    const canAnimate = () =>
      !paused && !reducedMotion && visible && document.visibilityState === "visible";
    const renderFrame = (now: number) => {
      const frameScale = Math.max(0.5, Math.min(2, (now - previousTime) / 16.667));
      previousTime = now;
      stepMaterialPointer(pointerRef.current, frameScale);
      renderMaterial({
        context,
        width,
        height,
        time: reducedMotion ? 2.35 : now * 0.00042,
        mode,
        models: resolvedModels,
        pointer: pointerRef.current,
        palette,
      });
      lastRenderTime = now;
    };
    const scheduleAnimation = () => {
      if (animationFrame === 0 && canAnimate()) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };
    const draw = (now: number) => {
      animationFrame = 0;
      if (!canAnimate()) {
        return;
      }
      if (lastRenderTime === 0 || now - lastRenderTime >= MATERIAL_FRAME_INTERVAL_MS) {
        renderFrame(now);
      }
      scheduleAnimation();
    };
    const renderIfVisible = () => {
      if (!visible) {
        return;
      }
      renderFrame(performance.now());
      scheduleAnimation();
    };
    const syncAnimation = () => {
      if (canAnimate()) {
        scheduleAnimation();
        return;
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };
    const refreshTheme = () => {
      palette = readPalette(stage);
      resolvedModels = resolveModelColors();
      renderIfVisible();
    };

    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (paused || reducedMotion) {
        renderIfVisible();
      }
    });
    resizeObserver.observe(stage);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        const nextVisible = entry?.isIntersecting ?? false;
        if (visible === nextVisible) {
          return;
        }
        visible = nextVisible;
        lastRenderTime = 0;
        if (visible) {
          renderIfVisible();
        } else {
          syncAnimation();
        }
      },
      { rootMargin: `${MATERIAL_VISIBILITY_MARGIN_PX}px 0px` },
    );
    visibilityObserver.observe(stage);
    const handleDocumentVisibility = () => {
      lastRenderTime = 0;
      if (document.visibilityState === "visible") {
        renderIfVisible();
      } else {
        syncAnimation();
      }
    };
    document.addEventListener("visibilitychange", handleDocumentVisibility);
    const themeObserver = new MutationObserver(refreshTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-model-atlas-theme"],
    });
    renderIfVisible();
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleDocumentVisibility);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [mode, paused, signatureModelRows]);

  const syncPointer = (event: PointerEvent<HTMLElement>, immediate = false) => {
    const stage = stageRef.current;
    if (stage == null) {
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const pointer = pointerRef.current;
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    if (immediate || pointer.energy < 0.002) {
      pointer.x = x;
      pointer.y = y;
    }
    pointer.targetX = x;
    pointer.targetY = y;
    pointer.active = true;
  };

  return (
    <section
      className={styles.signature}
      data-mode={mode}
      ref={stageRef}
      aria-labelledby="model-signature-title"
      onPointerEnter={(event) => syncPointer(event, true)}
      onPointerMove={(event) => syncPointer(event)}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
    >
      <canvas className={styles.canvas} ref={canvasRef} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.modeBar}>
        <span className={styles.modeLabel}>Material view</span>
        <div className={styles.modeOptions} role="group" aria-label="Model signature material">
          {(Object.keys(signatureModeLabels) as SignatureMode[]).map((signatureMode) => (
            <button
              type="button"
              className={styles.modeButton}
              aria-pressed={mode === signatureMode}
              key={signatureMode}
              onClick={() => selectMode(signatureMode)}
            >
              {signatureModeLabels[signatureMode]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.copy}>
        <h2 id="model-signature-title">
          Different <span>ways to lead.</span>
        </h2>
        <div className={styles.scoreLeaders}>
          <p className={styles.scoreLeadersLabel}>Distinct model roles</p>
          <dl className={styles.scoreLeaderList}>
            {signatureModelRows.map((model) => (
              <div
                className={styles.scoreLeader}
                key={model.role}
                style={{ "--provider": model.color } as CSSProperties}
              >
                <dt>{model.role}</dt>
                <dd className={styles.scoreLeaderModel}>
                  <span className={styles.scoreLeaderIcon} aria-hidden="true">
                    {model.logo ? <img src={model.logo} alt="" width={14} height={14} /> : null}
                  </span>
                  <strong>{model.name}</strong>
                </dd>
                <dd className={styles.scoreLeaderValue}>
                  <span className="visually-hidden">
                    {accessibleSelectionMetric(model.selectionMetric)}
                  </span>
                  <span className={styles.scoreLeaderValueVisual} aria-hidden="true">
                    {selectionMetricParts(model.selectionMetric).map((part, index) =>
                      part.kind === "text" ? (
                        <span key={`${part.value}-${index}`}>{part.value}</span>
                      ) : (
                        <span
                          className={styles.scoreLeaderMetricIcon}
                          key={`${part.kind}-${index}`}
                        >
                          {part.kind === "intelligence" ? (
                            <BrainIcon />
                          ) : part.kind === "agentic" ? (
                            <BotIcon />
                          ) : (
                            <DollarIcon />
                          )}
                        </span>
                      ),
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <button
        className={styles.motionButton}
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused((current) => !current)}
      >
        {paused ? "Resume material" : "Pause material"}
      </button>
      <ol className={styles.modelRail} aria-label="Distinct model roles in the signature">
        {signatureModelRows.map((model) => (
          <li
            className={styles.modelItem}
            key={model.key}
            style={{ "--provider": model.color } as CSSProperties}
          >
            <span className={styles.rank}>{String(model.rank).padStart(2, "0")}</span>
            <span className={styles.providerIcon} aria-hidden="true">
              {model.logo ? <img src={model.logo} alt="" width={18} height={18} /> : null}
            </span>
            <span className={styles.modelCopy}>
              <span className={styles.modelRole}>{model.role}</span>
              <strong>{model.name}</strong>
              <span>
                {model.provider} · {model.selectionMetric}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

type SelectionMetricPart =
  | { kind: "agentic" | "intelligence" | "value" }
  | { kind: "text"; value: string };

function selectionMetricParts(metric: string): SelectionMetricPart[] {
  const metricKind = metric.startsWith("AGT ") ? "agentic" : "intelligence";
  const withoutPrefix = metric.replace(/^(?:AGT|INT) /, "");
  const priceStart = withoutPrefix.indexOf(" · $");
  if (priceStart === -1) {
    return [{ kind: metricKind }, { kind: "text", value: withoutPrefix }];
  }
  return [
    { kind: metricKind },
    { kind: "text", value: withoutPrefix.slice(0, priceStart) },
    { kind: "text", value: "·" },
    { kind: "value" },
    { kind: "text", value: withoutPrefix.slice(priceStart + 4) },
  ];
}

function accessibleSelectionMetric(metric: string): string {
  return metric
    .replace(/^INT /, "Intelligence ")
    .replace(/^AGT /, "Agentic ")
    .replace(" · $", " · Value $");
}

function readPalette(element: HTMLElement): MaterialPalette {
  const styles = window.getComputedStyle(element);
  return {
    background: styles.getPropertyValue("--paper").trim() || "#0b1016",
    ink: styles.getPropertyValue("--ink").trim() || "#f2f3ed",
    muted: styles.getPropertyValue("--muted").trim() || "#bbc1b7",
  };
}

function resolveCanvasColor(color: string): string {
  const match = color.match(/^var\((--[^)]+)\)$/);
  if (match?.[1]) {
    return (
      window.getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() ||
      "#f2f3ed"
    );
  }
  return color;
}
