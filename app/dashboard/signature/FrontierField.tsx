"use client";

/** One fixed WebGL layer renders the frontier sky behind the dashboard and runs its scroll-driven camera. */

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { clamp01 } from "../../../src/model-atlas/math-utils";
import {
  CAMERA_DISTANCE,
  createSky,
  FIELD_OF_VIEW,
  type SkyFrame,
  type SkyLabel,
  type SkyStar,
} from "./sky-scene";

import styles from "./signature.module.css";

const INTRO_DURATION = 2600;
// Half the space a named star's rays occupy on screen, and the gap between those rays and its name.
const STAR_CLEARANCE = 12;
const LABEL_GAP = 5;
const LABEL_HEIGHT = 12;
// Names keep this far inside the window's sides.
const LABEL_EDGE = 8;
// How close the pointer must come to a star to identify it, and how far into the scroll stars stay explorable.
const STAR_REACH = 16;
const EXPLORE_UNTIL = 0.35;
// Ambient twinkle is slow; past the hero it only needs a low cadence, while scrolling always renders at full rate.
const HERO_FRAME_INTERVAL = 1000 / 24;
const FIELD_FRAME_INTERVAL = 1000 / 12;

/**
 * Scroll scopes the camera from the hero horizon into the star field and back; ambient twinkle stops while the page is hidden.
 *
 * In the hero, pointing near a star identifies its model, clicking it reports its key through `onSelectStar`, and `focusKey` lets the register light a role's star.
 * `horizon` is where the hero places its horizon, in CSS pixels from the top of the viewport at rest.
 * Reduced motion keeps the hero composition still: no camera travel, parallax, or twinkle.
 */
export function FrontierField({
  stars,
  focusKey,
  horizon,
  heroRef,
  onSelectStar,
}: {
  stars: SkyStar[];
  focusKey: string | null;
  horizon: number | null;
  heroRef: RefObject<HTMLElement | null>;
  onSelectStar: (key: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef(stars);
  const focusKeyRef = useRef(focusKey);
  const onSelectStarRef = useRef(onSelectStar);
  const horizonRef = useRef(horizon);
  const skyRef = useRef<ReturnType<typeof createSky> | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const labelElements = useRef(new Map<string, HTMLSpanElement>());
  const [ready, setReady] = useState(false);
  const labels = useMemo(
    () => stars.flatMap((star) => (star.label == null ? [] : [star.label])),
    [stars],
  );

  useEffect(() => {
    starsRef.current = stars;
    skyRef.current?.setStars(stars);
    invalidateRef.current?.();
  }, [stars]);

  useEffect(() => {
    onSelectStarRef.current = onSelectStar;
  }, [onSelectStar]);

  useEffect(() => {
    focusKeyRef.current = focusKey;
    invalidateRef.current?.();
  }, [focusKey]);

  useEffect(() => {
    horizonRef.current = horizon;
    skyRef.current?.setHorizon(horizon);
    invalidateRef.current?.();
  }, [horizon]);

  useEffect(() => {
    const host = hostRef.current;
    const hero = heroRef.current;
    if (!host || !hero) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    } catch {
      // The CSS atmosphere beneath the canvas remains as the static field.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x02040f, 1);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 200);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    const sky = createSky(scene, camera);
    sky.setHorizon(horizonRef.current);
    sky.setStars(starsRef.current);
    skyRef.current = sky;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frameState: SkyFrame = {
      time: 0,
      intro: 0,
      progress: 0,
      flight: 0,
      scroll: 0,
      unitsPerPixel: 1,
      width: 1,
      height: 1,
    };
    let introStart = performance.now();
    let lastNow = introStart;
    let lastRender = 0;
    let frame = 0;
    let dirty = true;
    let lost = false;
    let pointerX = 0;
    let pointerY = 0;
    let pointer: { x: number; y: number } | null = null;
    let cardKey: string | null = null;
    let hoveredKey: string | null = null;

    const ambient = () => !motion.matches && !document.hidden;
    const easePointer = (elapsed: number) => {
      const step = 1 - Math.exp(-elapsed * 0.003);
      const targetX = motion.matches ? 0 : pointerX * 0.22;
      const targetY = motion.matches ? 0 : -pointerY * 0.12;
      if (Math.abs(targetX - camera.position.x) + Math.abs(targetY - camera.position.y) < 0.0005) {
        return false;
      }
      camera.position.x += (targetX - camera.position.x) * step;
      camera.position.y += (targetY - camera.position.y) * step;
      return true;
    };

    const render = (now: number) => {
      const scroll = Math.max(0, window.scrollY);
      const heroEnd = Math.max(1, (hero.getBoundingClientRect().bottom + scroll) * 0.85);
      const pageRemainder = document.documentElement.scrollHeight - heroEnd - frameState.height;
      frameState.intro = motion.matches ? 1 : clamp01((now - introStart) / INTRO_DURATION);
      frameState.scroll = scroll;
      frameState.unitsPerPixel =
        (2 * CAMERA_DISTANCE * Math.tan((FIELD_OF_VIEW / 360) * Math.PI)) / frameState.height;
      frameState.progress = motion.matches ? 0 : clamp01(scroll / heroEnd);
      frameState.flight = motion.matches
        ? 0
        : clamp01((scroll - heroEnd) / Math.max(1, pageRemainder));
      sky.update(frameState);
      renderer.render(scene, camera);
      placeLabels(sky.labels());
      exploreStars();
      return frameState.intro < 1;
    };

    /** Put each name beside its star, inside the window, without covering another name or star: right, left, then below or above. */
    const placeLabels = (entries: SkyLabel[]) => {
      const occupied = entries.map(({ x, y }) => ({
        left: x - STAR_CLEARANCE,
        top: y - STAR_CLEARANCE,
        right: x + STAR_CLEARANCE,
        bottom: y + STAR_CLEARANCE,
      }));
      for (const entry of [...entries].sort((left, right) => left.y - right.y)) {
        const element = labelElements.current.get(entry.label);
        if (element == null) continue;
        const width = element.offsetWidth;
        const beside = STAR_CLEARANCE + LABEL_GAP;
        const offsets = [
          [beside, -LABEL_HEIGHT / 2],
          [-beside - width, -LABEL_HEIGHT / 2],
          [beside - STAR_CLEARANCE, beside],
          [beside - STAR_CLEARANCE, -beside - LABEL_HEIGHT],
        ] as const;
        const boxes = offsets.map(([dx, dy]) => ({
          left: entry.x + dx,
          top: entry.y + dy,
          right: entry.x + dx + width,
          bottom: entry.y + dy + LABEL_HEIGHT,
        }));
        type Box = (typeof boxes)[number];
        const inside = (box: Box) =>
          box.left >= LABEL_EDGE && box.right <= frameState.width - LABEL_EDGE;
        const clear = (box: Box) =>
          occupied.every(
            (other) =>
              box.right <= other.left ||
              box.left >= other.right ||
              box.bottom <= other.top ||
              box.top >= other.bottom,
          );
        // A name never leaves the window; crowding another name is the lesser fault.
        const free =
          boxes.find((box) => inside(box) && clear(box)) ?? boxes.find(inside) ?? boxes[0]!;
        occupied.push(free);
        element.style.transform = `translate3d(${free.left.toFixed(1)}px, ${free.top.toFixed(1)}px, 0)`;
        element.style.opacity = entry.opacity.toFixed(3);
      }
    };

    /** Focus the star under the pointer, or the register's role, and keep its identification card beside it. */
    const exploreStars = () => {
      const card = cardRef.current;
      const exploring = frameState.progress < EXPLORE_UNTIL && frameState.intro >= 1;
      const hovered =
        exploring && pointer != null ? sky.nearest(pointer.x, pointer.y, STAR_REACH) : null;
      hoveredKey = hovered == null ? null : (sky.stars()[hovered]?.key ?? null);
      const linked = exploring
        ? sky.stars().findIndex((star) => star.key === focusKeyRef.current)
        : -1;
      sky.setFocus(hovered ?? (linked === -1 ? null : linked));
      const focus = sky.focusPoint();
      if (card == null) return;
      if (focus == null) {
        card.dataset.visible = "false";
        return;
      }
      if (focus.star.key !== cardKey) {
        cardKey = focus.star.key;
        const fill = (field: string, text: string) => {
          const element = card.querySelector(`[data-field="${field}"]`);
          if (element != null) element.textContent = text;
        };
        fill("name", focus.star.name);
        fill("provider", focus.star.provider);
        fill("intelligence", focus.star.intelligence.toFixed(1));
        fill("released", focus.star.released);
      }
      const flip = focus.x + 32 + card.offsetWidth > frameState.width;
      const left = flip ? focus.x - 32 - card.offsetWidth : focus.x + 32;
      card.style.transform = `translate3d(${left.toFixed(1)}px, ${(focus.y - card.offsetHeight / 2).toFixed(1)}px, 0)`;
      card.dataset.visible = "true";
    };

    const loop = (now: number) => {
      frame = 0;
      if (document.hidden || lost) return;
      const elapsed = Math.min(now - lastNow, 80);
      lastNow = now;
      const moving = ambient();
      if (moving) frameState.time += elapsed / 1000;
      const easing = easePointer(elapsed);
      const interval =
        window.scrollY > hero.offsetHeight ? FIELD_FRAME_INTERVAL : HERO_FRAME_INTERVAL;
      let introRunning = false;
      if (dirty || easing || (moving && now - lastRender >= interval)) {
        dirty = false;
        lastRender = now;
        introRunning = render(now);
      }
      if (moving || easing || introRunning) frame = requestAnimationFrame(loop);
    };
    const invalidate = () => {
      dirty = true;
      if (frame !== 0 || document.hidden || lost) return;
      lastNow = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const resize = () => {
      frameState.width = Math.max(1, host.clientWidth);
      frameState.height = Math.max(1, host.clientHeight);
      renderer.setSize(frameState.width, frameState.height, false);
      camera.aspect = frameState.width / frameState.height;
      camera.updateProjectionMatrix();
      sky.resize(frameState.width, frameState.height);
      invalidate();
    };
    const track = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerX = (event.clientX / frameState.width - 0.5) * 2;
      pointerY = (event.clientY / frameState.height - 0.5) * 2;
      const heroBox = hero.getBoundingClientRect();
      const insideHero = event.clientY >= heroBox.top && event.clientY <= heroBox.bottom;
      pointer = insideHero ? { x: event.clientX, y: event.clientY } : null;
      invalidate();
    };
    const leave = () => {
      pointer = null;
      invalidate();
    };
    // Only the star under the pointer is chosen, and never through a control that sits over the sky.
    const select = (event: MouseEvent) => {
      if (event.button !== 0 || hoveredKey == null) return;
      if (event.target instanceof Element && event.target.closest("a, button, input, label"))
        return;
      onSelectStarRef.current(hoveredKey);
    };
    const visibility = () => {
      // A tab opened in the background plays the opening when it is first seen.
      if (!document.hidden && lastRender === 0) introStart = performance.now();
      invalidate();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      frame = 0;
      setReady(false);
    };
    invalidateRef.current = invalidate;
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    observer.observe(hero);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("click", select);
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", invalidate);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    resize();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("pointermove", track);
      window.removeEventListener("click", select);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", invalidate);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      invalidateRef.current = null;
      skyRef.current = null;
      sky.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      setReady(false);
    };
  }, [heroRef]);

  // Frontier names are decorative here; the register below carries the same roles accessibly.
  return (
    <div className={styles.field} ref={hostRef} data-ready={ready} aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label}
          className={styles.starLabel}
          ref={(element) => {
            if (element == null) return;
            labelElements.current.set(label, element);
            return () => {
              labelElements.current.delete(label);
            };
          }}
        >
          {label}
        </span>
      ))}
      <div className={styles.starCard} ref={cardRef} data-visible="false">
        <strong data-field="name" />
        <span data-field="provider" />
        <dl>
          <dt>Intelligence</dt>
          <dd data-field="intelligence" />
          <dt>Released</dt>
          <dd data-field="released" />
        </dl>
      </div>
    </div>
  );
}
