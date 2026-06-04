"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { Button } from "@/vly/components/ui/button";
import { Plus } from "lucide-react";
import { Integrations } from "./integrations/Integrations";
import { IntegrationsLibrary } from "./integrations/IntegrationsLibrary";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface IntegrationsViewProps {
  semanticIdentifier: string;
}

function IntegrationsView({ semanticIdentifier }: IntegrationsViewProps) {
  const [activeTab, setActiveTab] = useState("your-integrations");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);

  // Get user for god mode check
  const user = useQuery(api.users.viewer);

  return (
    <div className="flex w-full flex-col">
      {/* Beta feature subheading */}
      <div className="mb-4 rounded-lg border border-blue-200/50 bg-blue-50/80 p-3">
        <p className="text-sm text-blue-700">
          This is a beta feature. We are making improvements. Please report your
          feedback in the{" "}
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 underline hover:text-blue-800"
          >
            Discord
          </a>
          .
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col"
      >
        <div className="mb-4 flex flex-shrink-0 flex-col gap-3 border-b pb-3 sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <h2 className="text-base font-semibold">Integrations</h2>
              {activeTab === "your-integrations" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => setActiveTab("library")}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Integration</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              )}
            </div>
            <TabsList className="flex-shrink-0 self-start sm:self-auto">
              <TabsTrigger
                value="your-integrations"
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Your Integrations</span>
                <span className="sm:hidden">Your</span>
              </TabsTrigger>
              <TabsTrigger value="library" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Integration Library</span>
                <span className="sm:hidden">Library</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <TabsContent value="your-integrations" className="m-0 h-full">
            <Integrations
              semanticIdentifier={semanticIdentifier}
              selectedIntegrationId={selectedIntegrationId}
            />
          </TabsContent>

          <TabsContent value="library" className="m-0 h-full">
            <IntegrationsLibrary
              semanticIdentifier={semanticIdentifier}
              onIntegrationAdded={(integrationId) => {
                setActiveTab("your-integrations");
                setSelectedIntegrationId(integrationId);
              }}
              isGodMode={user?.role === "god"}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default IntegrationsView;
