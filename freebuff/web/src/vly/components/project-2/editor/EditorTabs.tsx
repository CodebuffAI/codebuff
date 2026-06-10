"use client";

import { X } from "lucide-react";
import { Button } from "@/vly/components/ui/button";

interface EditorTab {
  path: string;
  hasChanges?: boolean;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTab?: string;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
}

export function EditorTabs({
  tabs,
  activeTab,
  onTabSelect,
  onTabClose,
}: EditorTabsProps) {
  if (tabs.length === 0) {
    return null;
  }

  const getFileName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  return (
    <div className="flex items-center overflow-x-auto border-b border-[#2d2d30] bg-[#1e1e1e]">
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          const fileName = getFileName(tab.path);

          return (
            <div
              key={tab.path}
               className={`group relative flex cursor-pointer items-center gap-1 border-r border-[#2d2d30] px-3 py-1.5 transition-colors ${
                 isActive
                   ? "border-b-2 border-b-blue-500 bg-[#1f1f1f]"
                   : "hover:bg-[#2a2d2e]"
               } `}
              onClick={() => onTabSelect(tab.path)}
            >
              <span className="select-none text-xs text-[#cccccc]">
                {fileName}
                {tab.hasChanges && (
                  <span className="ml-1 text-orange-500">●</span>
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.path);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
