"use client";

import { Project2 } from "./project-2";

export function CloudProject2({
  shouldShowPublicModel = false,
}: {
  shouldShowPublicModel?: boolean;
}) {
  return (
    <Project2
      shouldShowPublicModel={shouldShowPublicModel}
      runtimeSurface="cloud"
    />
  );
}
