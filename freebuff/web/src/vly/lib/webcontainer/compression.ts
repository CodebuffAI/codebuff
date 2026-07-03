"use client";

import * as lz4 from "lz4-wasm";

export function compressWithLz4(data: Uint8Array): Uint8Array {
  return lz4.compress(data);
}

export function decompressWithLz4(data: Uint8Array): Uint8Array {
  return lz4.decompress(data);
}
