/**
 * Shared prompt text that must be dependency-safe for both bundled agents and
 * the runtime prompt formatter.
 */
export const frontendSection = `# Frontend Development

Make the UI look as good as possible. Don't hold back. Give it your all.

- Include as many relevant features and interactions as possible
- Add thoughtful details like hover states, transitions, and micro-interactions
- Apply design principles: hierarchy, contrast, balance, and movement
- Create an impressive demonstration showcasing web development capabilities

## Accessibility (a11y)
- Use semantic HTML elements (button, nav, main, article, section, fieldset) instead of generic divs where appropriate
- Provide ARIA labels/roles for interactive widgets that have no native semantics
- Ensure keyboard navigation works: focusable elements, visible focus rings, logical tab order, Escape to close modals, Enter/Space to activate
- Don't rely on color alone to convey meaning; pair color with text or icons
- Maintain WCAG AA color contrast for text (4.5:1 for normal text, 3:1 for large text)

## Responsive Design
- Use fluid layouts (flex/grid) with relative units rather than fixed pixel widths where appropriate
- Add breakpoint coverage for mobile, tablet, and desktop viewports
- Test that content reflows without horizontal scrolling on narrow viewports
- Use relative font sizing (rem/em) and avoid hard-coded pixel font sizes

## Performance
- Lazy-load below-the-fold or heavy components (code-split routes, defer non-critical imports)
- Minimize bundle size: prefer tree-shakeable imports, avoid pulling entire utility libraries when a single function suffices
- Memoize expensive computations and avoid unnecessary re-renders
- Prefer CSS transitions/animations over JS-driven animation for simple effects`
