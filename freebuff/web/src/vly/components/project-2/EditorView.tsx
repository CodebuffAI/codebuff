"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";
import { FileExplorer } from "./editor/FileExplorer";
import { MonacoEditor } from "./editor/MonacoEditor";
import { EditorTabs } from "./editor/EditorTabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/vly/components/ui/resizable";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import {
  Files,
  Search,
} from "lucide-react";

interface EditorViewProps {
  projectId: Id<"project">;
}

interface OpenTab {
  path: string;
  hasChanges?: boolean;
}

type SidebarView = "explorer" | "search";

export default function EditorView({ projectId }: EditorViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [prefetchFilePath, setPrefetchFilePath] = useState<string | undefined>();
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchRequestVersion, setSearchRequestVersion] = useState(0);
  const [goToLine, setGoToLine] = useState<number | undefined>();
  const [goToColumn, setGoToColumn] = useState<number | undefined>();
  const [goToSignal, setGoToSignal] = useState(0);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [workspaceSearchLoading, setWorkspaceSearchLoading] = useState(false);
  const [workspaceSearchError, setWorkspaceSearchError] = useState<string | null>(
    null,
  );
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<
    Array<{ path: string; line: number; column: number; preview: string }>
  >([]);
  const [activeSidebarView, setActiveSidebarView] =
    useState<SidebarView>("explorer");

  const searchInFiles = useAction(api.editor.filesystem.searchInFiles);

  const latestAgentCommit = useQuery(
    api.coding_agent.cli_agent.queries.getLatestAgentCommitHashForProject,
    {
      projectId,
    },
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
    updateTabChanges(filePath, false);
  };

  const latestCommitRef = useRef<string | null>(null);

  useEffect(() => {
    const nextCommit = latestAgentCommit?.commitHash ?? null;
    if (!nextCommit) return;
    if (latestCommitRef.current === nextCommit) return;

    latestCommitRef.current = nextCommit;
    setReloadVersion((prev) => prev + 1);
  }, [latestAgentCommit?.commitHash]);

  useEffect(() => {
    if (activeSidebarView !== "search") return;

    const query = workspaceSearchQuery.trim();
    if (!query) {
      setWorkspaceSearchResults([]);
      setWorkspaceSearchError(null);
      setWorkspaceSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setWorkspaceSearchLoading(true);
      setWorkspaceSearchError(null);
      try {
        const results = await searchInFiles({
          projectId,
          query,
          maxResults: 200,
          caseSensitive: false,
          wholeWord: false,
          regex: false,
        });
        setWorkspaceSearchResults(results);
      } catch (error) {
        console.error("Workspace search failed", error);
        setWorkspaceSearchResults([]);
        const message =
          error instanceof Error ? error.message : "Search failed unexpectedly";
        setWorkspaceSearchError(message);
      } finally {
        setWorkspaceSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSidebarView, projectId, searchInFiles, workspaceSearchQuery]);

  const handleSearchResultClick = (
    result: { path: string; line: number; column: number },
  ) => {
    handleFileSelect(result.path);
    setGoToLine(result.line);
    setGoToColumn(result.column);
    setGoToSignal((prev) => prev + 1);
  };

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <div className="flex h-10 items-center justify-between border-b border-[#2d2d30] bg-[#181818] px-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="rounded px-2 py-1 text-xs text-[#bcbcbc] transition-colors hover:bg-[#2a2d2e]"
            title="Back"
          >
            {"<"}
          </button>
          <button
            onClick={() => window.history.forward()}
            className="rounded px-2 py-1 text-xs text-[#bcbcbc] transition-colors hover:bg-[#2a2d2e]"
            title="Forward"
          >
            {">"}
          </button>
        </div>
        <div className="w-full max-w-xl px-4">
          <div className="flex h-7 items-center rounded border border-[#3c3c3c] bg-[#1f1f1f] px-3 text-xs text-[#9d9d9d]">
            repo
          </div>
        </div>
        <div className="text-xs text-[#858585]">
          {openTabs.length} file{openTabs.length !== 1 ? "s" : ""} open
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <div className="flex h-full border-r border-[#2d2d30] bg-[#1e1e1e]">
            <div className="flex w-12 flex-col items-center gap-3 border-r border-[#2d2d30] bg-[#181818] py-3">
              <button
                onClick={() => setActiveSidebarView("explorer")}
                className={`rounded p-2 transition-colors hover:bg-[#2a2d2e] ${
                  activeSidebarView === "explorer"
                    ? "text-[#d4d4d4]"
                    : "text-[#858585]"
                }`}
                title="Explorer"
              >
                <Files className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setActiveSidebarView("search");
                  setSearchRequestVersion((prev) => prev + 1);
                }}
                className={`rounded p-2 transition-colors hover:bg-[#2a2d2e] ${
                  activeSidebarView === "search"
                    ? "text-[#d4d4d4]"
                    : "text-[#858585]"
                }`}
                title="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              {activeSidebarView === "explorer" ? (
                <FileExplorer
                  projectId={projectId}
                  onFileSelect={handleFileSelect}
                  onFileHover={setPrefetchFilePath}
                  selectedFile={selectedFile}
                />
              ) : (
                <WorkspaceSearchPanel
                  query={workspaceSearchQuery}
                  loading={workspaceSearchLoading}
                  error={workspaceSearchError}
                  results={workspaceSearchResults}
                  onQueryChange={setWorkspaceSearchQuery}
                  onResultClick={handleSearchResultClick}
                />
              )}
            </div>
          </div>
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
              prefetchFilePath={prefetchFilePath}
              reloadSignal={`${reloadVersion}`}
              openSearchSignal={searchRequestVersion}
              goToLine={goToLine}
              goToColumn={goToColumn}
              goToSignal={goToSignal}
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

function WorkspaceSearchPanel({
  query,
  loading,
  error,
  results,
  onQueryChange,
  onResultClick,
}: {
  query: string;
  loading: boolean;
  error: string | null;
  results: Array<{ path: string; line: number; column: number; preview: string }>;
  onQueryChange: (value: string) => void;
  onResultClick: (result: {
    path: string;
    line: number;
    column: number;
    preview: string;
  }) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="border-b border-[#2d2d30] p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#cccccc]">
          Search
        </div>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search across files"
          className="mt-2 w-full rounded border border-[#3c3c3c] bg-[#1f1f1f] px-2 py-1 text-xs text-[#d4d4d4] outline-none focus:border-[#007acc]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="p-2 text-xs text-[#858585]">Searching...</div>
        ) : error ? (
          <div className="p-2 text-xs text-[#f48771]">{error}</div>
        ) : results.length === 0 ? (
          <div className="p-2 text-xs text-[#858585]">No matches</div>
        ) : (
          <div className="space-y-1">
            {results.map((result, index) => (
              <button
                key={`${result.path}:${result.line}:${result.column}:${index}`}
                onClick={() => onResultClick(result)}
                className="w-full rounded border border-transparent px-2 py-1 text-left transition-colors hover:border-[#2d2d30] hover:bg-[#2a2d2e]"
              >
                <div className="truncate text-xs text-[#cccccc]">{result.path}</div>
                <div className="text-[11px] text-[#858585]">Line {result.line}</div>
                <div className="mt-0.5 text-[11px] text-[#a6a6a6]">
                  {result.preview.trim()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
