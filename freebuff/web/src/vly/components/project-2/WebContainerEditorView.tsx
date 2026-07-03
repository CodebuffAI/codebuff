"use client";

import { Files, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ContainerBootState,
  getContainerBootStatus,
} from "@/vly/lib/webcontainer/bootState";
import { getWebContainer } from "@/vly/lib/webcontainer/client";
import { IGNORED_SNAPSHOT_PATHS } from "@/vly/lib/webcontainer/constants";
import { requestWebContainerSnapshotBackup } from "@/vly/lib/webcontainer/setupProject";

const POLL_INTERVAL_MS = 2_000;
const SOURCE_ROOT = "src";

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  expanded?: boolean;
}

async function readdir(dirPath: string): Promise<DirEntry[]> {
  const container = await getWebContainer();
  try {
    const entries = await container.fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: dirPath === "." ? entry.name : `${dirPath}/${entry.name}`,
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

function isIgnored(path: string): boolean {
  return IGNORED_SNAPSHOT_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

async function buildSourceTreeRoots(): Promise<TreeNode[]> {
  const entries = await readdir(SOURCE_ROOT);
  return entries
    .filter((entry) => !isIgnored(entry.path))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
    }));
}

function FileTree({
  nodes,
  selectedFile,
  onSelect,
  onToggle,
  depth = 0,
}: {
  nodes: TreeNode[];
  selectedFile: string | undefined;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() =>
              node.isDirectory ? onToggle(node.path) : onSelect(node.path)
            }
            title={node.path}
            className={[
              "flex w-full items-center gap-1 truncate px-2 py-0.5 text-left text-xs transition-colors hover:bg-[#2a2d2e]",
              !node.isDirectory && selectedFile === node.path
                ? "bg-[#094771] text-white"
                : "text-[#cccccc]",
            ].join(" ")}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            {node.isDirectory ? (
              <span className="shrink-0 text-[10px] text-[#858585]">
                {node.expanded ? "▾" : "▸"}
              </span>
            ) : (
              <span className="shrink-0 w-2.5" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {node.isDirectory && node.expanded && node.children && (
            <FileTree
              nodes={node.children}
              selectedFile={selectedFile}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

export function WebContainerEditorView() {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSourceDir, setHasSourceDir] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const selectedFileRef = useRef<string | undefined>(undefined);
  const isDirtyRef = useRef(false);
  selectedFileRef.current = selectedFile;
  isDirtyRef.current = isDirty;

  useEffect(() => {
    function check() {
      const { state } = getContainerBootStatus();
      if (state === ContainerBootState.READY) {
        setReady(true);
      }
    }
    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, []);

  const loadTree = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const nodes = await buildSourceTreeRoots();
      setHasSourceDir(nodes.length > 0);
      setRoots((previous) =>
        nodes.map((node) => {
          const existing = previous.find((p) => p.path === node.path);
          if (existing?.expanded && existing.children) {
            return { ...node, expanded: true, children: existing.children };
          }
          return node;
        }),
      );
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadTree();
    pollRef.current = setInterval(() => void loadTree(true), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [ready, loadTree]);

  const handleToggle = useCallback(async (path: string) => {
    setRoots((previous) => {
      function toggle(nodes: TreeNode[]): TreeNode[] {
        return nodes.map((node) => {
          if (node.path === path) {
            return node.expanded ? { ...node, expanded: false } : node;
          }
          if (node.children) {
            return { ...node, children: toggle(node.children) };
          }
          return node;
        });
      }
      return toggle(previous);
    });

    const entries = await readdir(path);
    const children = entries
      .filter((entry) => !isIgnored(entry.path))
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDirectory,
      }));

    setRoots((previous) => {
      function applyChildren(nodes: TreeNode[]): TreeNode[] {
        return nodes.map((node) => {
          if (node.path === path) {
            return { ...node, expanded: true, children };
          }
          if (node.children) {
            return { ...node, children: applyChildren(node.children) };
          }
          return node;
        });
      }
      return applyChildren(previous);
    });
  }, []);

  const handleSelect = useCallback(async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    setIsDirty(false);
    try {
      const container = await getWebContainer();
      const content = await container.fs.readFile(path, "utf-8");
      setFileContent(content);
    } catch (error) {
      setFileContent(`// Could not read ${path}: ${String(error)}`);
    } finally {
      setLoadingFile(false);
    }
  }, []);

  const saveSelectedFile = useCallback(async () => {
    if (!selectedFile || !isDirtyRef.current) return;
    setSaving(true);
    try {
      const container = await getWebContainer();
      await container.fs.writeFile(selectedFile, fileContent);
      setIsDirty(false);
      requestWebContainerSnapshotBackup(1000);
    } finally {
      setSaving(false);
    }
  }, [fileContent, selectedFile]);

  useEffect(() => {
    if (!ready || !selectedFile) return;
    const id = setInterval(async () => {
      if (!selectedFileRef.current || isDirtyRef.current) return;
      try {
        const container = await getWebContainer();
        const content = await container.fs.readFile(selectedFileRef.current, "utf-8");
        setFileContent((previous) => (previous === content ? previous : content));
      } catch {
        // Ignore transient fs read errors while files are being modified.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ready, selectedFile]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-sm text-[#858585]">
        Waiting for WebContainer to boot...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#1e1e1e] text-[#d4d4d4]">
      <div className="flex w-56 shrink-0 flex-col border-r border-[#2d2d30]">
        <div className="flex h-9 items-center justify-between border-b border-[#2d2d30] px-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#bbb]">
            <Files className="h-3 w-3" />
            Explorer (src)
          </div>
          <button
            onClick={() => void loadTree()}
            title="Refresh file tree"
            className="rounded p-1 text-[#858585] hover:bg-[#2a2d2e] hover:text-[#d4d4d4]"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {hasSourceDir ? (
            <FileTree
              nodes={roots}
              selectedFile={selectedFile}
              onSelect={handleSelect}
              onToggle={handleToggle}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-[#858585]">
              No `src` directory found.
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {selectedFile ? (
          loadingFile ? (
            <div className="flex h-full items-center justify-center text-sm text-[#858585]">
              Loading...
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex h-9 items-center justify-between border-b border-[#2d2d30] px-3 text-xs text-[#9e9e9e]">
                <span className="truncate">{selectedFile}</span>
                <button
                  type="button"
                  onClick={() => void saveSelectedFile()}
                  disabled={!isDirty || saving}
                  className="rounded border border-[#3b3b3b] px-2 py-1 text-[11px] text-[#cccccc] disabled:opacity-50"
                >
                  {saving ? "Saving..." : isDirty ? "Save" : "Saved"}
                </button>
              </div>
              <textarea
                value={fileContent}
                onChange={(event) => {
                  setFileContent(event.target.value);
                  setIsDirty(true);
                }}
                onBlur={() => void saveSelectedFile()}
                spellCheck={false}
                className="h-full w-full flex-1 resize-none border-0 bg-[#1e1e1e] p-3 font-mono text-[13px] leading-5 text-[#d4d4d4] outline-none"
              />
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#858585]">
            Select a file inside `src` to view code.
          </div>
        )}
      </div>
    </div>
  );
}
