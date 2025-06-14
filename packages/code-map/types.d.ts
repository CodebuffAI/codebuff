// Type declarations for WASM files
declare module '@vscode/tree-sitter-wasm/wasm/*.wasm' {
  const content: string
  export default content
}

// Type declarations for SCM query files
declare module '*.scm' {
  const content: string
  export default content
}
