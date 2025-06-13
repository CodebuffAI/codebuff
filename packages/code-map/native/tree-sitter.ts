// Platform-specific tree-sitter native module loader
// This uses a compile-time environment variable to statically require the correct .node file

// Use direct conditional imports that Bun can statically analyze
let treeSitterModule: any;

try {
  // Check if we're in a binary build environment
  const isPlatformBuild = typeof (globalThis as any).PLATFORM_TRIPLET !== 'undefined' || process.env.NODE_ENV === 'production';
  
  if (isPlatformBuild) {
    // For binary builds, tree-sitter is not available since it requires compilation
    treeSitterModule = null;
  } else {
    // Development mode - use the full module
    treeSitterModule = require('tree-sitter');
  }
} catch (error) {
  // Return null for unsupported platforms or when tree-sitter isn't available
  treeSitterModule = null;
}

export default treeSitterModule;
