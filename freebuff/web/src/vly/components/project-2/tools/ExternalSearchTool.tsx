import React from "react";
import { ExternalSearchToolProps } from "./toolTypes";
import { Globe } from "lucide-react";

export const ExternalSearchTool: React.FC<ExternalSearchToolProps> = ({
  data,
}) => {
  return (
    <div className="rounded-lg border border-zinc-200/50 bg-white/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Globe className="h-4 w-4 text-zinc-600" />
        <h3 className="text-sm font-semibold text-zinc-800">Searching Web</h3>
      </div>
      <div className="space-y-1">
        {data.queries.map((query, index) => (
          <p
            key={index}
            className="rounded bg-white/50 px-2 py-1 text-xs text-zinc-600"
          >
            {query.query}
            {query.ask_convex_docs && (
              <span className="ml-2 text-blue-600">(Convex docs)</span>
            )}
          </p>
        ))}
      </div>
    </div>
  );
};
