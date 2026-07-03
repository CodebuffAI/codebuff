"use client";

import { useEffect } from "react";
import { Loader, MonitorOff } from "lucide-react";

import type { WebContainerSupport } from "@/vly/lib/webcontainer/browserSupport";

// Reload cooldown so a genuinely broken environment doesn't reload-loop: a
// reload that actually fixes isolation won't hit this component again, so if
// we land here twice within the window, the environment really is unsupported.
const ISOLATION_RELOAD_KEY = "freebuff-webcontainer-isolation-reload-at";
const ISOLATION_RELOAD_COOLDOWN_MS = 15_000;

function canAutoReload(): boolean {
  if (typeof window === "undefined") return false;
  const last = Number(window.sessionStorage.getItem(ISOLATION_RELOAD_KEY) ?? 0);
  return Date.now() - last > ISOLATION_RELOAD_COOLDOWN_MS;
}

const REASON_MESSAGES: Record<WebContainerSupport["reason"], string> = {
  unsupported_ios:
    "WebContainer projects require a desktop browser. iOS Safari is not supported.",
  unsupported_safari:
    "WebContainer projects require Chrome, Edge, or Firefox. Safari is not supported.",
  not_cross_origin_isolated:
    "This page is not cross-origin isolated, which WebContainer requires. Try reloading or use a supported browser.",
  supported: "",
};

export function WebContainerUnsupported({
  support,
}: {
  support: WebContainerSupport;
}) {
  // "Not cross-origin isolated" on an otherwise-supported browser almost
  // always means the user client-side navigated here from a page served
  // WITHOUT the COOP/COEP headers (they're scoped to /web/project/*), so the
  // current document never became isolated. A single hard reload fetches the
  // document with the right headers and fixes it. Guarded so a browser that
  // truly can't isolate doesn't reload-loop.
  const shouldAutoReload =
    support.reason === "not_cross_origin_isolated" && canAutoReload();

  useEffect(() => {
    if (!shouldAutoReload) return;
    window.sessionStorage.setItem(ISOLATION_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }, [shouldAutoReload]);

  if (shouldAutoReload) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background text-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Preparing the dev environment…
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <MonitorOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold text-foreground">
          Browser not supported
        </h1>
        <p className="text-sm text-muted-foreground">
          {REASON_MESSAGES[support.reason]}
        </p>
        <p className="text-xs text-muted-foreground">
          Open this project in Chrome or Edge on desktop to use the in-browser
          dev environment.
        </p>
      </div>
    </div>
  );
}
