import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

// Interface for Vite HMR errors (client-side only, not stored in DB)
interface ViteHmrError {
  id: string;
  error: string;
  build_log: string;
  timestamp: number;
}

interface BuildErrorsProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
  sendMessage: (message: string) => Promise<unknown>;
}

export function BuildErrors({ project, sendMessage }: BuildErrorsProps) {
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [viteHmrErrors, setViteHmrErrors] = useState<ViteHmrError[]>([]);

  const unresolvedBuildErrors = useQuery(
    api.build_errors.getUnresolvedBuildErrors,
    {
      projectId: project._id,
    },
  );

  const resolveBuildErrors = useMutation(api.build_errors.resolveBuildErrors);
  const deleteBuildError = useMutation(api.build_errors.deleteBuildError);

  // Listen for Vite HMR errors from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const { type, error, timestamp } = event.data ?? {};

      if (type === "vly-vite-hmr-error" && error) {
        // Deduplicate by error message (within 5 seconds)
        setViteHmrErrors((prev) => {
          const isDuplicate = prev.some(
            (e) => e.error === error.message && timestamp - e.timestamp < 5000,
          );
          if (isDuplicate) return prev;

          const newError: ViteHmrError = {
            id: `vite-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
            error: error.message,
            build_log: error.stack || "",
            timestamp,
          };
          return [...prev, newError];
        });
      }

      if (type === "vly-vite-hmr-success") {
        // Clear all Vite HMR errors on successful build
        setViteHmrErrors([]);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Remove a single Vite HMR error
  const removeViteError = useCallback((id: string) => {
    setViteHmrErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Combine backend errors + Vite HMR errors
  const allErrors = [
    ...(unresolvedBuildErrors || []).map((e) => ({
      id: e._id,
      error: e.error,
      build_log: e.build_log,
      isViteError: false,
    })),
    ...viteHmrErrors.map((e) => ({
      id: e.id,
      error: e.error,
      build_log: e.build_log,
      isViteError: true,
    })),
  ];

  if (allErrors.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between bg-orange-500 p-3 text-sm font-bold text-white">
        <div className="flex items-center space-x-2">
          <span>Unresolved build errors detected.</span>
          <button
            onClick={() => setShowErrorDetails(!showErrorDetails)}
            className="text-white underline"
          >
            {showErrorDetails ? "Hide details" : "Show details"}
          </button>
        </div>
        <button
          onClick={async () => {
            // Combine all errors into a message
            const detailsMessage = allErrors
              .map(
                (err) =>
                  `Build Error: ${err.error}${err.build_log ? `\nBuild Log:\n${err.build_log}` : ""}`,
              )
              .join("\n\n");

            // send the error details as a message
            await sendMessage(detailsMessage);

            // Mark backend errors as resolved
            const backendErrorIds = (unresolvedBuildErrors || []).map(
              (err) => err._id,
            );
            if (backendErrorIds.length > 0) {
              await resolveBuildErrors({ errorIds: backendErrorIds });
            }

            // Clear Vite HMR errors
            setViteHmrErrors([]);
            setShowErrorDetails(false);
          }}
          className="rounded bg-white px-3 py-1 font-semibold text-orange-500"
        >
          Fix
        </button>
      </div>
      {showErrorDetails && (
        <div className="max-h-48 space-y-2 overflow-y-auto bg-orange-600 p-3 text-xs text-white">
          {allErrors.map((err) => (
            <div
              key={err.id}
              className="relative rounded border border-orange-400 p-2"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (err.isViteError) {
                    removeViteError(err.id);
                  } else {
                    deleteBuildError({ errorId: err.id as any });
                  }
                }}
                className="absolute right-1 top-1 h-6 w-6 text-white hover:bg-orange-100 hover:text-orange-600"
              >
                <X className="h-4 w-4" />
              </Button>
              <div>
                <strong>Error:</strong> {err.error}
              </div>
              {err.build_log && (
                <pre className="whitespace-pre-wrap">
                  <strong>Build Log:</strong>
                  {err.build_log}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
