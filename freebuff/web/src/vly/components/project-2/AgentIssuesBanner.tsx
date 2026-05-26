import { AlertTriangle } from "lucide-react";

export function AgentIssuesBanner() {
  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="font-medium">
        The agent is currently experiencing issues and will be fixed shortly.
      </span>
    </div>
  );
}
