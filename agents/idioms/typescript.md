# TypeScript/JavaScript Idioms

- Prefer precise TypeScript types over broad casts; use `unknown` and narrowing when inputs are not trusted.
- Preserve the project's module style, framework patterns, import ordering, and formatter output.
- Keep async control flow explicit; avoid floating promises unless the surrounding code intentionally does so.
- Model data with existing interfaces/types and avoid duplicating schema or validation logic.
- Make small, composable functions and keep side effects near the boundary that owns them.
