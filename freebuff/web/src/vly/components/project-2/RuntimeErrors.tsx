import { Button } from "@/vly/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { X } from "lucide-react";
import { useState } from "react";

interface RuntimeErrorsProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
  sendMessage: (message: string) => Promise<unknown>;
}

const RuntimeErrorCard = ({
  error,
  url,
  stackTrace,
}: {
  error: FunctionReturnType<
    typeof api.runtime_errors.getUnresolvedRuntimeErrors
  >["page"][0];
  url: string;
  stackTrace: string | undefined;
}) => {
  const deleteRuntimeError = useMutation(api.runtime_errors.deleteRuntimeError);

  return (
    <div className="relative rounded border border-red-400 p-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => deleteRuntimeError({ errorId: error._id })}
        className="absolute right-1 top-1 h-6 w-6 text-white hover:bg-red-100 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </Button>
      <div>
        <strong>Error:</strong> {error.error}
      </div>
      <div>
        <strong>URL:</strong> {url}
      </div>
      {stackTrace && (
        <pre className="whitespace-pre-wrap">
          <strong>Stack Trace:</strong>
          {stackTrace}
        </pre>
      )}
    </div>
  );
};

export function RuntimeErrors({ project, sendMessage }: RuntimeErrorsProps) {
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const unresolvedRuntimeErrorsResult = useQuery(
    api.runtime_errors.getUnresolvedRuntimeErrors,
    {
      projectId: project._id,
      paginationOpts: { numItems: 5, cursor: null },
    },
  );

  const resolveRuntimeErrors = useMutation(
    api.runtime_errors.resolveRuntimeErrors,
  );

  const unresolvedRuntimeErrors = unresolvedRuntimeErrorsResult?.page || [];

  if (!unresolvedRuntimeErrorsResult || unresolvedRuntimeErrors.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between bg-red-500 p-3 text-sm font-bold text-white">
        <div className="flex items-center space-x-2">
          <span>Unresolved runtime errors detected.</span>
          <button
            onClick={() => setShowErrorDetails(!showErrorDetails)}
            className="text-white underline"
          >
            {showErrorDetails ? "Hide details" : "Show details"}
          </button>
        </div>
        <button
          onClick={async () => {
            const errorsToFix = unresolvedRuntimeErrors || [];
            const errorIds = errorsToFix.map((err) => err._id);
            const detailsMessage = errorsToFix
              .map(
                (err) =>
                  `Error: ${err.error}\nURL: ${err.url}${err.stack_trace ? `\nStack Trace:\n${err.stack_trace}` : ""}`,
              )
              .join("\n\n");
            // send the error details as a message
            await sendMessage(detailsMessage);
            // mark errors as resolved
            await resolveRuntimeErrors({ errorIds });
            setShowErrorDetails(false);
          }}
          className="rounded bg-white px-3 py-1 font-semibold text-red-500"
        >
          Fix
        </button>
      </div>
      {showErrorDetails && (
        <div className="max-h-48 space-y-2 overflow-y-auto bg-red-600 p-3 text-xs text-white">
          {unresolvedRuntimeErrors.map((err, idx) => (
            <RuntimeErrorCard
              key={idx}
              error={err}
              url={err.url}
              stackTrace={err.stack_trace}
            />
          ))}
        </div>
      )}
    </>
  );
}
