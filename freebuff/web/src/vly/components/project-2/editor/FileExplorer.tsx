"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader,
  Plus,
  Trash2,
  RefreshCw,
  FileJson,
  Terminal,
  Code,
  Settings,
  FileImage,
  Palette,
  Database,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/vly/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/vly/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";
import { ScrollArea } from "@/vly/components/ui/scroll-area";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

interface FileExplorerProps {
  projectId: Id<"project">;
  onFileSelect: (path: string) => void;
  onFileHover?: (path: string) => void;
  selectedFile?: string;
}

export function FileExplorer({
  projectId,
  onFileSelect,
  onFileHover,
  selectedFile,
}: FileExplorerProps) {
  const cacheKey = `vscode-editor:fileTree:${String(projectId)}`;
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [newItemDialog, setNewItemDialog] = useState<{
    open: boolean;
    type: "file" | "directory";
    parentPath: string;
  }>({ open: false, type: "file", parentPath: "" });
  const [newItemName, setNewItemName] = useState("");

  const listFiles = useAction(api.editor.filesystem.listFiles);
  const createFile = useAction(api.editor.filesystem.createFile);
  const deleteFile = useAction(api.editor.filesystem.deleteFile);

  const loadDirectory = useCallback(
    async (path: string = "./") => {
      try {
        const files = await listFiles({ projectId, path });
        return files.map((file) => ({
          ...file,
          children: file.type === "directory" ? [] : undefined,
          isExpanded: false,
        }));
      } catch (error) {
        console.error("Error loading directory:", error);
        return [];
      }
    },
    [listFiles, projectId],
  );

  const refreshFileTree = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    const rootFiles = await loadDirectory("./");
    setFileTree(rootFiles);
    setLoading(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(cacheKey, JSON.stringify(rootFiles));
    }
  }, [cacheKey, loadDirectory]);

  useEffect(() => {
    let hasCachedTree = false;
    if (typeof window !== "undefined") {
      const cachedTree = window.sessionStorage.getItem(cacheKey);
      if (cachedTree) {
        try {
          const parsed = JSON.parse(cachedTree) as FileNode[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFileTree(parsed);
            setLoading(false);
            hasCachedTree = true;
          }
        } catch {
          // ignore malformed cache and refetch
        }
      }
    }

    void refreshFileTree({ silent: hasCachedTree });
  }, [refreshFileTree]);

  const toggleDirectory = async (node: FileNode, parentPath: string[] = []) => {
    const fullPath = [...parentPath, node.name];
    const pathStr = fullPath.join("/");

    if (expandedDirs.has(pathStr)) {
      // Collapse
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(pathStr);
        return next;
      });

      // Update file tree to remove children
      setFileTree((prev) =>
        updateNodeInTree(prev, fullPath, (n) => ({
          ...n,
          isExpanded: false,
          children: [],
        })),
      );
    } else {
      // Expand
      setExpandedDirs((prev) => new Set(prev).add(pathStr));

      // Update to show loading
      setFileTree((prev) =>
        updateNodeInTree(prev, fullPath, (n) => ({
          ...n,
          isLoading: true,
          isExpanded: true,
        })),
      );

      // Load children
      const children = await loadDirectory(pathStr);

      // Update with loaded children
      setFileTree((prev) =>
        updateNodeInTree(prev, fullPath, (n) => ({
          ...n,
          children,
          isLoading: false,
          isExpanded: true,
        })),
      );
    }
  };

  const updateNodeInTree = (
    nodes: FileNode[],
    path: string[],
    updater: (node: FileNode) => FileNode,
  ): FileNode[] => {
    if (path.length === 0) return nodes;

    const [first, ...rest] = path;

    return nodes.map((node) => {
      if (node.name === first) {
        if (rest.length === 0) {
          return updater(node);
        } else if (node.children) {
          return {
            ...node,
            children: updateNodeInTree(node.children, rest, updater),
          };
        }
      }
      return node;
    });
  };

  const handleCreateItem = async () => {
    if (!newItemName.trim()) return;

    // Validate file/folder name for path traversal and illegal characters
    if (/[/\\]|\.\./.test(newItemName)) {
      alert("Invalid file or folder name.");
      return;
    }

    const path = newItemDialog.parentPath
      ? `${newItemDialog.parentPath}/${newItemName}`
      : newItemName;

    try {
      await createFile({
        projectId,
        path,
        isDirectory: newItemDialog.type === "directory",
      });

      // Refresh the parent directory or root
      if (newItemDialog.parentPath) {
        const parentPath = newItemDialog.parentPath.split("/");
        const children = await loadDirectory(newItemDialog.parentPath);
        setFileTree((prev) =>
          updateNodeInTree(prev, parentPath, (n) => ({
            ...n,
            children,
          })),
        );
      } else {
        await refreshFileTree();
      }

      setNewItemDialog({ open: false, type: "file", parentPath: "" });
      setNewItemName("");
    } catch (error) {
      console.error("Error creating item:", error);
    }
  };

  const handleDeleteItem = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;

    try {
      await deleteFile({ projectId, path });
      await refreshFileTree();
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const fileName = name.toLowerCase();

    // TypeScript and JavaScript files
    if (ext === "ts" || ext === "tsx") {
      return <Code className="h-4 w-4 text-blue-600" />;
    }
    if (ext === "js" || ext === "jsx") {
      return <Code className="h-4 w-4 text-yellow-500" />;
    }

    // Shell scripts
    if (ext === "sh" || ext === "bash" || ext === "zsh") {
      return <Terminal className="h-4 w-4 text-green-600" />;
    }

    // JSON files
    if (ext === "json") {
      return <FileJson className="h-4 w-4 text-orange-500" />;
    }

    // Config files
    if (
      fileName.includes("config") ||
      ext === "conf" ||
      ext === "ini" ||
      fileName === "package.json" ||
      fileName === "tsconfig.json" ||
      fileName === ".env" ||
      fileName.startsWith(".env.")
    ) {
      return <Settings className="h-4 w-4 text-gray-600" />;
    }

    // CSS and styling
    if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") {
      return <Palette className="h-4 w-4 text-pink-500" />;
    }

    // Images
    if (
      ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"].includes(
        ext || "",
      )
    ) {
      return <FileImage className="h-4 w-4 text-purple-500" />;
    }

    // HTML
    if (ext === "html" || ext === "htm") {
      return <Code className="h-4 w-4 text-red-500" />;
    }

    // Markdown
    if (ext === "md" || ext === "mdx") {
      return <FileText className="h-4 w-4 text-blue-700" />;
    }

    // Database
    if (ext === "sql" || ext === "db" || ext === "sqlite") {
      return <Database className="h-4 w-4 text-teal-600" />;
    }

    // Default text file
    return <FileText className="h-4 w-4 text-gray-500" />;
  };

  const renderNode = (
    node: FileNode,
    level: number = 0,
    parentPath: string[] = [],
  ) => {
    const fullPath = [...parentPath, node.name];
    const pathStr = fullPath.join("/");
    const isExpanded = expandedDirs.has(pathStr);
    const isSelected = selectedFile === pathStr;

    return (
      <div key={pathStr}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={`flex cursor-pointer items-center gap-1 px-2 py-1 ${
                isSelected ? "bg-[#37373d]" : "hover:bg-[#2a2d2e]"
              }`}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              onClick={() => {
                if (node.type === "directory") {
                  toggleDirectory(node, parentPath);
                } else if (node.type === "file") {
                  onFileSelect(pathStr);
                }
              }}
              onMouseEnter={() => {
                if (node.type === "file") {
                  onFileHover?.(pathStr);
                }
              }}
            >
              {node.type === "directory" ? (
                <>
                  {node.isLoading ? (
                    <Loader className="h-3 w-3 animate-spin" />
                  ) : isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 text-primary" />
                  )}
                </>
              ) : (
                <>
                  <div className="w-3" />
                  {getFileIcon(node.name)}
                </>
              )}
              <span className="flex-1 truncate text-xs text-[#d4d4d4]">{node.name}</span>
              {node.size !== undefined && (
                <span className="text-xs text-[#858585]">
                  {(node.size / 1024).toFixed(1)}KB
                </span>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {node.type === "directory" && (
              <>
                <ContextMenuItem
                  onClick={() =>
                    setNewItemDialog({
                      open: true,
                      type: "file",
                      parentPath: pathStr,
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New File
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() =>
                    setNewItemDialog({
                      open: true,
                      type: "directory",
                      parentPath: pathStr,
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Folder
                </ContextMenuItem>
              </>
            )}
            <ContextMenuItem onClick={() => handleDeleteItem(pathStr)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {node.type === "directory" &&
          isExpanded &&
          node.children &&
          node.children.map((child) => renderNode(child, level + 1, fullPath))}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-[#2d2d30] p-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#cccccc]">
          Explorer
        </span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-[#bcbcbc] hover:bg-[#2a2d2e]"
            onClick={() =>
              setNewItemDialog({ open: true, type: "file", parentPath: "" })
            }
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-[#bcbcbc] hover:bg-[#2a2d2e]"
            onClick={() => {
              void refreshFileTree();
            }}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader className="h-4 w-4 animate-spin" />
          </div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#858585]">
            No files found
          </div>
        ) : (
          <div className="py-1">{fileTree.map((node) => renderNode(node))}</div>
        )}
      </ScrollArea>

      <Dialog
        open={newItemDialog.open}
        onOpenChange={(open) => setNewItemDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create New{" "}
              {newItemDialog.type === "directory" ? "Folder" : "File"}
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new{" "}
              {newItemDialog.type === "directory" ? "folder" : "file"}
              {newItemDialog.parentPath && ` in ${newItemDialog.parentPath}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="col-span-3"
                placeholder={
                  newItemDialog.type === "directory"
                    ? "folder-name"
                    : "file-name.js"
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateItem();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewItemDialog({ open: false, type: "file", parentPath: "" });
                setNewItemName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateItem}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
