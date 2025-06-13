// Platform-specific node-pty native module loader
// This uses a compile-time environment variable to statically require the correct .node file

declare const PLATFORM_TRIPLET: string;

// Use direct conditional imports that Bun can statically analyze
let ptyModule: any;

try {
  if (typeof PLATFORM_TRIPLET !== 'undefined') {
    if (PLATFORM_TRIPLET === 'x86_64-unknown-linux-gnu') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.napi.node');
    } else if (PLATFORM_TRIPLET === 'aarch64-unknown-linux-gnu') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.napi.node');
    } else if (PLATFORM_TRIPLET === 'x86_64-apple-darwin') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/darwin-x64/node.napi.node');
    } else if (PLATFORM_TRIPLET === 'aarch64-apple-darwin') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/darwin-arm64/node.napi.node');
    } else if (PLATFORM_TRIPLET === 'x86_64-pc-windows-msvc') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/win32-x64/node.napi.node');
    } else {
      // Fallback for unknown platforms
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch');
    }
  } else {
    // Development mode - use the full module
    ptyModule = require('@homebridge/node-pty-prebuilt-multiarch');
  }
} catch (error) {
  // Return null for unsupported platforms (it's an optional dependency)
  ptyModule = null;
}

module.exports = ptyModule;
