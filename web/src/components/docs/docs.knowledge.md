# Documentation System Knowledge

## Core Architecture

### Directory Structure

```
web/src/
   app/docs/
      layout.tsx       # Layout with Sheet for mobile navigation
      page.tsx         # Redirects to /docs/help
      [category]/
         page.tsx      # Category pages displaying all docs in category
   content/            # MDX content files
      help/
      tips/
      advanced/
      showcase/
      case-studies/
   components/docs/
      doc-sidebar.tsx     # Navigation sidebar
      toc.tsx            # Table of contents
      mdx-components.tsx # MDX component mappings
      mdx/               # MDX-specific components
         code-demo.tsx
```

### Content Organization

- Content stored in MDX files under `src/content/`
- Categories: help, tips, advanced, showcase, case-studies
- Each document requires frontmatter: title, section, tags, order
- Files sorted by order field within categories
- Category pages display all docs in a single page with dividers
- Optional `_cta.mdx` files can be dynamically imported per category

### Navigation Structure

- Desktop: Persistent sidebar (hidden on mobile)
- Mobile: Bottom sheet navigation with Menu trigger
- Sidebar handles both navigation and intra-page scrolling
- Section headings support click-to-copy links

### Technical Implementation

- Uses ContentLayer for MDX processing with `next-contentlayer/hooks`
- Dynamic imports for MDX components
- Custom components passed to MDX provider
- All MDX components are Client Components

### Mobile Navigation

- Uses shadcn Sheet component for bottom slide-up navigation
- Sheet opens to 80vh height with scroll support
- Menu trigger in sticky bottom bar
- Sheet auto-closes on navigation

## Component Requirements
### MDX Components

- Must be Client Components with dynamic imports
- Registered in components object for MDX provider
- Custom h1 components support click-to-copy links

- Raw MDX processed by ContentLayer into executable code

### Navigation Components

- Sidebar checks current path for scroll vs navigate behavior
- Supports direct section links via URL hash
- External links (news) open in new tabs

## Content Creation

### Document Structure

```markdown
---
title: 'Document Title'
section: 'category'
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
