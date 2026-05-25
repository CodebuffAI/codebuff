"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const AD_COOLDOWN_MS = 60_000;
const AD_DEBOUNCE_MS = 2_000;

export type GravityAdMessage = { role: string; content: string };

type GravityAd = {
  adText: string;
  title: string;
  cta: string;
  brandName: string;
  url: string;
  favicon?: string;
  impUrl: string;
  clickUrl: string;
};

const GRAVITY_API_URL = "https://server.trygravity.ai/api/v1/ad";

/** Placement ID sent to Gravity for reporting/targeting. */
const PLACEMENT_CHAT = "agent-chat-below-response";
const PLACEMENT_CENTER = "project-center";
const PLACEMENT_SIDEBAR = "project-sidebar";

/**
 * Client-side fetch to Gravity API.
 * This avoids Convex action compute costs by calling Gravity directly from the browser.
 */
async function fetchGravityAd(
  messages: GravityAdMessage[],
  sessionId: string,
  testAd: boolean,
  placement?: "center" | "sidebar",
): Promise<GravityAd | null> {
  const apiKey = process.env.NEXT_PUBLIC_GRAVITY_API_KEY;
  if (!apiKey) {
    console.warn(
      "[GravityAdSlot] NEXT_PUBLIC_GRAVITY_API_KEY is not set. Ads will not be displayed.",
    );
    return null;
  }

  const placementId =
    placement === "center"
      ? PLACEMENT_CENTER
      : placement === "sidebar"
        ? PLACEMENT_SIDEBAR
        : PLACEMENT_CHAT;

  const placementType =
    placementId === PLACEMENT_CHAT
      ? "below_response"
      : placementId === PLACEMENT_CENTER
        ? "inline_response"
        : "left_response";

  // Use unique sessionId per placement to avoid Gravity's per-session deduplication
  // This allows multiple ad slots to each receive their own ad
  const uniqueSessionId = `${sessionId}-${placementId}`;

  const body = {
    messages,
    sessionId: uniqueSessionId,
    placements: [
      {
        placement: placementType,
        placement_id: placementId,
      },
    ],
    testAd,
  };

  try {
    // Use AbortController with 3s timeout to prevent long waits
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    console.log(
      `[GravityAdSlot] Fetching ad for placement: ${placementId}, sessionId: ${uniqueSessionId}`,
    );

    const res = await fetch(GRAVITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log(
      `[GravityAdSlot] Response for ${placementId}: status=${res.status}`,
    );

    if (res.status === 204 || !res.ok) {
      console.log(
        `[GravityAdSlot] No ad returned for ${placementId} (status: ${res.status})`,
      );
      return null;
    }

    const data = (await res.json()) as unknown;
    console.log(`[GravityAdSlot] Data for ${placementId}:`, data);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[GravityAdSlot] Empty or invalid data for ${placementId}`);
      return null;
    }

    const first = data[0];
    if (
      typeof first !== "object" ||
      first === null ||
      typeof (first as { adText?: unknown }).adText !== "string" ||
      typeof (first as { impUrl?: unknown }).impUrl !== "string" ||
      typeof (first as { clickUrl?: unknown }).clickUrl !== "string"
    ) {
      return null;
    }

    return {
      adText: (first as { adText: string }).adText,
      title: (first as { title?: string }).title ?? "",
      cta: (first as { cta?: string }).cta ?? "",
      brandName: (first as { brandName?: string }).brandName ?? "",
      url: (first as { url?: string }).url ?? "",
      favicon: (first as { favicon?: string }).favicon,
      impUrl: (first as { impUrl: string }).impUrl,
      clickUrl: (first as { clickUrl: string }).clickUrl,
    };
  } catch {
    return null;
  }
}

type GravityAdSlotProps = {
  messages: GravityAdMessage[];
  sessionId: string;
  /** Stable id for this slot (e.g. message._id) so we only fetch once per message */
  slotKey?: string;
  testAd?: boolean;
  /** "featured" = larger (e.g. in chat); "compact" = smaller (sidebar); "default" = standard (center) */
  variant?: "default" | "featured" | "compact";
  /** Placement for Gravity: "center" | "sidebar" for project center/sidebar; omit for chat (below_response). */
  placement?: "center" | "sidebar";
  /** Called when an ad is successfully loaded and rendered (e.g. to show disclaimer only when ad is visible). */
  onAdRendered?: () => void;
  /** When true, show "Promotions help keep vly affordable." below the ad (e.g. in chat). */
  showDisclaimer?: boolean;
  className?: string;
};

/**
 * Fetches and displays a Gravity contextual ad. Fires impression when in view.
 * Request runs once on mount with the given messages/sessionId.
 */
export function GravityAdSlot({
  messages,
  sessionId,
  slotKey,
  testAd = false,
  variant = "default",
  placement,
  onAdRendered,
  showDisclaimer = false,
  className,
}: GravityAdSlotProps) {
  const [ad, setAd] = useState<GravityAd | null>(null);
  const [faviconError, setFaviconError] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const lastFetchRef = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stabilize messages by content to avoid re-fetches on reference changes (e.g. during streaming)
  const stableMessagesKey = useMemo(
    () =>
      JSON.stringify(
        messages.map((m) => ({ r: m.role, c: m.content.slice(0, 200) })),
      ),
    [messages],
  );

  const requestMessages = useMemo(
    () =>
      messages.length > 0
        ? messages
        : [{ role: "user", content: "Building my app" }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableMessagesKey],
  );

  // Track page visibility to avoid fetching ads when tab is hidden
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true,
  );

  useEffect(() => {
    const handler = () => setIsTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    if (ad) onAdRendered?.();
  }, [ad, onAdRendered]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(
    (immediate: boolean) => {
      if (!isTabVisible) return;

      const now = Date.now();
      if (
        !immediate &&
        lastFetchRef.current > 0 &&
        now - lastFetchRef.current < AD_COOLDOWN_MS
      )
        return;

      const run = () => {
        lastFetchRef.current = Date.now();
        fetchGravityAd(requestMessages, sessionId, testAd, placement)
          .then((result) => {
            if (mountedRef.current && result) setAd(result);
          })
          .catch(() => {})
          .finally(() => {
            if (mountedRef.current) setHasFetched(true);
          });
      };

      if (immediate) {
        run();
      } else {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(run, AD_DEBOUNCE_MS);
      }
    },
    [isTabVisible, requestMessages, sessionId, testAd, placement],
  );

  // Initial fetch (immediate) and re-fetch on meaningful changes (debounced + cooldown)
  const isInitialFetch = useRef(true);
  useEffect(() => {
    if (isInitialFetch.current) {
      isInitialFetch.current = false;
      doFetch(true);
    } else {
      doFetch(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, testAd, placement, slotKey, stableMessagesKey, isTabVisible]);

  if (!hasFetched || !ad) return null;

  const isFeatured = variant === "featured";
  const isCompact = variant === "compact";

  const adCard = (
    <div
      className={cn(
        "relative rounded-lg",
        isFeatured && "mt-2.5 border border-zinc-200 bg-zinc-50/30 px-3 py-2",
        isCompact && "mt-2 border border-zinc-200 bg-zinc-50/80 px-2 py-2",
        !isFeatured &&
          !isCompact &&
          "mt-3 border border-zinc-200 bg-zinc-50/80 px-3 py-2.5",
        className,
      )}
    >
      {/* Impressions: fire GET to impUrl when the ad is rendered (required for payment) */}
      <img
        src={ad.impUrl}
        alt=""
        width={1}
        height={1}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        loading="eager"
      />
      {/* Clicks: redirect to clickUrl; Gravity handles attribution and redirects to the landing page */}
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block rounded text-left no-underline outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-1"
      >
        <div
          className={cn(
            "flex items-start gap-2",
            isFeatured && "gap-2",
            isCompact && "gap-1.5",
          )}
        >
          <div
            className={cn(
              "relative flex shrink-0 items-center justify-center overflow-hidden rounded font-medium",
              isFeatured && "h-5 w-5 bg-zinc-100 text-[9px] text-zinc-500",
              isCompact && "h-4 w-4 bg-zinc-200 text-[9px] text-zinc-600",
              !isFeatured &&
                !isCompact &&
                "h-5 w-5 bg-zinc-200 text-[10px] text-zinc-600",
            )}
          >
            {ad.favicon && !faviconError ? (
              <img
                src={ad.favicon}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setFaviconError(true)}
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1]",
                ad.favicon && !faviconError ? "invisible" : "",
              )}
            >
              {ad.brandName.charAt(0).toUpperCase() || "Ad"}
            </span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <span
              className={cn(
                "block font-medium",
                !isCompact && "truncate",
                isFeatured && "text-xs text-zinc-500",
                isCompact && "line-clamp-2 text-[10px] text-zinc-700",
                !isFeatured && !isCompact && "text-xs text-zinc-700",
              )}
            >
              {ad.title || ad.brandName}
            </span>
            <p
              className={cn(
                "mt-0.5 line-clamp-3 break-words leading-snug",
                isFeatured && "text-xs text-zinc-500",
                isCompact &&
                  "mt-0 line-clamp-5 text-[10px] leading-tight text-zinc-600",
                !isFeatured && !isCompact && "text-xs text-zinc-600",
              )}
            >
              {ad.adText}
            </p>
            <span
              className={cn(
                "mt-3 inline-flex items-center gap-1 rounded-md font-semibold transition-colors",
                isFeatured &&
                  "bg-zinc-800 px-2.5 py-1 text-[11px] text-white hover:bg-zinc-700",
                isCompact &&
                  "bg-zinc-800 px-2 py-0.5 text-[10px] text-white hover:bg-zinc-700",
                !isFeatured &&
                  !isCompact &&
                  "bg-zinc-800 px-2.5 py-1 text-[11px] text-white hover:bg-zinc-700",
              )}
            >
              {ad.cta || "Learn more"}
              <ExternalLink
                className={cn(
                  "shrink-0",
                  isCompact && "h-2.5 w-2.5",
                  !isCompact && "h-3 w-3",
                )}
              />
            </span>
          </div>
        </div>
      </a>
    </div>
  );

  return (
    <>
      {adCard}
      {showDisclaimer && (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          Promotions help keep vly affordable.
        </p>
      )}
    </>
  );
}
