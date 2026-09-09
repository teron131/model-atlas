"use client";

/** Shared Model Atlas header owns route links and optional document navigation. */

import { BookOpenText, ChartNoAxesColumnIncreasing, ListTree } from "lucide-react";
import Link from "next/link";

export function ModelAtlasHeader({
  page,
  documentNavigationOpen = false,
  onToggleDocumentNavigation,
}: {
  page: "dashboard" | "methodology";
  documentNavigationOpen?: boolean;
  onToggleDocumentNavigation?: () => void;
}) {
  const route =
    page === "dashboard"
      ? {
          href: "/methodology",
          label: "Methodology",
          Icon: BookOpenText,
        }
      : {
          href: "/",
          label: "Leaderboard",
          Icon: ChartNoAxesColumnIncreasing,
        };

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
        {onToggleDocumentNavigation == null ? null : (
          <button
            className="header-icon-button"
            type="button"
            aria-label={
              documentNavigationOpen ? "Hide document navigation" : "Show document navigation"
            }
            aria-controls="document-navigation"
            aria-expanded={documentNavigationOpen}
            onClick={onToggleDocumentNavigation}
          >
            <ListTree aria-hidden="true" />
          </button>
        )}
        <Link className="header-route" href={route.href} prefetch={false}>
          <route.Icon aria-hidden="true" />
          <span>{route.label}</span>
        </Link>
      </div>
    </header>
  );
}
