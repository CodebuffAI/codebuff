export const WASM_FILES = {
  'tree-sitter-c-sharp.wasm': 'tree-sitter-c-sharp.wasm',
  'tree-sitter-cpp.wasm': 'tree-sitter-cpp.wasm',
  'tree-sitter-go.wasm': 'tree-sitter-go.wasm',
  'tree-sitter-java.wasm': 'tree-sitter-java.wasm',
  'tree-sitter-javascript.wasm': 'tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm': 'tree-sitter-python.wasm',
  'tree-sitter-ruby.wasm': 'tree-sitter-ruby.wasm',
  'tree-sitter-rust.wasm': 'tree-sitter-rust.wasm',
  'tree-sitter-tsx.wasm': 'tree-sitter-tsx.wasm',
  'tree-sitter-typescript.wasm': 'tree-sitter-typescript.wasm',
  'tree-sitter-kotlin.wasm': 'tree-sitter-kotlin.wasm',
  'tree-sitter-php.wasm': 'tree-sitter-php.wasm',
  'tree-sitter-swift.wasm': 'tree-sitter-swift.wasm',
  'tree-sitter-gdscript.wasm': 'tree-sitter-gdscript.wasm',
} as const

export const LANGUAGE_WASM_FILES = Object.freeze(Object.values(WASM_FILES))
