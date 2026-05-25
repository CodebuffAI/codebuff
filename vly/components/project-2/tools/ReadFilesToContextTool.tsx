import React from "react";
import { ReadFilesToContextToolProps } from "./toolTypes";
import { FileText } from "lucide-react";

export const ReadFilesToContextTool: React.FC<ReadFilesToContextToolProps> = ({
  data,
}) => {
  return (
    <div className="rounded-lg border border-zinc-200/50 bg-white/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-zinc-600" />
        <h3 className="text-sm font-semibold text-zinc-800">Reading Files</h3>
      </div>
      <ul className="space-y-1">
        {data.file_paths.map((file, index) => (
          <li
            key={index}
            className="flex items-center gap-2 rounded bg-white/50 px-2 py-1 text-xs"
          >
            <span className="font-mono text-zinc-700">{file}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
