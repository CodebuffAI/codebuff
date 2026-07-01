"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Surface = "web" | "cloud";

const HEARTBEAT_MS = 15000;
const BROADCAST_CHANNEL = "freebuff-active-session";

/**
 * Detects whether another browser tab/device holds this user's single active
 * project slot and drives the seamless "take over" prompt.
 *
 * Detection is intentionally cheap and non-blocking:
 *  - BroadcastChannel gives instant, zero-server detection across tabs in the
 *    same browser.
 *  - A tiny reactive Convex subscription (`getActiveSession`) catches other
 *    devices. It is a subscription, not an on-load blocking query, so it never
 *    delays workspace load.
 */
export function useActiveSession({
  projectId,
  semanticIdentifier,
  surface,
  enabled = true,
}: {
  projectId: Id<"project"> | undefined;
  semanticIdentifier?: string;
  surface: Surface;
  enabled?: boolean;
}) {
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  );

  const active = useQuery(
    api.active_session.getActiveSession,
    enabled ? {} : "skip",
  );
  const heartbeat = useMutation(api.active_session.heartbeatActiveSession);
  const release = useMutation(api.active_session.releaseActiveSession);
  const takeOverAction = useAction(api.active_session.takeOverActiveSession);

  const [supersededLocal, setSupersededLocal] = useState(false);
  const [takingOver, setTakingOver] = useState(false);

  // Instant same-browser detection via BroadcastChannel.
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; sessionId?: string; projectId?: string | null }
        | undefined;
      if (
        data?.type === "claim" &&
        data.sessionId &&
        data.sessionId !== sessionId &&
        data.projectId &&
        data.projectId !== (projectId ?? null)
      ) {
        setSupersededLocal(true);
      }
    };
    bc.addEventListener("message", onMessage);
    // NOTE: we intentionally do NOT broadcast a claim on mount — only an actual
    // take-over broadcasts (see `takeOver`). Announcing on mount would wrongly
    // supersede the real holder whenever another tab merely opened a project.
    return () => {
      bc.removeEventListener("message", onMessage);
      bc.close();
    };
  }, [enabled, sessionId, projectId]);

  // Heartbeat loop: claims the slot when free/stale, refreshes freshness while
  // held. Releases on unmount / tab close.
  useEffect(() => {
    if (!enabled || !projectId) return;
    const ping = () => {
      heartbeat({ sessionId, projectId, semanticIdentifier, surface }).catch(
        () => {},
      );
    };
    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    const onUnload = () => {
      release({ sessionId }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("beforeunload", onUnload);
      release({ sessionId }).catch(() => {});
    };
  }, [enabled, sessionId, projectId, semanticIdentifier, surface]);

  const conflict =
    !!(
      active &&
      active.is_fresh &&
      active.session_id !== sessionId &&
      active.project_id &&
      projectId &&
      active.project_id !== projectId
    ) || supersededLocal;

  const takeOver = useCallback(async () => {
    if (takingOver) return;
    try {
      setTakingOver(true);
      await takeOverAction({
        sessionId,
        projectId,
        semanticIdentifier,
        surface,
      });
      setSupersededLocal(false);
      // Broadcast our claim so the other same-browser tab yields immediately.
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.postMessage({
          type: "claim",
          sessionId,
          projectId: projectId ?? null,
        });
        bc.close();
      }
    } finally {
      setTakingOver(false);
    }
  }, [takingOver, takeOverAction, sessionId, projectId, semanticIdentifier, surface]);

  return {
    conflict,
    takingOver,
    takeOver,
    holderLabel: active?.semantic_identifier ?? null,
  };
}
