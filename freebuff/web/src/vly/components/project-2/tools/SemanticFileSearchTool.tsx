import React from "react";
import { SemanticFileSearchToolProps } from "./toolTypes";
import { Search } from "lucide-react";

export const SemanticFileSearchTool: React.FC<SemanticFileSearchToolProps> = ({
  data,
}) => {
  return (
    <div className="rounded-lg border border-zinc-200/50 bg-white/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Search className="h-4 w-4 text-zinc-600" />
        <h3 className="text-sm font-semibold text-zinc-800">Searching Files</h3>
      </div>
      <p className="text-xs text-zinc-600">{data.query}</p>
    </div>
  );
};
