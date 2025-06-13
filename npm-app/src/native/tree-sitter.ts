// Platform-specific tree-sitter native module loader
// Tree-sitter 0.25.0 doesn't have prebuilt binaries, so we disable it in binary builds

declare const PLATFORM_TRIPLET: string;

// For binary builds, tree-sitter is not available since it requires compilation
// The code-map package is excluded from binary builds, so this is just a placeholder
export default null;
