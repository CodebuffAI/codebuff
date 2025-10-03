# CLI Package Knowledge

## OpenTUI Text Rendering Constraints

**CRITICAL**: OpenTUI has strict requirements for text rendering that must be followed:

### JSX Content Rules

**DO NOT use `{' '}` or similar JSX expressions for whitespace in OpenTUI components.** This will cause the entire app to go blank.

```tsx
// ❌ WRONG: Will break the app
<text>Hello{' '}World</text>
<text>{'Some text'}</text>

// ✅ CORRECT: Use plain text or template literals
<text>Hello World</text>
<text content="Hello World" />
```

OpenTUI expects plain text content or the `content` prop - it does not handle JSX expressions within text elements.

## Screen Mode and TODO List Positioning

The CLI chat interface adapts its layout based on terminal dimensions:

### Screen Modes
- **Full-screen**: width ≥ 70 AND height ≥ 30
- **Wide-screen**: width ≥ 70 AND height < 30
- **Tall-screen**: width < 70 AND height ≥ 30
- **Small-screen**: width < 70 AND height < 30

### TODO List Positioning
- **Right side**: Full-screen and wide-screen modes (when there's sufficient horizontal space)
- **Top**: Tall-screen and small-screen modes (when terminal is narrow)

The TODO list automatically repositions based on available space to ensure optimal visibility and usability.

### Text Styling Components Must Be Wrapped in `<text>`

All text styling components (`<strong>`, `<em>`, `<span>`, etc.) **MUST** be nested inside a `<text>` component. They cannot be returned directly from render functions.

**INCORRECT** ❌:
```tsx
// This will cause a black screen!
function renderMarkdown(content: string) {
  return (
    <>
      <strong>Bold text</strong>
      <em>Italic text</em>
    </>
  )
}
```

**CORRECT** ✅:
```tsx
// All styling must be inside <text>
function renderMarkdown(content: string) {
  return (
    <text wrap>
      <strong>Bold text</strong>
      <em>Italic text</em>
    </text>
  )
}
```

### Why This Matters

- Returning styling components without `<text>` wrapper causes the entire app to render as a black screen
- No error messages are shown - the app just fails silently
- This applies to ALL text styling: `<strong>`, `<em>`, `<span>`, `<u>`, etc.

### Available OpenTUI Components

**Core Components**:
- `<text>` - The fundamental component for displaying all text content
- `<box>` - Container for layout and grouping
- `<input>` - Text input field
- `<select>` - Selection dropdowns
- `<scrollbox>` - Scrollable container
- `<tab-select>` - Tab-based navigation
- `<ascii-font>` - ASCII art text rendering

**Text Modifiers** (must be inside `<text>`):
- `<span>` - Generic inline styling
- `<strong>` and `<b>` - Bold text
- `<em>` and `<i>` - Italic text  
- `<u>` - Underlined text
- `<br>` - Line break

### Markdown Rendering Implementation

**SUCCESS**: Rich markdown rendering has been implemented using `unified` + `remark-parse` with OpenTUI components.

**Key Insight**: OpenTUI does **not support nested `<text>` components**. Since `chat.tsx` already wraps content in a `<text>` component, the markdown renderer must return **inline JSX elements only** (no `<text>` wrappers).

**Correct Implementation Pattern**:

```tsx
// ✅ CORRECT: Return inline elements that go INSIDE the parent <text>
export function renderMarkdown(markdown: string): ReactNode {
  const inlineElements = [
    <strong>Bold text</strong>,
    ' and ',
    <em>italic text</em>
  ]
  return <>{inlineElements}</>
}

// In chat.tsx:
<text wrap>
  {renderMarkdown(message.content)}
</text>
```

**Incorrect Pattern** (causes black screen):

```tsx
// ❌ WRONG: Returning <text> components creates nested <text>
export function renderMarkdown(markdown: string): ReactNode {
  return (
    <text wrap>
      <strong>Bold text</strong>
    </text>
  )
}
```

The implementation uses:
- `markdownToInline()`: Converts markdown AST to array of inline JSX elements
- `renderInlineContent()`: Renders inline styling (`<strong>`, `<em>`, `<span>`)
- Returns a fragment `<>{inlineElements}</>` that can be safely placed inside parent `<text>`
