# Rust Idioms

- Let ownership and borrowing drive the design; avoid cloning unless it is intentional and cheap enough.
- Prefer `Result` and `Option` with explicit error propagation over panics in normal control flow.
- Keep lifetimes and generics as simple as the surrounding API allows.
- Use iterators, pattern matching, and trait implementations where they improve clarity.
- Preserve crate layout, feature flags, formatting, and existing error types.
