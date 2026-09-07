"use client";

/** Shared provider marks keep table icon sizing and failed-image fallback consistent. */
import { useState } from "react";

import type { ModelAtlasPublishedModel } from "../../../src/model-atlas/stats/types";
import { modelLogo } from "./model-display";

/** Reserve the icon slot when a provider image is missing or fails to load. */
export function ProviderLogo({ model }: { model: ModelAtlasPublishedModel }) {
  const [hidden, setHidden] = useState(false);
  const logoSrc = modelLogo(model);
  if (hidden || !logoSrc) return <span className="provider-logo provider-logo-empty" />;
  return (
    <img
      className="provider-logo"
      src={logoSrc}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      onError={() => setHidden(true)}
    />
  );
}
