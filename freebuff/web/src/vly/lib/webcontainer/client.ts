"use client";

import { WebContainer } from "@webcontainer/api";

import { ContainerBootState, setContainerBootState } from "./bootState";
import { getCurrentWebContainerSupport } from "./browserSupport";

const WORK_DIR_NAME = "project";

interface PreviewMessageEvent {
  type?: string;
  error?: unknown;
  reason?: unknown;
}

function attachPreviewErrorForwarding(container: WebContainer): void {
  container.on("preview-message", (message) => {
    const event = message as PreviewMessageEvent;
    if (
      event.type !== "PREVIEW_UNCAUGHT_EXCEPTION" &&
      event.type !== "PREVIEW_UNHANDLED_REJECTION"
    ) {
      return;
    }
    const details = event.error ?? event.reason ?? message;
    console.error("[WebContainer preview runtime error]", details);
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __freebuffWebContainerPromise: Promise<WebContainer> | undefined;
}

/**
 * Returns the singleton WebContainer instance for this tab, booting it on
 * first call. Cached on `globalThis` (rather than module scope) so Next.js
 * Fast Refresh re-evaluating this module during dev doesn't boot a second
 * instance — only one WebContainer can be booted per tab at a time.
 */
export function getWebContainer(): Promise<WebContainer> {
  if (typeof window === "undefined") {
    // Never resolves during SSR; callers must only invoke this client-side.
    return new Promise<WebContainer>(() => {});
  }

  if (!globalThis.__freebuffWebContainerPromise) {
    const support = getCurrentWebContainerSupport();
    if (!support.supported) {
      setContainerBootState(ContainerBootState.UNSUPPORTED);
      const rejected = Promise.reject(
        new Error(`WebContainer is not supported in this browser: ${support.reason}`),
      );
      // Avoid an unhandled-rejection warning for the cached promise itself —
      // callers that actually await `getWebContainer()` still see the error.
      rejected.catch(() => {});
      globalThis.__freebuffWebContainerPromise = rejected;
      return rejected;
    }

    setContainerBootState(ContainerBootState.STARTING);
    globalThis.__freebuffWebContainerPromise = WebContainer.boot({
      coep: "credentialless",
      workdirName: WORK_DIR_NAME,
      forwardPreviewErrors: true,
    })
      .then((container) => {
        attachPreviewErrorForwarding(container);
        setContainerBootState(ContainerBootState.LOADING_SNAPSHOT);
        return container;
      })
      .catch((error) => {
        setContainerBootState(ContainerBootState.ERROR, error);
        throw error;
      });
  }

  return globalThis.__freebuffWebContainerPromise;
}

/** Tears down the booted WebContainer, if any. Mostly useful for tests/dev cleanup. */
export async function teardownWebContainer(): Promise<void> {
  const pending = globalThis.__freebuffWebContainerPromise;
  if (!pending) return;
  globalThis.__freebuffWebContainerPromise = undefined;
  try {
    const container = await pending;
    container.teardown();
  } catch {
    // Already failed to boot, or already torn down — nothing to clean up.
  }
}
