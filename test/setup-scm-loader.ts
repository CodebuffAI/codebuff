// Public-mirror stub for the repo-root SCM loader preload referenced by
// cli/bunfig.toml. The private repo uses this to configure the tree-sitter
// query (.scm) loader shared by @codebuff/code-map; the public mirror keeps
// the query files bundled with the package itself, so nothing needs wiring
// here. Without this file, `bun test` in the cli package fails at preload
// resolution, so it exists to make the public mirror self-testable.
export {}
