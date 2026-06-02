"use client";

import React, {
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Editor,
  Transforms,
  Range,
  createEditor,
  Descendant,
  Element as SlateElement,
  BaseEditor,
  Node,
} from "slate";
import { withHistory } from "slate-history";
import {
  Editable,
  ReactEditor,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  useFocused,
  useSelected,
  withReact,
} from "slate-react";
import { createPortal } from "react-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/vly/lib/utils";

export interface MentionItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  icon?: LucideIcon;
  iconColor?: string;
  metadata?: Record<string, any>;
}

export interface MentionElement {
  type: "mention";
  mentionType: string;
  mentionId: string;
  mentionName: string;
  metadata?: Record<string, any>;
  children: [{ text: string }];
}

interface ParagraphElement {
  type: "paragraph";
  children: Descendant[];
}

type CustomElement = MentionElement | ParagraphElement;

interface CustomText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
}

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

export interface MentionProvider {
  trigger: string; // e.g., "@" for assets, "#" for integrations
  type: string; // e.g., "asset", "integration"
  items: MentionItem[];
  isLoading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  color?: string; // Tailwind color class prefix, e.g., "purple", "blue"
}

interface MentionsEditorProps {
  providers: MentionProvider[];
  value?: Descendant[];
  onChange?: (value: Descendant[]) => void;
  selection?: Range | null;
  onSelectionChange?: (selection: Range | null) => void;
  placeholder?: string;
  className?: string;
  onMentionSelect?: (item: MentionItem, type: string) => void;
  onEnterSubmit?: () => void;
}

const MentionsEditor: React.FC<MentionsEditorProps> = ({
  providers,
  value,
  onChange,
  selection,
  onSelectionChange,
  placeholder = "Start typing...",
  className,
  onMentionSelect,
  onEnterSubmit,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<Range | null>(null);
  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState<MentionProvider | null>(
    null,
  );

  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} providers={providers} />,
    [providers],
  );
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    [],
  );

  const editor = useMemo(
    () =>
      withMentions(withReact(withHistory(createEditor()))) as BaseEditor &
        ReactEditor,
    [],
  );

  const initialValue: Descendant[] = [
    {
      type: "paragraph",
      children: [{ text: "" }],
    },
  ];

  // Restore selection when prop changes
  useEffect(() => {
    if (selection && editor.selection !== selection) {
      try {
        // Validate selection paths exist before applying
        const isValidSelection =
          Range.isRange(selection) &&
          Editor.hasPath(editor, selection.anchor.path) &&
          Editor.hasPath(editor, selection.focus.path);

        if (isValidSelection) {
          Transforms.select(editor, selection);
        }
      } catch (error) {
        // Selection is invalid for current content, ignore
        console.debug("Failed to restore selection:", error);
      }
    }
  }, [editor, selection]);

  const filteredItems = useMemo(() => {
    if (!activeProvider) return [];
    if (!search) return activeProvider.items.slice(0, 10);

    const searchLower = search.toLowerCase();
    return activeProvider.items
      .filter((item) => {
        const name = item.name.toLowerCase();
        const description = (item.description || "").toLowerCase();
        return name.includes(searchLower) || description.includes(searchLower);
      })
      .slice(0, 10);
  }, [activeProvider, search]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (target && filteredItems.length > 0) {
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            const prevIndex = index >= filteredItems.length - 1 ? 0 : index + 1;
            setIndex(prevIndex);
            break;
          case "ArrowUp":
            event.preventDefault();
            const nextIndex = index <= 0 ? filteredItems.length - 1 : index - 1;
            setIndex(nextIndex);
            break;
          case "Tab":
          case "Enter":
            event.preventDefault();
            if (activeProvider) {
              Transforms.select(editor, target);
              insertMention(editor, filteredItems[index], activeProvider.type);
              setTarget(null);
              setActiveProvider(null);
              if (onMentionSelect) {
                onMentionSelect(filteredItems[index], activeProvider.type);
              }
            }
            break;
          case "Escape":
            event.preventDefault();
            setTarget(null);
            setActiveProvider(null);
            break;
        }
      } else if (event.key === "Enter") {
        // Handle Enter when not in mention mode
        if (event.shiftKey) {
          // Shift+Enter: Insert new line (default behavior)
          return;
        } else {
          // Enter: Submit message
          // Ignore auto-repeat events when key is held down
          if (event.repeat) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          if (onEnterSubmit) {
            onEnterSubmit();
          }
        }
      }
    },
    [
      filteredItems,
      editor,
      index,
      target,
      activeProvider,
      onMentionSelect,
      onEnterSubmit,
    ],
  );

  useEffect(() => {
    if (target && filteredItems.length > 0 && ref.current) {
      const el = ref.current;
      try {
        const domRange = ReactEditor.toDOMRange(editor, target);
        const rect = domRange.getBoundingClientRect();

        // Estimate dropdown height (max-height is 256px + padding)
        const dropdownHeight = Math.min(filteredItems.length * 48, 256) + 16; // 48px per item + padding
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Position above if there's not enough space below and there's enough space above
        const shouldPositionAbove =
          spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;

        if (shouldPositionAbove) {
          el.style.top = `${rect.top + window.pageYOffset - dropdownHeight - 8}px`;
        } else {
          el.style.top = `${rect.top + window.pageYOffset + 24}px`;
        }

        el.style.left = `${rect.left + window.pageXOffset}px`;
      } catch (error) {
        // Silently handle the case where DOM range cannot be resolved yet
        console.warn(
          "Could not resolve DOM range for mention dropdown positioning",
        );
      }
    }
  }, [filteredItems.length, editor, index, search, target]);

  const detectTrigger = useCallback(
    (text: string): MentionProvider | null => {
      for (const provider of providers) {
        const regex = new RegExp(`^\\${provider.trigger}(\\w*)$`);
        const match = text.match(regex);
        if (match) {
          return provider;
        }
      }
      return null;
    },
    [providers],
  );

  return (
    <Slate
      editor={editor}
      initialValue={value || initialValue}
      onChange={(newValue) => {
        const { selection } = editor;

        if (selection && Range.isCollapsed(selection)) {
          try {
            const [start] = Range.edges(selection);
            const wordBefore = Editor.before(editor, start, { unit: "word" });
            const before = wordBefore && Editor.before(editor, wordBefore);
            const beforeRange = before && Editor.range(editor, before, start);
            const beforeText =
              beforeRange && Editor.string(editor, beforeRange);

            const provider = beforeText ? detectTrigger(beforeText) : null;

            if (provider && beforeText) {
              const regex = new RegExp(`^\\${provider.trigger}(\\w*)$`);
              const match = beforeText.match(regex);

              if (match) {
                const after = Editor.after(editor, start);
                const afterRange = Editor.range(editor, start, after);
                const afterText = Editor.string(editor, afterRange);
                const afterMatch = afterText.match(/^(\s|$)/);

                if (afterMatch && beforeRange) {
                  setTarget(beforeRange);
                  setSearch(match[1] || "");
                  setActiveProvider(provider);
                  setIndex(0);
                } else {
                  setTarget(null);
                  setActiveProvider(null);
                }
              }
            } else {
              setTarget(null);
              setActiveProvider(null);
            }
          } catch (error) {
            // Selection is invalid for current content, clear mention state
            console.debug("Selection error in mentions editor:", error);
            setTarget(null);
            setActiveProvider(null);
          }
        } else {
          setTarget(null);
          setActiveProvider(null);
        }

        if (onChange) {
          onChange(newValue);
        }

        if (onSelectionChange) {
          onSelectionChange(editor.selection);
        }
      }}
    >
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          "max-h-[200px] min-h-[120px] overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 text-sm font-medium",
          "focus:outline-none focus:ring-0",
          "font-sans leading-relaxed",
          className || "",
        )}
        style={{
          caretColor: "black",
        }}
        data-placeholder={placeholder}
      />
      {target &&
        activeProvider &&
        filteredItems.length > 0 &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={ref}
            style={{
              top: "-9999px",
              left: "-9999px",
              position: "absolute",
              zIndex: 1000,
            }}
            className="w-64 rounded-lg border border-zinc-200 bg-white shadow-lg"
            data-cy="mentions-portal"
          >
            {activeProvider.isLoading ? (
              <div className="p-3 text-center text-sm text-zinc-500">
                {activeProvider.placeholder || "Loading..."}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-3 text-center text-sm text-zinc-500">
                {activeProvider.emptyMessage || "No items found"}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto py-1">
                {filteredItems.map((item, i) => {
                  const Icon = item.icon;
                  const bgColor = activeProvider.color || "purple";
                  return (
                    <div
                      key={item.id}
                      onClick={(e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        Transforms.select(editor, target);
                        insertMention(editor, item, activeProvider.type);
                        setTarget(null);
                        setActiveProvider(null);
                        if (onMentionSelect) {
                          onMentionSelect(item, activeProvider.type);
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                        i === index ? `bg-${bgColor}-50` : "hover:bg-zinc-50",
                      )}
                    >
                      {Icon && (
                        <div className="flex-shrink-0">
                          <Icon
                            size={16}
                            className={item.iconColor || "text-zinc-500"}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {item.name}
                        </div>
                        {item.description && (
                          <div className="truncate text-xs text-zinc-500">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </Slate>
  );
};

const withMentions = (editor: BaseEditor & ReactEditor) => {
  const { isInline, isVoid, markableVoid, normalizeNode } = editor;

  editor.isInline = (element: SlateElement) => {
    return element.type === "mention" ? true : isInline(element);
  };

  editor.isVoid = (element: SlateElement) => {
    return element.type === "mention" ? true : isVoid(element);
  };

  editor.markableVoid = (element: SlateElement) => {
    return element.type === "mention" || markableVoid(element);
  };

  // Ensure editor always has at least 1 valid child (from Slate docs)
  editor.normalizeNode = (entry) => {
    const [node] = entry;

    if (!Editor.isEditor(node) || node.children.length > 0) {
      return normalizeNode(entry);
    }

    const paragraph: ParagraphElement = {
      type: "paragraph",
      children: [{ text: "" }],
    };
    Transforms.insertNodes(editor, paragraph, { at: [0] });
  };

  return editor;
};

const insertMention = (
  editor: BaseEditor & ReactEditor,
  item: MentionItem,
  type: string,
) => {
  const mention: MentionElement = {
    type: "mention",
    mentionType: type,
    mentionId: item.id,
    mentionName: item.name,
    metadata: item.metadata,
    children: [{ text: "" }],
  };
  Transforms.insertNodes(editor, mention);
  Transforms.move(editor);
};

const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  let content = children;

  if (leaf.bold) {
    content = <strong>{content}</strong>;
  }

  if (leaf.code) {
    content = <code>{content}</code>;
  }

  if (leaf.italic) {
    content = <em>{content}</em>;
  }

  if (leaf.underline) {
    content = <u>{content}</u>;
  }

  return <span {...attributes}>{content}</span>;
};

const Element = (
  props: RenderElementProps & { providers?: MentionProvider[] },
) => {
  const { attributes, children, element, providers } = props;
  switch (element.type) {
    case "mention":
      return (
        <Mention
          {...props}
          element={element as MentionElement}
          providers={providers}
        />
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
};

const Mention: React.FC<
  RenderElementProps & {
    element: MentionElement;
    providers?: MentionProvider[];
  }
> = ({ attributes, children, element, providers }) => {
  const selected = useSelected();
  const focused = useFocused();

  const provider = providers?.find((p) => p.type === element.mentionType);
  const item = provider?.items.find((i) => i.id === element.mentionId);
  const Icon = item?.icon;
  const bgColor = provider?.color || "purple";

  return (
    <span
      {...attributes}
      contentEditable={false}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-xs",
        "mx-0.5 align-middle",
        `bg-${bgColor}-100`,
        selected && focused && `ring-1 ring-${bgColor}-500`,
      )}
      style={{
        display: "inline-flex",
        verticalAlign: "middle",
        lineHeight: "1.6",
        fontSize: "13px",
        minHeight: "18px",
      }}
      data-cy={`mention-${element.mentionType}-${element.mentionName.replace(/[^a-zA-Z0-9]/g, "-")}`}
    >
      <span className="flex items-center gap-0.5">
        {Icon && (
          <Icon
            size={10}
            className={item?.iconColor || `text-${bgColor}-500`}
          />
        )}
        <span className={`font-medium text-${bgColor}-900`}>
          @
          {element.mentionName.length > 30
            ? `${element.mentionName.slice(0, 15)}...${element.mentionName.slice(-10)}`
            : element.mentionName}
        </span>
      </span>
      {children}
    </span>
  );
};

export default MentionsEditor;

export const serializeToText = (nodes: Descendant[]): string => {
  const serializeInline = (nodes: Descendant[]): string => {
    return nodes
      .map((n) => {
        if (SlateElement.isElement(n)) {
          if (n.type === "mention") {
            const mention = n as MentionElement;
            const originalType =
              mention.metadata?.originalType ||
              (mention.mentionType === "mention"
                ? "integration"
                : mention.mentionType);
            return `@[${mention.mentionId}:${mention.mentionName}:${originalType}]`;
          }
          if (n.children) {
            return serializeInline(n.children);
          }
          return Node.string(n);
        }
        return Node.string(n);
      })
      .join("");
  };

  return nodes
    .map((n) => {
      if (SlateElement.isElement(n)) {
        if (n.type === "paragraph") {
          return serializeInline(n.children);
        }
        if (n.type === "mention") {
          const mention = n as MentionElement;
          const originalType =
            mention.metadata?.originalType ||
            (mention.mentionType === "mention"
              ? "integration"
              : mention.mentionType);
          return `@[${mention.mentionId}:${mention.mentionName}:${originalType}]`;
        }
        return Node.string(n);
      }
      return Node.string(n);
    })
    .join("\n");
};

export const getMentions = (
  nodes: Descendant[],
  type?: string,
): MentionItem[] => {
  const mentions: MentionItem[] = [];

  const searchNodes = (nodes: Descendant[]) => {
    for (const node of nodes) {
      if (SlateElement.isElement(node)) {
        if (node.type === "mention") {
          const mentionNode = node as MentionElement;
          if (!type || mentionNode.mentionType === type) {
            mentions.push({
              id: mentionNode.mentionId,
              name: mentionNode.mentionName,
              type: mentionNode.mentionType,
              metadata: mentionNode.metadata,
            });
          }
        }
        if (node.children) {
          searchNodes(node.children);
        }
      }
    }
  };

  searchNodes(nodes);
  return mentions;
};
