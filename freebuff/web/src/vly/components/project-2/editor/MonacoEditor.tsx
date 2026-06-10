"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Editor from "@monaco-editor/react";
import {
  initialize as initializeMonacoVsCode,
} from "@codingame/monaco-vscode-api";
import getFileServiceOverride from "@codingame/monaco-vscode-files-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import "@codingame/monaco-vscode-javascript-default-extension";
import "@codingame/monaco-vscode-typescript-basics-default-extension";
import "@codingame/monaco-vscode-typescript-language-features-default-extension";
import "@codingame/monaco-vscode-html-default-extension";
import "@codingame/monaco-vscode-css-default-extension";
import "@codingame/monaco-vscode-json-default-extension";
import { useAction } from "convex/react";
import { Loader, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/vly/components/ui/button";
import { toast } from "sonner";
import { SearchPanel } from "./SearchPanel";

interface MonacoEditorProps {
  projectId: Id<"project">;
  file?: string;
  prefetchFilePath?: string;
  onSave?: () => void;
  reloadSignal?: string;
  openSearchSignal?: number;
  goToLine?: number;
  goToColumn?: number;
  goToSignal?: number;
}

let monacoVsCodeInitialized = false;
let monacoVsCodeInitPromise: Promise<void> | null = null;
let monacoExtraLibsRegistered = false;

function resolveEditorLanguage(path: string, language: string) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx")) {
    return "typescript";
  }
  return language;
}

async function ensureMonacoVsCodeInitialized() {
  if (monacoVsCodeInitialized) return;
  if (monacoVsCodeInitPromise) {
    await monacoVsCodeInitPromise;
    return;
  }

  monacoVsCodeInitPromise = (async () => {
    if (typeof window !== "undefined") {
      (window as any).MonacoEnvironment = {
        getWorker: (_workerId: string, label: string) => {
          void label;
          return new Worker(
            new URL(
              "@codingame/monaco-vscode-api/workers/editor.worker",
              import.meta.url,
            ),
            { type: "module" },
          );
        },
      };
    }

    await initializeMonacoVsCode({
      ...getFileServiceOverride(),
      ...getLanguagesServiceOverride(),
    });

    monacoVsCodeInitialized = true;
  })();

  await monacoVsCodeInitPromise;
}

export function MonacoEditor({
  projectId,
  file,
  prefetchFilePath,
  onSave,
  reloadSignal,
  openSearchSignal,
  goToLine,
  goToColumn,
  goToSignal,
}: MonacoEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [language, setLanguage] = useState("plaintext");
  const [isImage, setIsImage] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<
    | {
        currentMatch: number;
        totalMatches: number;
      }
    | undefined
  >();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const readFile = useAction(api.editor.filesystem.readFile);
  const writeFile = useAction(api.editor.filesystem.writeFile);
  const prefetchedPathsRef = useRef<Set<string>>(new Set());

  const getFileCacheKey = useCallback(
    (path: string) => `vscode-editor:file:${String(projectId)}:${path}`,
    [projectId],
  );

  useEffect(() => {
    let active = true;
    void ensureMonacoVsCodeInitialized()
      .then(() => {
        if (active) setEditorReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize VS Code editor services", error);
        toast.error("Failed to initialize editor");
      });

    return () => {
      active = false;
    };
  }, []);

  const loadFile = useCallback(async () => {
    if (!file) {
      setContent("");
      setOriginalContent("");
      setLanguage("plaintext");
      setIsImage(false);
      setHasChanges(false);
      return;
    }

    let hasCachedContent = false;

    if (typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(getFileCacheKey(file));
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as {
            content: string;
            language: string;
            isImage: boolean;
          };
          setContent(parsed.content);
          setOriginalContent(parsed.content);
          setLanguage(resolveEditorLanguage(file, parsed.language));
          setIsImage(parsed.isImage || false);
          setHasChanges(false);
          setLoading(false);
          hasCachedContent = true;
        } catch {
          // ignore malformed cache and fetch fresh data
        }
      }
    }

    if (!hasCachedContent) {
      setLoading(true);
    }

    try {
      const fileData = await readFile({ projectId, path: file });
      setContent(fileData.content);
      setOriginalContent(fileData.content);
      setLanguage(resolveEditorLanguage(file, fileData.language));
      setIsImage(fileData.isImage || false);
      setHasChanges(false);

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          getFileCacheKey(file),
          JSON.stringify({
            content: fileData.content,
            language: fileData.language,
            isImage: fileData.isImage || false,
          }),
        );
      }
    } catch (error) {
      console.error("Error loading file:", error);
      toast.error("Failed to load file", {
        description: file,
      });
    } finally {
      if (!hasCachedContent) {
        setLoading(false);
      }
    }
  }, [file, getFileCacheKey, projectId, readFile]);

  useEffect(() => {
    loadFile();
  }, [loadFile, reloadSignal]);

  const prefetchFile = useCallback(
    async (path: string) => {
      if (!path) return;
      if (prefetchedPathsRef.current.has(path)) return;
      if (typeof window === "undefined") return;

      const cacheKey = getFileCacheKey(path);
      if (window.sessionStorage.getItem(cacheKey)) {
        prefetchedPathsRef.current.add(path);
        return;
      }

      try {
        const fileData = await readFile({ projectId, path });
        window.sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            content: fileData.content,
            language: fileData.language,
            isImage: fileData.isImage || false,
          }),
        );
        prefetchedPathsRef.current.add(path);
      } catch {
        // best effort background prefetch
      }
    },
    [getFileCacheKey, projectId, readFile],
  );

  useEffect(() => {
    if (!prefetchFilePath) return;
    if (prefetchFilePath === file) return;
    void prefetchFile(prefetchFilePath);
  }, [prefetchFile, prefetchFilePath, file]);

  useEffect(() => {
    if (!file) return;
    if (!openSearchSignal) return;
    setShowSearch(true);
  }, [file, openSearchSignal]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (!goToSignal) return;
    if (!goToLine || goToLine < 1) return;

    const editor = editorRef.current;
    const position = {
      lineNumber: goToLine,
      column: goToColumn && goToColumn > 0 ? goToColumn : 1,
    };

    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
  }, [goToColumn, goToLine, goToSignal]);

  const handleSave = useCallback(async () => {
    if (!file || !hasChanges) return;

    setSaving(true);
    try {
      const result = await writeFile({
        projectId,
        path: file,
        content,
      });

      // Check if cron intervals were adjusted
      if (result.adjustedContent && result.adjustments) {
        // Update editor with adjusted content
        setContent(result.adjustedContent);
        setOriginalContent(result.adjustedContent);
        setHasChanges(false);

        // Show toast with adjustment details
        const adjustmentSummary = result.adjustments
          .map(
            (adj) =>
              `Line ${adj.lineNumber}: ${adj.originalInterval} → ${adj.adjustedInterval}`,
          )
          .join(", ");

        toast.warning("Cron intervals adjusted", {
          description: `Intervals under 5 minutes were increased to prevent high costs. ${adjustmentSummary}`,
        });

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            getFileCacheKey(file),
            JSON.stringify({
              content: result.adjustedContent,
              language,
              isImage: false,
            }),
          );
        }
      } else {
        // Normal save without adjustments
        setOriginalContent(content);
        setHasChanges(false);
        toast.success("File saved", {
          description: file,
        });

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            getFileCacheKey(file),
            JSON.stringify({
              content,
              language,
              isImage: false,
            }),
          );
        }
      }

      onSave?.();
    } catch (error) {
      console.error("Error saving file:", error);
      toast.error("Failed to save file", {
        description: file,
      });
    } finally {
      setSaving(false);
    }
  }, [
    file,
    content,
    hasChanges,
    projectId,
    writeFile,
    onSave,
    getFileCacheKey,
    language,
  ]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.Preserve,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      checkJs: false,
      resolveJsonModule: true,
      baseUrl: ".",
      paths: {
        "@/*": ["./*"],
      },
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
      compilerOptions,
    );
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
      compilerOptions,
    );

    if (!monacoExtraLibsRegistered) {
      const sharedExtraLibs = [
        {
          filePath: "file:///types/vite-env.d.ts",
          content: `interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_VLY_MONITORING_URL?: string;
  readonly VITE_VLY_APP_ID?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`,
        },
        {
          filePath: "file:///types/react-jsx-runtime.d.ts",
          content: `declare module "react/jsx-runtime" {
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }

  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}
`,
        },
      ];

      for (const lib of sharedExtraLibs) {
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          lib.content,
          lib.filePath,
        );
        monaco.languages.typescript.javascriptDefaults.addExtraLib(
          lib.content,
          lib.filePath,
        );
      }

      monacoExtraLibsRegistered = true;
    }

    const diagnosticsOptions = {
      noSuggestionDiagnostics: true,
      diagnosticCodesToIgnore: [2307, 2792, 2875],
    };

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
      diagnosticsOptions,
    );
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(
      diagnosticsOptions,
    );

    // Add save keybinding (Ctrl+S or Cmd+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    // Add search keybinding (Ctrl+F or Cmd+F)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      setShowSearch(true);
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || "";
    setContent(newContent);
    setHasChanges(newContent !== originalContent);
  };

  // Search functionality
  const handleSearch = useCallback((query: string, options: any) => {
    if (!editorRef.current || !query) {
      setSearchResults(undefined);
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();

    if (!model) return;

    try {
      // Find all matches
      const matches = model.findMatches(
        query,
        true, // searchOnlyEditableRange
        options.regex || false,
        options.caseSensitive || false,
        options.wholeWord ? "\\b" : null,
        true, // captureMatches
      );

      if (matches.length > 0) {
        // Get current selection to find which match we're on
        const selection = editor.getSelection();
        let currentMatch = 1;

        if (selection) {
          for (let i = 0; i < matches.length; i++) {
            if (
              matches[i].range.containsPosition(selection.getStartPosition()) ||
              matches[i].range.containsPosition(selection.getEndPosition())
            ) {
              currentMatch = i + 1;
              break;
            }
          }
        }

        // Navigate to next/previous match if specified
        if (options.findNext || options.findPrevious) {
          let targetMatch;
          if (options.findNext) {
            targetMatch = matches[currentMatch % matches.length];
          } else {
            targetMatch =
              matches[(currentMatch - 2 + matches.length) % matches.length];
            currentMatch =
              ((currentMatch - 2 + matches.length) % matches.length) + 1;
          }

          editor.setSelection(targetMatch.range);
          editor.revealRangeInCenter(targetMatch.range);
        } else if (matches.length > 0) {
          // Just highlight the first match
          editor.setSelection(matches[0].range);
          editor.revealRangeInCenter(matches[0].range);
        }

        setSearchResults({
          currentMatch,
          totalMatches: matches.length,
        });
      } else {
        setSearchResults({
          currentMatch: 0,
          totalMatches: 0,
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults(undefined);
    }
  }, []);

  const handleReplace = useCallback(
    (findText: string, replaceText: string, replaceAll = false) => {
      if (!editorRef.current || !findText) return;

      const editor = editorRef.current;
      const model = editor.getModel();

      if (!model) return;

      try {
        if (replaceAll) {
          // Replace all occurrences
          const matches = model.findMatches(
            findText,
            true,
            false,
            false,
            null,
            true,
          );
          if (matches.length > 0) {
            // Apply all replacements in reverse order to maintain position integrity
            const edits = matches.reverse().map((match: any) => ({
              range: match.range,
              text: replaceText,
            }));

            editor.executeEdits("replace-all", edits);
            setHasChanges(true);

            toast.success("Replace All", {
              description: `Replaced ${matches.length} occurrence${matches.length === 1 ? "" : "s"}`,
            });
          }
        } else {
          // Replace current selection if it matches
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = model.getValueInRange(selection);
            if (selectedText === findText) {
              editor.executeEdits("replace", [
                {
                  range: selection,
                  text: replaceText,
                },
              ]);
              setHasChanges(true);

              // Find next occurrence after replacement
              handleSearch(findText, { findNext: true });
            }
          }
        }
      } catch (error) {
        console.error("Replace error:", error);
      }
    },
    [handleSearch, setHasChanges, toast],
  );

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts for images
      if (isImage) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, isImage]);

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#1e1e1e]">
        <div className="text-center">
          <div className="mb-2 text-[#bcbcbc]">
            No file selected
          </div>
          <div className="text-sm text-[#858585]">
            Select a file from the explorer to start editing
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[#2d2d30] bg-[#1e1e1e] p-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#d4d4d4]">{file}</span>
          {hasChanges && (
            <span className="text-xs text-orange-500">● Modified</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isImage && hasChanges && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save
            </Button>
          )}
          {!isImage && (
            <span className="text-xs text-[#858585]">
              {typeof window !== "undefined" &&
              navigator.platform.includes("Mac")
                ? "⌘"
                : "Ctrl"}
              +S to save
            </span>
          )}
        </div>
      </div>

      <div className="relative flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : !editorReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : isImage ? (
          <div className="flex h-full items-center justify-center bg-[#1e1e1e] p-8">
            <div className="max-h-full max-w-full overflow-auto">
              <img
                src={`data:image/${file?.split(".").pop()?.toLowerCase()};base64,${content}`}
                alt={file}
                className="max-h-full max-w-full object-contain"
                style={{ minHeight: "100px", minWidth: "100px" }}
              />
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            path={file}
            language={language}
            value={content}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              roundedSelection: false,
              scrollBeyondLastLine: false,
              readOnly: false,
              automaticLayout: true,
              wordWrap: "on",
              tabSize: 2,
              insertSpaces: true,
              trimAutoWhitespace: true,
              renderWhitespace: "selection",
              find: {
                addExtraSpaceOnTop: false,
                autoFindInSelection: "never",
                seedSearchStringFromSelection: "always",
              },
              scrollbar: {
                vertical: "visible",
                horizontal: "visible",
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        )}

        {!isImage && (
          <SearchPanel
            isOpen={showSearch}
            onClose={() => {
              setShowSearch(false);
              setSearchResults(undefined);
            }}
            onSearch={handleSearch}
            onReplace={handleReplace}
            searchResults={searchResults}
          />
        )}
      </div>
    </div>
  );
}
