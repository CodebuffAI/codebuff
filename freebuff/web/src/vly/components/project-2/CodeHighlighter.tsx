"use client";

import React from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import xml from "react-syntax-highlighter/dist/esm/languages/hljs/xml";
import atomOneLight from "react-syntax-highlighter/dist/esm/styles/hljs/atom-one-light";

// Register only the languages we use
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("xml", xml);

interface CodeHighlighterProps {
  language: string;
  children: string;
  customStyle?: React.CSSProperties;
}

export function CodeHighlighter({
  language,
  children,
  customStyle,
}: CodeHighlighterProps) {
  // Map JSX/TSX to XML for better JSX syntax highlighting
  const getLanguage = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "jsx":
      case "tsx":
        return "xml";
      default:
        return lang;
    }
  };

  return (
    <SyntaxHighlighter
      language={getLanguage(language)}
      style={atomOneLight}
      customStyle={customStyle}
    >
      {children}
    </SyntaxHighlighter>
  );
}
