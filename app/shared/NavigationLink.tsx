"use client";

/** Warm the requested route on pointer, keyboard, or touch intent without downloading every visible document. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, SyntheticEvent } from "react";

/** Keep Next's navigation and browser link behavior while fetching the destination ahead of activation. */
export function NavigationLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const router = useRouter();
  const prefetch = (event: SyntheticEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    const link = event.currentTarget;
    const current = window.location;
    if (link.origin !== current.origin) return;
    if (link.pathname === current.pathname && link.search === current.search) return;
    router.prefetch(link.href);
  };
  return (
    <Link
      {...props}
      prefetch={false}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        prefetch(event);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch(event);
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetch(event);
      }}
    />
  );
}
