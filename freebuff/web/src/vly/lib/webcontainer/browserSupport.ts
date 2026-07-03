/**
 * WebContainer requires the page to be cross-origin isolated, and only works
 * in a subset of browsers. iOS WebKit-based browsers (Safari, and every other
 * browser on iOS, since they all use WebKit under the hood) and desktop
 * Safari are not supported at all — see
 * https://webcontainers.io/guides/browser-support and
 * https://blog.stackblitz.com/posts/cross-browser-with-coop-coep/.
 *
 * Mirrors the gating logic used by browserPod/Chef's `experienceChooser.ts`,
 * reimplemented with a lightweight UA sniff instead of pulling in a UA
 * parsing dependency.
 */

export type WebContainerSupportReason =
  | "unsupported_ios"
  | "unsupported_safari"
  | "not_cross_origin_isolated"
  | "supported";

export interface WebContainerSupport {
  supported: boolean;
  reason: WebContainerSupportReason;
  /** True on phones/tablets that technically support WebContainer but have a degraded experience (small preview, slower hardware). */
  isMobile: boolean;
}

function isIOS(userAgent: string): boolean {
  // Covers Safari, Chrome-on-iOS, Firefox-on-iOS, etc. — all WebKit under the hood.
  // iPadOS 13+ reports as "Macintosh" but has touch support, hence the maxTouchPoints check.
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) &&
      typeof navigator !== "undefined" &&
      navigator.maxTouchPoints > 1)
  );
}

function isDesktopSafari(userAgent: string): boolean {
  return /^((?!chrome|chromium|crios|fxios|edg).)*safari/i.test(userAgent);
}

function isMobileOrTablet(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent,
  );
}

export function getWebContainerSupport(
  userAgent: string,
  crossOriginIsolated: boolean,
): WebContainerSupport {
  const isMobile = isMobileOrTablet(userAgent);

  if (isIOS(userAgent)) {
    return { supported: false, reason: "unsupported_ios", isMobile: true };
  }

  if (!crossOriginIsolated) {
    return {
      supported: false,
      reason: "not_cross_origin_isolated",
      isMobile,
    };
  }

  if (isDesktopSafari(userAgent)) {
    return { supported: false, reason: "unsupported_safari", isMobile };
  }

  return { supported: true, reason: "supported", isMobile };
}

/** Convenience wrapper that reads `navigator`/`window` directly. Client-only. */
export function getCurrentWebContainerSupport(): WebContainerSupport {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { supported: false, reason: "not_cross_origin_isolated", isMobile: false };
  }
  return getWebContainerSupport(navigator.userAgent, window.crossOriginIsolated === true);
}
