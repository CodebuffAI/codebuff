// Platform-specific tree-sitter native module loader
// This loads tree-sitter only in development mode

let treeSitterModule: any = null;
let loadAttempted = false;

async function loadTreeSitter() {
  if (loadAttempted) {
    return treeSitterModule;
  }
  
  loadAttempted = true;
  
  try {
    // Check if we're in a binary build environment
    const isPlatformBuild = typeof (globalThis as any).PLATFORM_TRIPLET !== 'undefined' || process.env.NODE_ENV === 'production';
    
    if (isPlatformBuild) {
      // For binary builds, tree-sitter is not available since it requires compilation
      treeSitterModule = null;
    } else {
      // Development mode - use require for better compatibility
      treeSitterModule = require('tree-sitter');
    }
  } catch (error) {
    // Return null for unsupported platforms or when tree-sitter isn't available
    console.warn('Tree-sitter not available:', error instanceof Error ? error.message : String(error));
    treeSitterModule = null;
  }
  
  return treeSitterModule;
}

// Export the loader function directly
export default loadTreeSitter;
