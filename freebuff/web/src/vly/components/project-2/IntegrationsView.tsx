"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { Info } from "lucide-react";
import { Integrations } from "./integrations/Integrations";
import { IntegrationsLibrary } from "./integrations/IntegrationsLibrary";

interface IntegrationsViewProps {
  semanticIdentifier: string;
}

function IntegrationsView({ semanticIdentifier }: IntegrationsViewProps) {
  const [activeTab, setActiveTab] = useState("library");

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full w-full flex-col"
    >
      {/* Compact header: title + tabs + slim beta note, all on one band */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pb-2.5">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <TabsList className="h-8">
          <TabsTrigger value="library" className="h-6 px-2.5 text-xs">
            Catalog
          </TabsTrigger>
          <TabsTrigger value="your-integrations" className="h-6 px-2.5 text-xs">
            Yours
          </TabsTrigger>
        </TabsList>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Beta —</span>
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
        <TabsContent value="library" className="m-0 h-full">
          <IntegrationsLibrary semanticIdentifier={semanticIdentifier} />
        </TabsContent>

        <TabsContent value="your-integrations" className="m-0 h-full">
          <Integrations
            semanticIdentifier={semanticIdentifier}
            selectedIntegrationId={null}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

export default IntegrationsView;
