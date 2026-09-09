"use client";

/** Present the accepted Glacier video as decorative material, with a static poster when motion or playback is unavailable. */
import { useEffect, useRef, useState } from "react";

import styles from "./signature.module.css";

const POSTER = "/signatures/glacier/glacier-digital-flower-poster.webp";

/** Load video only on an active, visible surface; release its decoder when the selected material unmounts. */
export function GlacierMaterial() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const surface = surfaceRef.current;
    const video = videoRef.current;
    if (surface == null || video == null) {
      return;
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bounds = surface.getBoundingClientRect();
    let visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    let disposed = false;
    let failed = false;
    const canPlay = () =>
      !disposed && !failed && visible && !motion.matches && document.visibilityState === "visible";

    const syncPlayback = () => {
      if (disposed) {
        return;
      }
      if (!canPlay()) {
        video.pause();
        if (motion.matches) {
          setReady(false);
        }
        return;
      }
      if (video.getAttribute("src") == null) {
        video.src = "/signatures/glacier/glacier-digital-flower.mp4";
      }
      void video.play().then(
        () => {
          if (!canPlay()) {
            video.pause();
          }
        },
        () => {
          if (!disposed && video.paused) {
            setReady(false);
          }
        },
      );
    };
    const onPlaying = () => {
      if (canPlay()) {
        setReady(true);
      } else {
        video.pause();
      }
    };
    const onError = () => {
      failed = true;
      setReady(false);
      video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      syncPlayback();
    });
    observer.observe(surface);
    motion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    syncPlayback();

    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  return (
    <div className={styles.videoMaterial} ref={surfaceRef} data-ready={ready} aria-hidden="true">
      <img className={styles.videoPoster} src={POSTER} alt="" width={1280} height={720} />
      <video
        className={styles.video}
        ref={videoRef}
        muted
        loop
        playsInline
        disablePictureInPicture
        preload="none"
        tabIndex={-1}
      />
    </div>
  );
}
