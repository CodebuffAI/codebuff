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

## Mobile Support

Important: For mobile navigation:
- Use shadcn's official Sidebar component rather than custom mobile solutions
- Follow the implementation guide at ui.shadcn.com/docs/components/sidebar
- This ensures consistent behavior and maintainability
- Provides built-in mobile-friendly navigation patterns

### Mobile Menu Button Placement
- Place mobile menu triggers inline with section content
- Avoid placing triggers that push other content to the right
- Menu buttons should not affect the layout of surrounding elements
- Align with the main content's title rather than subsection headings
- For slide-out navigation, prefer shadcn's official Sheet component over custom solutions
- Reference ui.shadcn.com for latest mobile navigation patterns and examples

### Mobile Sheet Navigation
- Bottom sheets must be scrollable when content exceeds height
- Include visual affordances for closing:
  - Add visible handle/line at top of sheet that stays fixed
  - Handle should be draggable to dismiss sheet
  - Support swipe-down-to-dismiss gesture
- Use viewport-relative heights (e.g. h-[33vh]) for consistent sizing
- Important UX behaviors:
  - Preserve original page scroll position when sheet is dismissed
  - Automatically dismiss sheet when user navigates to new content
  - Keep drag indicator visible with solid background while content scrolls
- Important UX behaviors:
  - Preserve original page scroll position when sheet is dismissed
  - Automatically dismiss sheet when user navigates to new content
  - Keep drag indicator visible with solid background while content scrolls
- Important UX behaviors:
  - Preserve original page scroll position when sheet is dismissed
  - Automatically dismiss sheet when user navigates to new content
  - Keep drag indicator visible with solid background while content scrolls
- Important: When using shadcn components:
  - Always check official docs at ui.shadcn.com first
  - Don't try to recreate functionality that exists in the component
  - Install complete component with all its dependencies
  - Copy exact markup structure from examples

### Shadcn Component Integration
- Components may look different from shadcn.com even with identical code
- Visual differences often come from missing CSS variables in globals.css
- Each component relies on both:
  - Component-specific styles in the component file
  - Theme variables in globals.css (colors, animations, spacing)
- When copying from shadcn.com examples:
  - Check both component code AND required CSS variables
  - Compare globals.css with shadcn.com source for missing variables
  - Verify all animations and transitions are defined in tailwind.config.ts
- Important: Some component functionality requires modifying the base component file:
  - Features like swipe-to-dismiss must be added to the component source
  - Don't just add props to the usage site - check the component implementation
  - Common examples: Sheet swipe gestures, Dialog animations, Drawer transitions

### Shadcn Component Integration
- Components may look different from shadcn.com even with identical code
- Visual differences often come from missing CSS variables in globals.css
- Each component relies on both:
  - Component-specific styles in the component file
  - Theme variables in globals.css (colors, animations, spacing)
- When copying from shadcn.com examples:
  - Check both component code AND required CSS variables
  - Compare globals.css with shadcn.com source for missing variables
  - Verify all animations and transitions are defined in tailwind.config.ts

## Component Requirements

### MDX Components

- Must be explicitly imported and passed to MDX provider
- Register before use in MDX content
- Must be Client Components
- Use dynamic imports with next/dynamic
- Export as named exports for proper dynamic loading
- Raw MDX content must be processed by Contentlayer before use
- Simply returning raw content in computed fields is insufficient
- Contentlayer needs to transform the MDX into executable code

### MDX File Handling
- Prefer dynamic imports over contentlayer computed fields for optional MDX files
- Always handle missing MDX files gracefully with try/catch or existence checks
- Example: For CTA content that may not exist in every category

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
```
