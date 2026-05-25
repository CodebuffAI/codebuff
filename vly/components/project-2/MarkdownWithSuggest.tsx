"use client";
import React from "react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { CustomMarkdown } from "./CustomMarkdown";
import { Id } from "@/convex/_generated/dataModel";

type Props = {
  projectSemanticIdentifier?: string;
  projectId?: Id<"project">;
  text: string;
};

export const MarkdownWithSuggest: React.FC<Props> = ({
  projectSemanticIdentifier,
  projectId,
  text,
}) => {
  const sendMessage = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  );
  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [popover, setPopover] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
    selection: string;
    before: string;
    after: string;
  }>({ visible: false, x: 0, y: 0, selection: "", before: "", after: "" });
  const [input, setInput] = React.useState("");

  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const onMouseUp = (e: MouseEvent) => {
      // Clear any pending timeout
      if (timeoutId) clearTimeout(timeoutId);

      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        // Clicking inside the popover should not dismiss it.
        return;
      }

      // Debounce the selection handling to avoid excessive processing
      timeoutId = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setPopover((p) => ({ ...p, visible: false }));
          return;
        }
        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        if (!range || !containerRef.current) return;
        if (!containerRef.current.contains(range.commonAncestorContainer)) {
          setPopover((p) => ({ ...p, visible: false }));
          return;
        }

        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const selectionText = sel.toString();

        // Find nearest line indexes from data-line-index ancestors
        const getLineIndex = (node: Node | null): number | null => {
          let el: Node | null = node;
          while (el && el !== containerRef.current) {
            if (
              el instanceof HTMLElement &&
              el.hasAttribute("data-line-index")
            ) {
              const idx = el.getAttribute("data-line-index");
              return idx ? parseInt(idx, 10) : null;
            }
            el = el.parentNode;
          }
          return null;
        };

        const startLine = getLineIndex(range.startContainer);
        const endLine = getLineIndex(range.endContainer);
        const baseStart = startLine ?? endLine ?? 0;
        const baseEnd = endLine ?? startLine ?? baseStart;
        const contextStart = Math.max(0, baseStart - 4);
        const contextEnd = baseEnd + 4;

        const lines = text.split("\n");
        const before = lines.slice(contextStart, baseStart).join("\n");
        const after = lines.slice(baseEnd + 1, contextEnd + 1).join("\n");

        setPopover({
          visible: true,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 8,
          selection: selectionText,
          before,
          after,
        });
      }, 50); // 50ms debounce
    };

    document.addEventListener("mouseup", onMouseUp, { passive: true });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [text]);

  const submit = async () => {
    if (!input.trim()) return;
    const message = `User highlighted the following content on page documentation. Determine the context and carry out the change requested:

    <section_context>
    ${popover.before}
    <highlighted_selection>
    ${popover.selection}
    </highlighted_selection>
    ${popover.after}
    </section_context>
    
    Carry out the following user request:
    ${input}
    `;

    await sendMessage({
      ...(projectSemanticIdentifier ? { projectSemanticIdentifier } : {}),
      ...(projectId ? { projectId } : {}),
      message,
    });
    setInput("");
    setPopover((p) => ({ ...p, visible: false }));
  };

  return (
    <div ref={containerRef} className="relative">
      <div>
        <CustomMarkdown text={text} />
      </div>
      {popover.visible && (
        <div
          className="absolute z-50 -translate-x-1/2 transform rounded border border-gray-200 bg-white p-2 shadow-lg"
          style={{ left: popover.x, top: popover.y }}
          ref={popoverRef}
        >
          <div className="mb-1 text-[10px] text-gray-500">
            Suggest a change to this selection
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-64 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-400"
              placeholder="Describe the change..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="rounded bg-black px-2 py-1 text-xs text-white hover:opacity-90"
              onClick={submit}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
