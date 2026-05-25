"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Editor from "@monaco-editor/react";
import { useAction } from "convex/react";
import { Loader, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { SearchPanel } from "./SearchPanel";

interface MonacoEditorProps {
  projectId: Id<"project">;
  file?: string;
  onSave?: () => void;
}

export function MonacoEditor({ projectId, file, onSave }: MonacoEditorProps) {
  const { resolvedTheme } = useTheme();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [language, setLanguage] = useState("plaintext");
  const [isImage, setIsImage] = useState(false);
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

  const loadFile = useCallback(async () => {
    if (!file) {
      setContent("");
      setOriginalContent("");
      setLanguage("plaintext");
      setIsImage(false);
      setHasChanges(false);
      return;
    }

    setLoading(true);
    try {
      const fileData = await readFile({ projectId, path: file });
      setContent(fileData.content);
      setOriginalContent(fileData.content);
      setLanguage(fileData.language);
      setIsImage(fileData.isImage || false);
      setHasChanges(false);
    } catch (error) {
      console.error("Error loading file:", error);
      toast.error("Failed to load file", {
        description: file,
      });
    } finally {
      setLoading(false);
    }
  }, [file, projectId, readFile]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

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
      } else {
        // Normal save without adjustments
        setOriginalContent(content);
        setHasChanges(false);
        toast.success("File saved", {
          description: file,
        });
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
  }, [file, content, hasChanges, projectId, writeFile, onSave]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Disable all TypeScript/JavaScript diagnostics to avoid syntax errors
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true, // Disable syntax validation too
      noSuggestionDiagnostics: true,
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true, // Disable syntax validation too
      noSuggestionDiagnostics: true,
    });

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
      <div className="flex flex-1 items-center justify-center bg-gray-50 dark:bg-[#282828]">
        <div className="text-center">
          <div className="mb-2 text-gray-500 dark:text-zinc-400">
            No file selected
          </div>
          <div className="text-sm text-gray-400 dark:text-zinc-500">
            Select a file from the explorer to start editing
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b bg-white p-2 dark:border-[#575757] dark:bg-[#282828]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{file}</span>
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
            <span className="text-xs text-gray-500 dark:text-zinc-400">
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
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-[#282828]">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : isImage ? (
          <div className="flex h-full items-center justify-center bg-gray-50 p-8 dark:bg-[#282828]">
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
            language={language}
            value={content}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs-light"}
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
