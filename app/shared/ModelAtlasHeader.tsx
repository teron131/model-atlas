"use client";

/** Shared branding, primary routes, and theme control stay consistent across every page. */

import { BookOpenText, ChartNoAxesColumnIncreasing, Moon, Sun } from "lucide-react";
import Link from "next/link";

import { toggleModelAtlasTheme, useThemeSynchronization } from "./theme";

const HEADER_ROUTES = [
  { page: "dashboard", href: "/", label: "Leaderboard", Icon: ChartNoAxesColumnIncreasing },
  { page: "methodology", href: "/methodology", label: "Methodology", Icon: BookOpenText },
] as const;

export function ModelAtlasHeader({ page }: { page: "dashboard" | "methodology" }) {
  useThemeSynchronization();

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
        <button
          className="header-icon-button theme-toggle"
          type="button"
          aria-label="Toggle color theme"
          title="Toggle color theme"
          onClick={toggleModelAtlasTheme}
        >
          <Sun className="theme-icon-light" aria-hidden="true" />
          <Moon className="theme-icon-dark" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
