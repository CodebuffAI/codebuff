import { Wrench } from "lucide-react";
import React from "react";

// NOTE: Defined locally as the central type from schema was not available.
// This might need to be updated if schema changes.
type ToolCall = {
  name: string;
  args: any;
  id?: string;
  result?: any;
};

interface ToolCallProps {
  toolCall: ToolCall;
}

export const ToolCall: React.FC<ToolCallProps> = ({ toolCall }) => {
  return (
    <div className="rounded-md border border-zinc-200/50 bg-white/40 p-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-700">
          {toolCall.name}
        </span>
      </div>
      <pre className="mt-1 overflow-x-auto rounded-sm bg-zinc-50/50 p-1.5 text-[11px] text-xs text-zinc-600">
        {JSON.stringify(toolCall.args, null, 2)}
      </pre>
    </div>
  );
};
