import React from "react";
import { FileStringCodeReplaceToolData } from "./toolTypes";

interface FileStringCodeReplaceToolProps {
  data: FileStringCodeReplaceToolData;
  isProcessing?: boolean;
}

export const FileStringCodeReplaceTool: React.FC<
  FileStringCodeReplaceToolProps
> = ({ data, isProcessing = false }) => {
  const { file_path, search_string, replace_string } = data;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-4 text-orange-600">🔧</div>
        <h3 className="text-sm font-semibold text-orange-800">
          Code Edit: String Replace
        </h3>
      </div>

      <div className="space-y-2 text-xs">
        <div>
          <span className="font-semibold text-orange-700">File:</span>{" "}
          <span className="font-mono text-orange-600">{file_path}</span>
        </div>

        <div>
          <span className="font-semibold text-orange-700">Search:</span>{" "}
          <span className="rounded bg-orange-100 px-1 font-mono text-orange-600">
            {search_string.length > 50
              ? `${search_string.substring(0, 50)}...`
              : search_string}
          </span>
        </div>

        <div>
          <span className="font-semibold text-orange-700">Replace with:</span>{" "}
          <span className="rounded bg-orange-100 px-1 font-mono text-orange-600">
            {replace_string.length > 50
              ? `${replace_string.substring(0, 50)}...`
              : replace_string}
          </span>
        </div>
      </div>

      <div className="mt-2 text-xs text-orange-500">
        {isProcessing
          ? "Performing string replacement..."
          : "String replacement completed"}
      </div>
    </div>
  );
};
