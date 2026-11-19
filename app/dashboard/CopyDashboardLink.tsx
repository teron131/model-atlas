"use client";

/** Copy the link to a section with the controls it owns as they are now, or with no section the address as it stands, without changing browser history. */

import { Check as CheckIcon, CircleAlert, Link as LinkIcon } from "lucide-react";
import { useState } from "react";

import type { DashboardSection } from "./url-state";
import { dashboardSectionLink } from "./use-url-state";

const feedback = {
  idle: { label: "Copy link", Icon: LinkIcon },
  saved: { label: "Link copied", Icon: CheckIcon },
  error: { label: "Copy failed — use the address bar", Icon: CircleAlert },
};

export function CopyDashboardLink({ section }: { section?: DashboardSection }) {
  const [status, setStatus] = useState<keyof typeof feedback>("idle");
  const { label, Icon } = feedback[status];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        section == null ? window.location.href : dashboardSectionLink(section),
      );
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }
  return (
    <button
      className="dashboard-action-button"
      type="button"
      data-state={status}
      aria-label={label}
      title={label}
      onClick={copyLink}
      onBlur={() => setStatus("idle")}
    >
      <Icon aria-hidden="true" />
      <span className="visually-hidden" role="status">
        {label}
      </span>
    </button>
  );
}
