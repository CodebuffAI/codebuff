import React from "react";
import { ExecuteCommandToolProps } from "./toolTypes";
import { ChevronRight, Terminal } from "lucide-react";

export const ExecuteCommandTool: React.FC<ExecuteCommandToolProps> = ({
  data,
  isProcessing,
  toolOutputs,
}) => {
  const lastOutput = toolOutputs?.[toolOutputs.length - 1];

  return (
    <div className="rounded-lg border border-zinc-200/50 bg-white/40 p-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-zinc-600" />
        <h3 className="text-sm font-semibold text-zinc-800">Run Command</h3>
      </div>
      <div className="mt-2 flex items-center gap-1 rounded-md bg-zinc-900/80 p-2 font-mono text-xs text-white">
        <ChevronRight className="h-3 w-3 text-zinc-400" />
        <span>{data.command}</span>
      </div>
      {lastOutput && (
        <div className="mt-2 text-xs">
          {lastOutput.stdout && (
            <pre className="whitespace-pre-wrap text-zinc-700">
              {lastOutput.stdout}
            </pre>
          )}
          {lastOutput.stderr && (
            <pre className="whitespace-pre-wrap text-red-500">
              {lastOutput.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
