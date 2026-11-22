"use client";

/**
 * A chart's plot drawn as the hero's sky under the chart's SVG.
 * The stage stacks a WebGL canvas beneath the SVG and carries `data-sky` while the sky draws, so the SVG's own horizon, glows and star paint step aside; the light theme and browsers without WebGL keep the SVG's drawing.
 * `SkyStar` carries the same star to HTML marks that stand for a model outside the plots.
 */

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useModelAtlasTheme } from "../../../shared/theme";
import { useMediaQuery } from "../../../shared/use-media-query";
import { readSkyClock, skyPixelRatio } from "../../shared/sky-light";
import {
  createSkyRenderer,
  type SkyPlotScene,
  type SkyRenderer,
  type SkyStarRole,
  stillStarImage,
  stillStarSpan,
} from "./sky-renderer";

import styles from "../graphs.module.css";

// A saved image renders at twice its CSS size, so its sky draws at that density too.
const CAPTURE_PIXEL_RATIO = 2;
// Twinkle and the rim's pulse are slow, so ambient frames run at this interval; a settling flare renders every frame.
const AMBIENT_FRAME_MS = 1000 / 30;

/**
 * Draws `scene` synchronously whenever it changes, so a saved image's redraw can copy the canvas in the same task.
 * Ambient motion runs only while the stage is on screen and the page is visible, and stops under reduced motion, where the sky holds still at time zero.
 */
export function SkyPlot({
  scene,
  underlay,
  children,
}: {
  scene: SkyPlotScene;
  /** SVG marks at the scene's coordinates drawn beneath the stars, whose light lies over them; an open sky would cover them, so only a scene without sky takes them. */
  underlay?: ReactNode;
  children: ReactNode;
}) {
  const dark = useModelAtlasTheme() === "dark";
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<SkyRenderer | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const created = createSkyRenderer(canvas);
    if (created == null) return;
    const lose = () => setRenderer(null);
    canvas.addEventListener("webglcontextlost", lose);
    setRenderer(created);
    return () => {
      canvas.removeEventListener("webglcontextlost", lose);
      created.dispose();
      setRenderer(null);
    };
  }, [dark]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (renderer == null || stage == null) return;
    const capturing = stage.closest('[data-capture-layout="artifact"]') != null;
    renderer.setScene(scene, capturing ? CAPTURE_PIXEL_RATIO : skyPixelRatio());
    renderer.draw(still ? 0 : readSkyClock(performance.now()), still ? Infinity : 0);
  }, [renderer, scene, still]);

  useEffect(() => {
    const stage = stageRef.current;
    if (renderer == null || still || stage == null) return;
    let frame = 0;
    let visible = false;
    let settling = true;
    let last = performance.now();
    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (settling || now - last >= AMBIENT_FRAME_MS) {
        settling = renderer.draw(readSkyClock(now), (now - last) / 1000);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      if (frame === 0 && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      resume();
    });
    observer.observe(stage);
    document.addEventListener("visibilitychange", resume);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      cancelAnimationFrame(frame);
    };
  }, [renderer, still]);

  return (
    <div ref={stageRef} className={styles.skyStage} data-sky={renderer == null ? undefined : ""}>
      {underlay == null ? null : (
        <svg
          className={styles.skyUnderlay}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          aria-hidden="true"
        >
          {underlay}
        </svg>
      )}
      {dark ? <canvas ref={canvasRef} className={styles.skyCanvas} aria-hidden="true" /> : null}
      {children}
    </div>
  );
}

/**
 * A model's star outside the plots, as the hero register draws one: the plots' own star for `role` as a still image, centred where `className` places it.
 * It stays empty until the client has drawn the image, and where WebGL cannot run.
 */
export function SkyStar({
  color,
  role,
  className,
  style,
}: {
  color: string;
  role: SkyStarRole;
  /** Places the star; a CSS module's class may be missing from its typed map. */
  className: string | undefined;
  style?: CSSProperties;
}) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => setImage(stillStarImage(color, role)), [color, role]);
  const span = stillStarSpan(role);
  return (
    <span
      aria-hidden="true"
      className={className == null ? styles.skyStar : `${styles.skyStar} ${className}`}
      style={
        {
          ...style,
          width: span,
          height: span,
          "--sky-star": image == null ? "none" : `url(${image})`,
        } as CSSProperties
      }
    />
  );
}
