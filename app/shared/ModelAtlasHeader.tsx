"use client";

/** Shared branding, primary routes, and theme control stay consistent across every page. */

import { Moon, Sun } from "lucide-react";

import { NavigationLink } from "./NavigationLink";
import { toggleModelAtlasTheme, useThemeSynchronization } from "./theme";

export function ModelAtlasHeader({ page }: { page: "dashboard" | "methodology" }) {
  useThemeSynchronization();

  return (
    <header className="dashboard-header">
      <NavigationLink className="brand-lockup" href="/" aria-label="Model Atlas home">
        <span className="brand-mark" aria-hidden="true" />
        {page === "dashboard" ? (
          <h1>Model Atlas</h1>
        ) : (
          <span className="brand-title">Model Atlas</span>
        )}
      </NavigationLink>
      <div className="header-actions">
        <nav className="header-routes" aria-label="Main navigation">
          <NavigationLink
            className="header-route"
            href={page === "dashboard" ? "/methodology" : "/"}
          >
            {page === "dashboard" ? "Methodology" : "Leaderboard"}
          </NavigationLink>
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
