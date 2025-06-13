// Platform-specific ripgrep binary path resolver
// This provides the correct ripgrep binary path for the current platform

declare const PLATFORM_TRIPLET: string;

// For binary builds, we need to use the actual ripgrep binary from @vscode/ripgrep
// The path structure is consistent across platforms in the @vscode/ripgrep package
let ripgrepPath: string | undefined;

try {
  // @vscode/ripgrep puts the binary at bin/rg (or bin/rg.exe on Windows)
  if (PLATFORM_TRIPLET === 'x86_64-pc-windows-msvc') {
    ripgrepPath = require.resolve('@vscode/ripgrep/bin/rg.exe');
  } else {
    // All Unix-like platforms use the same binary name
    ripgrepPath = require.resolve('@vscode/ripgrep/bin/rg');
  }
} catch (error) {
  // Ripgrep not available in this build
  ripgrepPath = undefined;
}

export const rgPath = ripgrepPath;
