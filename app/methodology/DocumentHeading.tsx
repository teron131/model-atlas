"use client";

/** Keep link targets stationary while measuring titles for nested sticky headings. */
import { type ReactNode, useEffect, useRef } from "react";

import styles from "./methodology.module.css";

export function DocumentHeading({
  level,
  id,
  children,
}: {
  level: 2 | 3;
  id: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const Tag = level === 2 ? "h2" : "h3";

  useEffect(() => {
    const heading = ref.current;
    const section = heading?.parentElement;
    if (level !== 2 || heading == null || section == null) return;
    const update = () => {
      section.style.setProperty("--section-heading-height", `${heading.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(heading);
    return () => observer.disconnect();
  }, [level]);

  return (
    <>
      <span id={id} className={styles.headingAnchor} data-level={level} aria-hidden="true" />
      <Tag ref={ref}>{children}</Tag>
    </>
  );
}
