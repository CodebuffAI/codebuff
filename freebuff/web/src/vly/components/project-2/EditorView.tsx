"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { FileExplorer } from "./editor/FileExplorer";
import { MonacoEditor } from "./editor/MonacoEditor";
import { EditorTabs } from "./editor/EditorTabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/vly/components/ui/resizable";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { toast } from "sonner";

interface EditorViewProps {
  projectId: Id<"project">;
}

interface OpenTab {
  path: string;
  hasChanges?: boolean;
}

export default function EditorView({ projectId }: EditorViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);

  const commitAndSync = useAction(
    api.editor.filesystem.commitAndSyncEditorChange,
  );

  const handleFileSelect = (path: string) => {
    // Check if tab is already open
    const existingTab = openTabs.find((tab) => tab.path === path);
    if (!existingTab) {
      // Add new tab
      setOpenTabs((prev) => [...prev, { path, hasChanges: false }]);
    }
    setSelectedFile(path);
  };

  const handleTabClose = (path: string) => {
    const tabIndex = openTabs.findIndex((tab) => tab.path === path);
    if (tabIndex === -1) return;

    const newTabs = openTabs.filter((tab) => tab.path !== path);
    setOpenTabs(newTabs);

    // If closing the active tab, switch to another tab
    if (path === selectedFile) {
      if (newTabs.length > 0) {
        // Select the tab to the left of the closed tab, or the first tab if closing leftmost
        const newIndex = Math.max(0, tabIndex - 1);
        setSelectedFile(newTabs[newIndex]?.path);
      } else {
        setSelectedFile(undefined);
      }
    }
  };

  const handleTabSelect = (path: string) => {
    setSelectedFile(path);
  };

  const updateTabChanges = (path: string, hasChanges: boolean) => {
    setOpenTabs((prev) =>
      prev.map((tab) => (tab.path === path ? { ...tab, hasChanges } : tab)),
    );
  };

  const handleFileSave = async (filePath: string) => {
    // Update tab state immediately
    updateTabChanges(filePath, false);

    // Commit and sync in the background
    try {
      const result = await commitAndSync({
        projectId,
        filePath,
      });

      if (result.success) {
        console.log(
          `[Editor] Committed and synced: ${filePath}`,
          result.commitHash,
        );
        // Silent success - no toast to avoid interrupting user
      } else {
        console.warn(`[Editor] Failed to commit: ${result.error}`);
        // Only show error if commit fails (GitHub sync errors are non-critical)
        if (result.error && !result.error.includes("GitHub")) {
          toast.error("Failed to commit changes", {
            description: result.error,
          });
        }
      }
    } catch (error: any) {
      console.error("[Editor] Error during commit:", error);
      // Only show critical errors
      if (error.message && !error.message.includes("sync")) {
        toast.error("Failed to commit changes", {
          description: error.message,
        });
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Code Editor</h2>
        <div className="text-xs text-gray-500">
          {openTabs.length} file{openTabs.length !== 1 ? "s" : ""} open
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <FileExplorer
            projectId={projectId}
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={75}>
          <div className="flex h-full flex-col">
            <EditorTabs
              tabs={openTabs}
              activeTab={selectedFile}
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
            />

            <MonacoEditor
              projectId={projectId}
              file={selectedFile}
              onSave={() => {
                if (selectedFile) {
                  handleFileSave(selectedFile);
                }
              }}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
