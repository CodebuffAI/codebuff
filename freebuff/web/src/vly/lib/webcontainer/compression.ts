"use client";

// lz4-wasm is the wasm-pack "bundler" target: importing it instantiates a
// webpack-emitted .wasm chunk. Client components still render on the server
// (SSR), so a top-level import would make the server try to read that chunk
// from .next/server/static/wasm and crash (the module is aliased to `false`
// in the server webpack build — see next.config.mjs). Loading lazily keeps
// the wasm off the SSR module-evaluation path; these functions only ever run
// in the browser (WebContainer snapshot/cache paths).
type Lz4Module = typeof import("lz4-wasm");

let lz4Promise: Promise<Lz4Module> | null = null;

function loadLz4(): Promise<Lz4Module> {
  lz4Promise ??= import("lz4-wasm");
  return lz4Promise;
}

export async function compressWithLz4(data: Uint8Array): Promise<Uint8Array> {
  const lz4 = await loadLz4();
  return lz4.compress(data);
}

export async function decompressWithLz4(data: Uint8Array): Promise<Uint8Array> {
  const lz4 = await loadLz4();
  return lz4.decompress(data);
}
