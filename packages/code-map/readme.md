# Code Map Package

## Tree-Sitter Language Support

This package provides dynamic language support using tree-sitter. Language packages are loaded on-demand to keep the initial installation size small.

### Supported Languages

The following languages are supported:
- TypeScript/TSX
- JavaScript/JSX  
- Python
- Java
- C#
- C/C++
- Rust
- Ruby
- Go
- PHP

### How It Works

1. **Lazy Loading**: Language packages are loaded only when a file of that type is first encountered
2. **Automatic Installation**: Missing language packages are installed automatically
3. **Package Caching**: Successfully loaded languages are cached for subsequent use
4. **Version Pinning**: Language packages are installed at ^0.23.0 for compatibility

### Installation

Language packages are installed as peer dependencies. You don't need to install them manually - they will be installed automatically when needed.

The system will:
1. Detect when a language package is needed
2. Install it using your project's package manager (npm/yarn/pnpm/bun)
3. Load and cache the language for future use

### Package Manager Support

The system automatically detects and uses your project's package manager:
- npm (with --legacy-peer-deps for compatibility)
- yarn
- pnpm
- bun

### Error Handling

If a language package fails to load or install:
- The system will gracefully fall back to skipping that file
- Errors are cached to prevent repeated failed installation attempts
- You can manually install the package to resolve any issues