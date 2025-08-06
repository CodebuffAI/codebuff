# Publishing the Codebuff SDK

## Quick Start

To publish the SDK to npm:

```bash
# Dry run (recommended first)
bun run publish-dry-run

# Publish to npm
bun run publish-sdk
```

## What the Publishing Script Does

1. **Cleans** previous build artifacts
2. **Builds** TypeScript to JavaScript and .d.ts files
3. **Prepares package.json** for publishing:
   - Updates file paths (removes `./dist/` prefix)
   - Converts workspace dependencies to peer dependencies
   - Sets public access
4. **Copies** README.md and CHANGELOG.md to dist
5. **Verifies** package contents with `npm pack --dry-run`
6. **Publishes** to npm (if not dry run)

## Available Scripts

- `bun run build` - Build TypeScript only
- `bun run clean` - Remove dist directory
- `bun run publish-dry-run` - Full build + verification (no publish)
- `bun run publish-sdk` - Full build + publish to npm
- `bun run typecheck` - Type checking only

## Before Publishing

1. Update version in `package.json`
2. Update `CHANGELOG.md` with new changes
3. Run `bun run publish-dry-run` to verify
4. Run `bun run publish-sdk` to publish

## Package Contents

The published package includes:
- All compiled `.js` files
- All TypeScript declaration `.d.ts` files
- Source maps `.d.ts.map` files
- README.md
- CHANGELOG.md
- Modified package.json with correct paths
