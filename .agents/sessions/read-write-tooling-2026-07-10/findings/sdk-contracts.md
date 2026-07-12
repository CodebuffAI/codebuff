# SDK and contract findings

- Fixed trailing-newline and CRLF range hashes so `read_files` output is immediately valid for range-aware edit tools.
- Fixed valid `apply_patch` updates that delete all file content.
- Clarified generated `basedOnRead` contracts and regenerated tool definitions.
- Unified patch coordinates now disambiguate repeated context; unresolved coordinate-less ambiguity fails without writing.
- Zero-context unified insertion hunks now honor their declared old-file coordinate.
- Missing symbol reads now carry an explicit error reason instead of only `{ slices: [] }`.
- Added injected-filesystem-aware realpath containment for SDK reads, images, writes, patches, ranges, and directory listings, including an escaping virtual-filesystem symlink regression test.
- Added canonical `read_files` v1 results built directly from typed read metadata, with per-selector identity, typed errors, strict summary invariants, omissions, and legacy adapters.
- Preserved public `getFiles()` behavior while adding `getFilesStructured()` and a structured format opt-in used by the CLI.
- Atomic rollback now reports incomplete recovery and affected paths when any rollback operation fails.
- Remaining work: extend structured results to the rest of the filesystem tools and replace legacy edit-result envelopes with the shared canonical mutation result.
