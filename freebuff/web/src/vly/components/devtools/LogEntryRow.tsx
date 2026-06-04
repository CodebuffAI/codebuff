import React from "react";

export function LogEntryRow({
  log,
  idx,
  logTypeColor,
  group: _group,
  showDetails,
}: {
  log: any;
  idx: number;
  logTypeColor: (type: string | undefined) => string;
  group?: { slow?: boolean };
  showDetails?: boolean;
}) {
  const type = log.type;
  const meta = log.meta || {};
  return (
    <div
      key={idx}
      className={`relative flex items-start gap-2 border-l-4 pl-2 ${logTypeColor(type)}`}
      style={{ minHeight: 32 }}
    >
      <div className="absolute -left-5 top-1 z-10 h-2 w-2 rounded-full bg-blue-400" />
      <div className="min-w-[80px] font-mono text-xs text-gray-700">
        [{log.seconds}s{log.delta !== 0 ? ` (+${log.delta}s)` : ""}]
      </div>
      <div className="flex w-full flex-col text-xs">
        <div className="flex items-center gap-2">
          <span>{log.message}</span>
          {type === "rate_limit" && (
            <span className="ml-1 rounded bg-red-500 px-2 py-0.5 text-[10px] text-white">
              RATE LIMIT
            </span>
          )}
          {(type?.includes("error") || type === "rate_limit") && (
            <span className="ml-1 rounded bg-orange-500 px-2 py-0.5 text-[10px] text-white">
              ERROR
            </span>
          )}
          {meta.durationMs && (
            <span className="ml-1 rounded bg-gray-200 px-2 py-0.5 text-[10px] text-gray-800">
              {meta.durationMs}ms
            </span>
          )}
          {meta.phase && (
            <span className="ml-1 rounded bg-gray-300 px-2 py-0.5 text-[10px] text-gray-800">
              {meta.phase}
            </span>
          )}
          {meta.toolName && (
            <span className="ml-1 rounded bg-purple-200 px-2 py-0.5 text-[10px] text-purple-800">
              {meta.toolName}
            </span>
          )}
          {meta.file && (
            <span className="ml-1 rounded bg-green-200 px-2 py-0.5 text-[10px] text-green-800">
              {meta.file}
            </span>
          )}
          {meta.model && (
            <span className="ml-1 rounded bg-blue-200 px-2 py-0.5 text-[10px] text-blue-800">
              {meta.model}
            </span>
          )}
          {meta.provider && (
            <span
              className={`ml-1 rounded px-2 py-0.5 text-[10px] ${
                meta.provider === "bedrock"
                  ? "bg-green-200 text-green-800"
                  : meta.provider === "anthropic"
                    ? "bg-orange-200 text-orange-800"
                    : meta.provider === "anthropic_low_qos"
                      ? "bg-yellow-200 text-yellow-800"
                      : "bg-gray-200 text-gray-800"
              }`}
            >
              {meta.provider}
            </span>
          )}
        </div>
        {/* Show details for errors, slow steps, or on hover */}
        {showDetails && meta && (
          <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap rounded border bg-gray-50 p-2 text-[10px]">
            {meta.error && (
              <div>
                <b>Error:</b> {meta.error}
              </div>
            )}
            {meta.stack && (
              <div>
                <b>Stack:</b> {meta.stack}
              </div>
            )}
            {meta.output && (
              <div>
                <b>Output:</b> {meta.output}
              </div>
            )}
            {meta.result && (
              <div>
                <b>Result:</b> {JSON.stringify(meta.result, null, 2)}
              </div>
            )}
            {meta.args && (
              <div>
                <b>Args:</b> {JSON.stringify(meta.args, null, 2)}
              </div>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
