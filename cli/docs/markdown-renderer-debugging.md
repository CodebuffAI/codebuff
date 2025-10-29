# Markdown Renderer Debugging

## Why This Matters
- Every message that hits the CLI flows through `renderMarkdown` or `renderStreamingMarkdown`.
- The renderer now emits **styled React fragments** (spans with attributes, colors, backgrounds) instead of stripping markdown down to plain text.
- When the renderer drops a node or styles it incorrectly, the UI loses the visual cues that make validation errors, code snippets, and agent names readable.

## Rendering Pipeline Overview
1. **Parse to mdast** – `unified().use(remarkParse)` builds the syntax tree.
2. **Convert to React nodes** – `renderNode` walks the tree and produces inline `<span>` elements (bold, italic, inline code, headings) plus strings for raw text. Only OpenTUI-safe primitives are returned—no nested `<text>` elements.
3. **Fallback to plain text** – If we hit an unknown node type, we fall back to `nodeToPlainText` so the content is still visible even if styling is missing.
4. **Streaming safety** – `renderStreamingMarkdown` renders completed sections, then appends the pending fence/string portion so partial streaming output never corrupts earlier content.

### Node Coverage Highlights
- Inline: `text`, `strong`, `emphasis`, `inlineCode`, `link`, hard breaks, thematic breaks.
- Block-level: `paragraph`, `heading`, `list` / `listItem`, `blockquote`, `code`.
- Styling hooks: palette-driven colors for headings, blockquotes, inline/code blocks; bold/italic via `TextAttributes`.
- Fallback: Any node without an explicit branch returns plain text from `nodeToPlainText`, ensuring content never disappears silently.

## Common Symptoms & Likely Causes
- **Bold/italic vanish** → `strong` or `emphasis` missing from the switch; ensure they wrap children in spans with `TextAttributes`.
- **Lists collapse to one line** → `list` or `listItem` cases returning strings with missing newline tokens.
- **Blockquotes lose their prefix** → `renderBlockquote` not prefixing lines with the colored `> ` span.
- **Inline code loses background** → `renderInlineCode` not using palette colors or not padding the value.
- **Streaming output repeats fences** → `renderStreamingMarkdown` failing to split at the last ``` fence.

## Debugging Checklist
1. Capture the input markdown and reproduce the bad rendering.
2. Parse the AST to see which node types are involved:

   ```ts
   import { unified } from 'unified'
   import remarkParse from 'remark-parse'

   const tree = unified().use(remarkParse).parse(markdown)
   console.log(JSON.stringify(tree, null, 2))
   ```

3. Confirm each node type maps to a branch in `renderNode`; unknown nodes should fall back to strings, not vanish.
4. When wrapping children, only emit `<span>` or fragments—OpenTUI will crash if a `<text>` sneaks in.
5. Re-run `bun test cli/src/utils/__tests__/markdown-renderer.test.tsx` to validate formatting for emphasis, inline code, lists, blockquotes, and streaming output.
6. After fixing, run the full suite with `bun test` to ensure nothing else regressed.

## Example Fixes
- **Inline emphasis missing** – ensure the `strong` branch returns:

  ```ts
  case 'strong': {
    const children = renderNodes(strong.children as MarkdownNode[], state, strong.type)
    return [
      <span key={state.nextKey()} attributes={TextAttributes.BOLD}>
        {children.map((segment, idx) => (
          <React.Fragment key={…}>{segment}</React.Fragment>
        ))}
      </span>,
    ]
  }
  ```

- **Blockquote formatting** – prepend each rendered line with a span using `palette.blockquoteBorderFg`, then render the line content inside another span using `palette.blockquoteTextFg`.
- **Code block styling** – emit one span per line with `bg={palette.codeBackground}` and `fg={palette.codeTextFg}`, followed by a blank line so the block stands out.

## Verification
- Unit coverage lives in `cli/src/utils/__tests__/markdown-renderer.test.tsx`.
- For manual sanity checks, run `bun run dev`, trigger messages with markdown, and verify headings, lists, inline code, and streaming responses render correctly.

Keep this document current whenever you introduce new markdown constructs or alter the renderer’s styling strategy. It should always describe the renderer’s actual behavior, not the previous implementation.
