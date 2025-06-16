// Platform-specific ripgrep binary path resolver
// This provides the correct ripgrep binary path for the current platform

export const rgPath = process.env.RIPGREP_PATH || require('@vscode/ripgrep').rgPath
