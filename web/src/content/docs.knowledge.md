# Documentation System Knowledge

## Core Architecture

### Directory Structure

```
web/
src/
   app/
      docs/
      layout.tsx       # Layout with shadcn Sidebar
      page.tsx         # Main content
      [category]/      # Dynamic routes for sections
         [slug]/
            page.tsx     # Individual doc pages
   content/            # MDX content files
      help/
      tips/
      showcase/
      case-studies/
   components/
      docs/             # Doc-specific components
      doc-sidebar.tsx   # Extends shadcn Sidebar
      toc.tsx          # Table of contents
      mdx/             # MDX-specific components
         chart.tsx
         code-demo.tsx
```

### Content Organization

- Content stored in MDX files under `src/content/`
- Categories: help, tips, showcase, case-studies
- Each document requires frontmatter with title, section, tags, order
- Files automatically sorted by order field within sections

### Navigation Structure

- Persistent sidebar with collapsible sections
- Sidebar must remain visible while scrolling
- Support both inter-page navigation and intra-page scrolling
- Section headings are interactive:
  - Click to scroll to section
  - Hover to reveal copy link button
  - Links include hash for direct section access

### Technical Implementation

- Uses ContentLayer for MDX processing
- Dynamic imports for MDX components
- Custom components must be explicitly passed to MDX provider
- All MDX components must be Client Components
- Heading components must accept full HTML element props

### Styling Guidelines

- Use prose-compact for tighter vertical spacing
- Maintain consistent heading margins
- Preserve sidebar width with shrink-0
- Account for navbar height in sticky positioning

## Component Requirements

### MDX Components

- Must be explicitly imported and passed to MDX provider
- Register before use in MDX content
- Must be Client Components
- Use dynamic imports with next/dynamic
- Export as named exports for proper dynamic loading

### Navigation Components

- Sidebar must handle both scroll and navigation
- Check current path before deciding scroll vs navigate
- Support direct links to sections via URL hash
- Preserve scroll position during navigation

### Layout Components

- Main content should replace existing content, not shift layout
- Sidebar navigation should show both sections and subsections
- Keep layout changes minimal when navigating between pages

## Content Creation

### Document Structure

```markdown
---
title: 'Document Title'
section: 'help'
tags: ['tag1', 'tag2']
order: 1
---

# Content in Markdown
```

### Component Usage

```markdown
<CodeDemo>
  {/* Embedded React Component */}
</CodeDemo>
```

## Important Guidelines

1. Always use Client Components for interactive elements
2. Maintain proper heading hierarchy for accessibility
3. Keep sidebar visible and functional at all times
4. Ensure smooth transitions between sections
5. Preserve URL state with proper hash handling
