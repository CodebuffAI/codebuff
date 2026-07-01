"use client";

import { Info } from "lucide-react";
import { IntegrationsLibrary } from "./integrations/IntegrationsLibrary";

interface IntegrationsViewProps {
  semanticIdentifier: string;
}

function IntegrationsView({ semanticIdentifier }: IntegrationsViewProps) {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Compact header: live catalog + slim beta note, all on one band */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pb-2.5">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          Catalog
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            report feedback
          </a>
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <IntegrationsLibrary semanticIdentifier={semanticIdentifier} />
      </div>
    </div>
  );
}

export default IntegrationsView;
