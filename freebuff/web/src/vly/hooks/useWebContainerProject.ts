"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ContainerBootState } from "@/vly/lib/webcontainer/bootState";
import { isWebContainerSandboxId } from "@/vly/lib/webcontainer/constants";
import { getWebContainer } from "@/vly/lib/webcontainer/client";
import { applyUserFrontendEnvVars } from "@/vly/lib/webcontainer/env";
import {
  requestWebContainerSnapshotBackup,
  setupWebContainerProject,
} from "@/vly/lib/webcontainer/setupProject";
import { executeWebContainerTool } from "@/vly/lib/webcontainer/toolExecutor";
import { useWebContainerBoot } from "@/vly/hooks/useWebContainerBoot";

interface UseWebContainerProjectOptions {
  projectId: Id<"project"> | undefined;
  semanticIdentifier: string | undefined;
  sandboxId: string | undefined;
}

export function useWebContainerProject({
  projectId,
  semanticIdentifier,
  sandboxId,
}: UseWebContainerProjectOptions) {
  const mutatingTools = useRef(
    new Set(["write_file", "str_replace", "apply_patch", "run_terminal_command"]),
  );
  const isWebContainer = isWebContainerSandboxId(sandboxId);
  const { state, error, support } = useWebContainerBoot({ enabled: isWebContainer });
  const provisionConvex = useAction(
    api.codesandbox.webcontainerProvision.provisionConvexForWebContainerProject,
  );
  const setPreviewUrl = useMutation(
    api.codesandbox.webcontainerPreview.setWebContainerPreviewUrl,
  );
  const snapshot = useQuery(
    api.codesandbox.webcontainerSnapshot.getLatestSnapshotUrl,
    isWebContainer && semanticIdentifier
      ? { semanticIdentifier }
      : "skip",
  );
  const pendingCalls = useQuery(
    api.codesandbox.pendingToolCalls.getPendingToolCallsForProject,
    isWebContainer && projectId ? { projectId } : "skip",
  );
  // User-defined frontend env vars (durable, table-backed). Reactive: edits
  // made in the Keys view are synced into the container's .env.local below.
  const frontendEnvVars = useQuery(
    api.codesandbox.webcontainerEnvVars.getFrontendEnvVarsForContainer,
    isWebContainer && semanticIdentifier ? { semanticIdentifier } : "skip",
  );
  const completeToolCall = useMutation(
    api.codesandbox.pendingToolCalls.completeToolCall,
  );
  const setupStartedRef = useRef(false);
  // Track in-flight calls so re-renders don't trigger duplicate execution.
  const processingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isWebContainer || !projectId || !semanticIdentifier) return;
    if (support && !support.supported) return;
    if (setupStartedRef.current) return;
    if (snapshot === undefined) return;

    setupStartedRef.current = true;

    void setupWebContainerProject({
      projectId,
      semanticIdentifier,
      snapshotUrl: snapshot?.url ?? null,
      provisionConvex: () =>
        provisionConvex({ semanticIdentifier }).then((result) => ({
          convexUrl: result.convexUrl,
          convexSiteUrl: result.convexSiteUrl,
          convexDeployment: result.convexDeployment,
          deployKey: result.deployKey,
          appId: result.appId,
          monitoringUrl: result.monitoringUrl,
        })),
      onPreviewUrl: (url) => {
        void setPreviewUrl({ semanticIdentifier, previewUrl: url });
      },
    }).catch((setupError) => {
      const message = setupError instanceof Error ? setupError.message : String(setupError);
      console.error("[WebContainer] setup failed:", message);
      toast.error(`Boot failed: ${message}. Try reloading.`);
    });
  }, [
    isWebContainer,
    projectId,
    semanticIdentifier,
    snapshot,
    support,
    provisionConvex,
    setPreviewUrl,
  ]);

  // Keep the container's .env.local in sync with the stored frontend env
  // vars. Also runs once before/around boot: applyUserFrontendEnvVars caches
  // the vars so the initial .env.local write during setup includes them.
  useEffect(() => {
    if (!isWebContainer || !frontendEnvVars) return;
    void getWebContainer()
      .then((container) => applyUserFrontendEnvVars(container, frontendEnvVars))
      .catch(() => {
        // Unsupported browser / boot failure — surfaced elsewhere.
      });
  }, [isWebContainer, frontendEnvVars]);

  useEffect(() => {
    if (!isWebContainer || !pendingCalls?.length) return;
    // Only execute tool calls once the full setup sequence is complete
    // (files mounted, deps installed, Convex provisioned, dev servers running).
    if (state !== ContainerBootState.READY) return;

    void (async () => {
      const container = await getWebContainer();
      // Only execute calls created in the last 10 minutes — anything older is
      // from a previous run that already timed out on the server.
      const cutoff = Date.now() - 10 * 60 * 1000;
      const freshCalls = pendingCalls.filter(
        (c) => c.createdAt > cutoff && !processingRef.current.has(c._id),
      );
      let shouldRequestBackup = false;
      for (const call of freshCalls) {
        processingRef.current.add(call._id);
        if (mutatingTools.current.has(call.toolName)) {
          shouldRequestBackup = true;
        }
        try {
          const output = await executeWebContainerTool(
            container,
            call.toolName,
            call.input as Record<string, unknown>,
          );
          try {
            await completeToolCall({ callId: call._id, output });
          } catch (storeError) {
            // Convex rejected the output (e.g. array too long, document too large).
            // Complete the call with a truncated error message so the agent can continue.
            const msg =
              storeError instanceof Error ? storeError.message : String(storeError);
            await completeToolCall({
              callId: call._id,
              error: `Tool output too large to store: ${msg}`,
            });
          }
        } catch (toolError) {
          await completeToolCall({
            callId: call._id,
            error:
              toolError instanceof Error
                ? toolError.message
                : "Tool execution failed",
          });
        } finally {
          processingRef.current.delete(call._id);
        }
      }
      if (shouldRequestBackup) {
        requestWebContainerSnapshotBackup(1500);
      }
    })();
  }, [isWebContainer, pendingCalls, completeToolCall, state]);

  return {
    isWebContainer,
    state,
    error,
    support,
    isReady: state === ContainerBootState.READY,
    isBooting:
      isWebContainer &&
      state !== ContainerBootState.READY &&
      state !== ContainerBootState.ERROR &&
      state !== ContainerBootState.UNSUPPORTED,
  };
}
