"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UiPresetLibrary } from "./ui-presets/UiPresetLibrary";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface UiPresetsViewProps {
  semanticIdentifier: string;
}

function UiPresetsView({ semanticIdentifier }: UiPresetsViewProps) {
  const [activeTab, setActiveTab] = useState<"themes" | "components">("themes");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Get user for god mode check
  const user = useQuery(api.users.viewer);
  const isGod = user?.role === "god";

  return (
    <div className="flex w-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "themes" | "components")
        }
        className="flex flex-col"
      >
        <div className="mb-4 flex flex-shrink-0 flex-col gap-3 border-b pb-3 sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <h2 className="text-base font-semibold">UI Presets</h2>
            </div>
            <TabsList className="flex-shrink-0 self-start sm:self-auto">
              <TabsTrigger value="themes" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Themes</span>
                <span className="sm:hidden">Themes</span>
              </TabsTrigger>
              <TabsTrigger value="components" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Components</span>
                <span className="sm:hidden">Components</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <TabsContent value="themes" className="m-0 h-full">
            <UiPresetLibrary
              semanticIdentifier={semanticIdentifier}
              category="theme"
              selectedPresetId={selectedPresetId}
              onPresetSelected={setSelectedPresetId}
              isGodMode={isGod}
            />
          </TabsContent>

          <TabsContent value="components" className="m-0 h-full">
            <UiPresetLibrary
              semanticIdentifier={semanticIdentifier}
              category="component"
              selectedPresetId={selectedPresetId}
              onPresetSelected={setSelectedPresetId}
              isGodMode={isGod}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default UiPresetsView;
