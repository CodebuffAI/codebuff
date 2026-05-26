import React from "react";

export function WorkflowTraceInfo({ workflowTrace }: { workflowTrace: any }) {
  if (workflowTrace === undefined) {
    return (
      <div className="text-sm text-gray-500">Loading workflow trace...</div>
    );
  }
  if (typeof workflowTrace === "object" && "error" in workflowTrace) {
    return <div className="text-sm text-red-500">{workflowTrace.error}</div>;
  }
  if (workflowTrace && typeof workflowTrace === "object") {
    return (
      <div className="rounded border bg-muted p-4">
        <div className="mb-2">
          <span className="font-semibold">Workflow Trace</span>
        </div>
        <div className="mb-2">
          <span className="font-semibold">In Progress Steps:</span>{" "}
          {Array.isArray(workflowTrace.inProgress)
            ? workflowTrace.inProgress.length
            : 0}
        </div>
        <div className="mb-2">
          <span className="font-semibold">Journal Entries:</span>{" "}
          {Array.isArray(workflowTrace.journalEntries)
            ? workflowTrace.journalEntries.length
            : 0}
        </div>
        <div className="mb-2">
          <span className="font-semibold">Log Level:</span>{" "}
          {workflowTrace.logLevel || "-"}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-blue-700">
            Raw Trace Data
          </summary>
          <pre className="mt-2 max-w-full overflow-x-auto rounded border bg-gray-50 p-2 text-xs">
            {JSON.stringify(workflowTrace, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
  return null;
}
