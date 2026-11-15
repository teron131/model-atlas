/** The Timeline's organization filter: the dashboard's checklist of labs, ranked by their best charted index, whose selection stays local to the Timeline. */

import { memo, useRef } from "react";

import { Checklist } from "../../shared/Checklist";
import { providerDisplayName, providerLogo } from "../../shared/provider-theme";
import { useDismissibleDetails } from "../../shared/use-dismissible-details";
import type { TimelinePoint } from "./chart-data";

import checklist from "../../shared/checklist.module.css";
import styles from "../graphs.module.css";
import timeline from "./timeline.module.css";

/** Null shows every lab with no row picked, as the global provider filter does; picking rows narrows the Timeline to them, and unpicking the last returns to every lab. */
export const OrganizationSelect = memo(function OrganizationSelect({
  points,
  selected,
  onChange,
}: {
  points: TimelinePoint[];
  selected: string[] | null;
  onChange: (keys: string[] | null) => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const organizations = new Map<string, { count: number; best: TimelinePoint }>();
  for (const point of points) {
    const current = organizations.get(point.provider);
    organizations.set(point.provider, {
      count: (current?.count ?? 0) + 1,
      best: !current || point.score > current.best.score ? point : current.best,
    });
  }
  const options = [...organizations].map(([key, value]) => ({
    key,
    count: value.count,
    best: value.best,
    label: providerDisplayName(key),
  }));
  const keys = options.map((option) => option.key);
  const picked = new Set(selected ?? []);
  useDismissibleDetails(root);
  return (
    <div className={`${styles.metricToggle} ${timeline.organizationPicker}`} data-capture-exclude>
      <details ref={root} className={checklist.picker} aria-label="Timeline organizations">
        <summary className="selection-choice">
          <span>Organizations · {selected == null ? "All" : picked.size}</span>
        </summary>
        <div className={checklist.menu}>
          <Checklist
            items={options}
            itemKey={(option) => option.key}
            name={{
              label: "Organization",
              sort: "ascending",
              text: (option) => option.label,
              logo: (option) => providerLogo(option.key),
            }}
            columns={[
              {
                key: "best",
                label: "Best index",
                sort: "descending",
                value: (option) => option.best.score,
                text: (option) => option.best.score.toFixed(1),
                title: (option) => `${option.best.name} · Intelligence Index`,
              },
              {
                key: "models",
                label: "#Models",
                sort: "descending",
                value: (option) => option.count,
                text: (option) => String(option.count),
              },
            ]}
            initialSort={{ key: "best", direction: "descending" }}
            search={{ label: "Search organizations", placeholder: "Search organizations" }}
            all={{
              label: "All organizations",
              checked: selected == null,
              onSelect: () => onChange(null),
            }}
            empty="No matching organizations"
            checked={(option) => picked.has(option.key)}
            onToggle={(option, chosen) => {
              const next = new Set(picked);
              if (chosen) next.add(option.key);
              else next.delete(option.key);
              const ordered = keys.filter((key) => next.has(key));
              onChange(ordered.length ? ordered : null);
            }}
          />
        </div>
      </details>
    </div>
  );
});
