import React from "react";

interface CustomMarkdownProps {
  text: string;
}

// Regular function for parsing inline elements - moved outside component to prevent recreation
const parseInline = (text: string): React.ReactNode[] => {
  const parts = text.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*)/g).filter(Boolean);

  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {linkMatch[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const CustomMarkdownComponent: React.FC<CustomMarkdownProps> = ({ text }) => {
  const elements = React.useMemo(() => {
    const lines = text.split("\n");
    let inCodeBlock = false;
    const codeBlockLines: string[] = [];
    const result: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      // Handle code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // End of code block - render accumulated lines
          result.push(
            <pre
              key={`code-${index}`}
              className="my-3 overflow-x-auto rounded bg-gray-100 p-3 font-mono text-xs text-gray-800"
              data-line-index={index}
            >
              {codeBlockLines.join("\n")}
            </pre>,
          );
          codeBlockLines.length = 0;
          inCodeBlock = false;
        } else {
          // Start of code block
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        return;
      }

      // Preserve empty lines as spacing elements
      if (line.trim() === "") {
        result.push(
          <div key={index} className="h-2" data-line-index={index}>
            &nbsp;
          </div>,
        );
        return;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch) {
        const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        const text = headingMatch[2];
        const classNames = {
          1: "text-xl font-bold mt-6 mb-3 text-gray-900",
          2: "text-lg font-bold mt-5 mb-2 text-gray-800",
          3: "text-base font-bold mt-4 mb-2 text-gray-700",
          4: "text-sm font-bold mt-3 mb-1 text-gray-700",
          5: "text-xs font-bold mt-3 mb-1 text-gray-600",
          6: "text-xs font-bold mt-2 mb-1 text-gray-600",
        };
        result.push(
          <Tag
            key={index}
            className={classNames[level]}
            data-line-index={index}
          >
            {parseInline(text)}
          </Tag>,
        );
        return;
      }

      // Check for list items
      const listMatch = line.match(/^(\s*)[-\*\+]\s+(.*)/);
      if (listMatch) {
        const indent = listMatch[1].length;
        const content = listMatch[2];
        const indentLevel = Math.floor(indent / 2); // 2 spaces per indent level
        result.push(
          <div
            key={index}
            className="mb-1 mt-1 flex items-start"
            style={{ marginLeft: `${indentLevel * 1}rem` }}
            data-line-index={index}
          >
            <span className="mr-2 text-gray-500">•</span>
            <span className="text-gray-700">{parseInline(content)}</span>
          </div>,
        );
        return;
      }

      // Check if line starts with whitespace (potential file tree or indented content)
      const leadingSpaces = line.match(/^(\s+)/);
      if (leadingSpaces) {
        // Render with preserved whitespace for file trees and indented content
        result.push(
          <div
            key={index}
            className="mb-0 mt-0 font-mono text-xs leading-snug text-gray-700"
            data-line-index={index}
            style={{ whiteSpace: "pre" }}
          >
            {line}
          </div>,
        );
        return;
      }

      // Regular paragraph content
      result.push(
        <div
          key={index}
          className="mb-1 mt-1 leading-relaxed text-gray-700"
          data-line-index={index}
        >
          {parseInline(line)}
        </div>,
      );
    });

    // Handle case where code block wasn't closed
    if (inCodeBlock && codeBlockLines.length > 0) {
      result.push(
        <pre
          key="code-final"
          className="my-3 overflow-x-auto rounded bg-gray-100 p-3 font-mono text-xs text-gray-800"
        >
          {codeBlockLines.join("\n")}
        </pre>,
      );
    }

    return result;
  }, [text]);

  return <>{elements}</>;
};

export const CustomMarkdown = React.memo(CustomMarkdownComponent);
