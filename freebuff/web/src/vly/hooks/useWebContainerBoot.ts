"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  ContainerBootState,
  getContainerBootStatus,
  subscribeToContainerBootState,
} from "@/vly/lib/webcontainer/bootState";
import {
  getCurrentWebContainerSupport,
  type WebContainerSupport,
} from "@/vly/lib/webcontainer/browserSupport";
import { getWebContainer } from "@/vly/lib/webcontainer/client";

export interface UseWebContainerBootResult {
  state: ContainerBootState;
  error?: unknown;
  /** undefined during SSR / before mount, since support depends on navigator/window. */
  support: WebContainerSupport | undefined;
}

const SERVER_SNAPSHOT: ReturnType<typeof getContainerBootStatus> = {
  state: ContainerBootState.STARTING,
};

/**
 * Boots the singleton WebContainer (if the browser supports it) on mount and
 * exposes the live boot state. Safe to call from multiple components —
 * booting is idempotent, see `getWebContainer`.
 */
export function useWebContainerBoot(
  options: { enabled?: boolean } = {},
): UseWebContainerBootResult {
  const { enabled = true } = options;

  const status = useSyncExternalStore(
    subscribeToContainerBootState,
    getContainerBootStatus,
    () => SERVER_SNAPSHOT,
  );

  const support =
    typeof window === "undefined" ? undefined : getCurrentWebContainerSupport();

  useEffect(() => {
    if (!enabled) return;
    if (!getCurrentWebContainerSupport().supported) return;

    getWebContainer().catch(() => {
      // Boot errors are surfaced via the boot state store (ContainerBootState.ERROR);
      // swallow here so this doesn't also surface as an unhandled rejection.
    });
  }, [enabled]);

  return { state: status.state, error: status.error, support };
}
