"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSignedInUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Trash2,
  FolderOpen,
  FileText,
  Save,
  Loader,
  Eye,
  ChevronRight,
  AlertTriangle,
  HardDrive,
  RefreshCw,
} from "lucide-react";

interface DaytonaFSDashboardProps {
  projectId: Id<"project">;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: string;
  permissions: string;
}

export default function DaytonaFSDashboard({
  projectId,
}: DaytonaFSDashboardProps) {
  const user = useSignedInUser();

  if (!user || user.role !== "god") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-lg font-semibold text-red-600">God Mode Required</p>
        <p className="text-sm text-zinc-500">
          This dashboard is only accessible to god mode admins.
        </p>
      </div>
    );
  }

  return <DaytonaFSContent projectId={projectId} />;
}

function DaytonaFSContent({ projectId }: { projectId: Id<"project"> }) {
  const [browsePath, setBrowsePath] = useState("");
  const [filePath, setFilePath] = useState("");
  const [deletePath, setDeletePath] = useState("");
  const [listing, setListing] = useState<FileEntry[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [viewingPath, setViewingPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteRecursive, setDeleteRecursive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const godModeListFiles = useAction(api.editor.filesystem.godModeListFiles);
  const godModeReadFile = useAction(api.editor.filesystem.godModeReadFile);
  const godModeWriteFile = useAction(api.editor.filesystem.godModeWriteFile);
  const godModeDeleteFile = useAction(api.editor.filesystem.godModeDeleteFile);

  const fetchListing = async (path: string) => {
    setLoading(true);
    try {
      const result = await godModeListFiles({ projectId, path });
      setListing(result.entries);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to list files";
      toast.error(message);
      setListing([]);
    } finally {
      setLoading(false);
    }
  };

  const handleListFiles = () => fetchListing(browsePath);

  const handleNavigateToDir = (dirName: string) => {
    const newPath = browsePath ? `${browsePath}/${dirName}` : dirName;
    setBrowsePath(newPath);
    fetchListing(newPath);
  };

  const handleNavigateUp = () => {
    const parts = browsePath.split("/").filter(Boolean);
    parts.pop();
    const newPath = parts.join("/");
    setBrowsePath(newPath);
    fetchListing(newPath);
  };

  const handleViewFile = async () => {
    if (!filePath.trim()) {
      toast.error("Please enter a file path");
      return;
    }
    setLoading(true);
    try {
      const result = await godModeReadFile({
        projectId,
        path: filePath,
      });
      setFileContent(result.content);
      setEditedContent(result.content);
      setViewingPath(filePath);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to read file";
      toast.error(message);
      setFileContent(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!viewingPath) return;
    setLoading(true);
    try {
      await godModeWriteFile({
        projectId,
        path: viewingPath,
        content: editedContent,
      });
      setFileContent(editedContent);
      toast.success(`Saved ${viewingPath}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to save file";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!deletePath.trim()) {
      toast.error("Please enter a file path");
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    try {
      await godModeDeleteFile({
        projectId,
        path: deletePath,
        recursive: deleteRecursive,
      });
      toast.success(`Deleted ${deletePath}`);
      setDeletePath("");
      setConfirmDelete(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to delete";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFileClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      handleNavigateToDir(entry.name);
    } else {
      const fullPath = browsePath ? `${browsePath}/${entry.name}` : entry.name;
      setFilePath(fullPath);
    }
  };

  const hasUnsavedChanges =
    fileContent !== null && editedContent !== fileContent;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-lg border border-amber-400/40 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-amber-900">
            Daytona File System Dashboard
          </h2>
        </div>
        <p className="mt-1 text-xs text-amber-700">
          ⚠️ God Mode Only — Direct file system operations on the sandbox. Paths
          are relative to{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-amber-800">
            /home/daytona/
          </code>
        </p>
      </div>

      <Tabs defaultValue="browse" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-100">
          <TabsTrigger
            value="browse"
            className="gap-1.5 text-xs data-[state=active]:bg-white"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Browse
          </TabsTrigger>
          <TabsTrigger
            value="view-edit"
            className="gap-1.5 text-xs data-[state=active]:bg-white"
          >
            <FileText className="h-3.5 w-3.5" />
            View / Edit
          </TabsTrigger>
          <TabsTrigger
            value="delete"
            className="gap-1.5 text-xs data-[state=active]:bg-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </TabsTrigger>
        </TabsList>

        {/* Browse Tab */}
        <TabsContent value="browse" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={browsePath}
                onChange={(e) => setBrowsePath(e.target.value)}
                placeholder="e.g. codebase/src or .local/bin (empty for root)"
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleListFiles();
                }}
              />
            </div>
            <Button
              onClick={handleListFiles}
              disabled={loading}
              size="sm"
              className="gap-1.5"
            >
              {loading ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              List
            </Button>
          </div>

          {/* Breadcrumb */}
          {browsePath && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <button
                onClick={() => {
                  setBrowsePath("");
                  fetchListing("");
                }}
                className="text-blue-600 hover:underline"
              >
                /home/daytona
              </button>
              {browsePath.split("/").map((segment, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => {
                      const newPath = arr.slice(0, i + 1).join("/");
                      setBrowsePath(newPath);
                      fetchListing(newPath);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* File Listing */}
          {listing.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white">
              {/* Back navigation */}
              {browsePath && (
                <button
                  onClick={handleNavigateUp}
                  className="flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm text-blue-600 transition-colors hover:bg-zinc-50"
                >
                  <FolderOpen className="h-4 w-4 text-amber-500" />
                  <span>..</span>
                </button>
              )}
              {listing.map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => handleBrowseFileClick(entry)}
                  className="flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-zinc-50"
                >
                  {entry.isDirectory ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                  )}
                  <span
                    className={`flex-1 font-mono text-xs ${
                      entry.isDirectory
                        ? "font-medium text-zinc-800"
                        : "text-zinc-600"
                    }`}
                  >
                    {entry.name}
                    {entry.isDirectory ? "/" : ""}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {entry.size}B
                  </span>
                  <span className="font-mono text-[10px] text-zinc-300">
                    {entry.permissions}
                  </span>
                </button>
              ))}
            </div>
          )}

          {listing.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-12 text-center">
              <FolderOpen className="mb-2 h-8 w-8 text-zinc-300" />
              <p className="text-sm text-zinc-500">
                Enter a path and click List to browse files
              </p>
            </div>
          )}
        </TabsContent>

        {/* View/Edit Tab */}
        <TabsContent value="view-edit" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g. codebase/src/App.tsx or .bashrc"
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleViewFile();
                }}
              />
            </div>
            <Button
              onClick={handleViewFile}
              disabled={loading}
              size="sm"
              className="gap-1.5"
            >
              {loading ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Load
            </Button>
          </div>

          {fileContent !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-zinc-500" />
                  <span className="font-mono text-xs text-zinc-600">
                    /home/daytona/{viewingPath}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <span className="text-xs font-medium text-amber-600">
                      Unsaved changes
                    </span>
                  )}
                  <Button
                    onClick={handleSaveFile}
                    disabled={loading || !hasUnsavedChanges}
                    size="sm"
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    className="gap-1.5"
                  >
                    {loading ? (
                      <Loader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="h-[500px] w-full resize-y rounded-lg border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-green-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                spellCheck={false}
              />
            </div>
          )}

          {fileContent === null && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-12 text-center">
              <Eye className="mb-2 h-8 w-8 text-zinc-300" />
              <p className="text-sm text-zinc-500">
                Enter a file path and click Load to view and edit
              </p>
            </div>
          )}
        </TabsContent>

        {/* Delete Tab */}
        <TabsContent value="delete" className="mt-4 space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700">
                Danger Zone
              </span>
            </div>
            <p className="mt-1 text-xs text-red-600">
              Deleted files cannot be recovered. Double-check the path before
              deleting.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={deletePath}
                onChange={(e) => {
                  setDeletePath(e.target.value);
                  setConfirmDelete(false);
                }}
                placeholder="e.g. codebase/src/old-file.tsx"
                className="border-red-200 font-mono text-sm focus:border-red-400 focus:ring-red-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDeleteFile();
                }}
              />
            </div>
            <Button
              onClick={handleDeleteFile}
              disabled={loading || !deletePath.trim()}
              size="sm"
              variant="destructive"
              className="gap-1.5"
            >
              {loading ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </Button>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={deleteRecursive}
              onChange={(e) => setDeleteRecursive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-xs text-zinc-600">
              Recursive delete (for directories)
            </span>
          </label>

          {confirmDelete && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                ⚠️ Are you sure you want to delete{" "}
                <code className="rounded bg-amber-100 px-1 font-mono">
                  /home/daytona/{deletePath}
                </code>
                {deleteRecursive ? " and all its contents" : ""}? Click Delete
                again to confirm.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
