"use client";

import { CloudProjectWorkspace } from "./cloud-project-workspace";

export function CloudProject2({
  shouldShowPublicModel: _shouldShowPublicModel = false,
}: {
  shouldShowPublicModel?: boolean;
}) {
  void _shouldShowPublicModel;
  return <CloudProjectWorkspace />;
}
