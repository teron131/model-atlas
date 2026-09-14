"use client";

/** Shared branding and primary routes stay consistent across dashboard, timeline and documentation widths. */

import { BookOpenText, ChartNoAxesColumnIncreasing, ChartNoAxesCombined } from "lucide-react";
import Link from "next/link";

const HEADER_ROUTES = [
  { page: "dashboard", href: "/", label: "Leaderboard", Icon: ChartNoAxesColumnIncreasing },
  { page: "timeline", href: "/timeline", label: "Timeline", Icon: ChartNoAxesCombined },
  { page: "methodology", href: "/methodology", label: "Methodology", Icon: BookOpenText },
] as const;

export function ModelAtlasHeader({ page }: { page: "dashboard" | "methodology" | "timeline" }) {
  return (
    <header className="dashboard-header">
      <Link className="brand-lockup" href="/" prefetch={false} aria-label="Model Atlas home">
        <span className="brand-mark" aria-hidden="true" />
        {page === "dashboard" ? (
          <h1>Model Atlas</h1>
        ) : (
          <span className="brand-title">Model Atlas</span>
        )}
      </Link>
      <div className="header-actions">
        <nav className="header-routes" aria-label="Main navigation">
          {HEADER_ROUTES.map((route) => (
            <Link
              key={route.page}
              className="header-route"
              href={route.href}
              prefetch={false}
              aria-label={route.label}
              aria-current={
                page === route.page ? (page === "methodology" ? "location" : "page") : undefined
              }
              title={route.label}
            >
              <route.Icon aria-hidden="true" />
              <span>{route.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
