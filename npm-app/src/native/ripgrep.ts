// Platform-specific ripgrep binary path resolver
// This provides the correct ripgrep binary path for the current platform

// For binary builds, we need to use the actual ripgrep binary from @vscode/ripgrep
// The path structure is consistent across platforms in the @vscode/ripgrep package
let ripgrepPath: string | undefined;

try {
  // Check if we're in a binary build environment
  const isPlatformBuild = typeof (globalThis as any).PLATFORM_TRIPLET !== 'undefined' || process.env.NODE_ENV === 'production';
  const platformTriplet = (globalThis as any).PLATFORM_TRIPLET;
  
  if (isPlatformBuild && platformTriplet === 'x86_64-pc-windows-msvc') {
    ripgrepPath = require.resolve('@vscode/ripgrep/bin/rg.exe');
  } else if (isPlatformBuild) {
    // All Unix-like platforms use the same binary name
    ripgrepPath = require.resolve('@vscode/ripgrep/bin/rg');
  } else {
    // Development mode - use the standard binary
    ripgrepPath = require.resolve('@vscode/ripgrep/bin/rg');
  }
} catch (error) {
  // Ripgrep not available in this build
  ripgrepPath = undefined;
}

export const rgPath = ripgrepPath;
