import { mock } from 'bun:test'

export interface MockTreeNode {
  text: string
  type?: string
  startPosition?: { row: number; column: number }
  endPosition?: { row: number; column: number }
  children?: MockTreeNode[]
}

export interface MockTree {
  rootNode: MockTreeNode
}

export interface MockCapture {
  name: string
  node: MockTreeNode
}

export interface MockParser {
  parse: (input: string) => MockTree | null
}

export interface MockQuery {
  captures: (node: MockTreeNode) => MockCapture[]
}

export interface CreateMockParserOptions {
  tree?: MockTree | null
  parseImpl?: (input: string) => MockTree | null
}

export interface CreateMockQueryOptions {
  captures?: MockCapture[]
  capturesImpl?: (node: MockTreeNode) => MockCapture[]
}

export function createMockCapture(name: string, text: string): MockCapture {
  return {
    name,
    node: { text },
  }
}

export function createMockTreeSitterCaptures(
  items: Array<{ name: string; text: string }>,
): MockCapture[] {
  return items.map(({ name, text }) => createMockCapture(name, text))
}

export function createMockTree(rootNodeText: string = 'mock tree'): MockTree {
  return {
    rootNode: { text: rootNodeText },
  }
}

export function createMockTreeSitterParser(
  options: CreateMockParserOptions = {},
): MockParser {
  const { tree, parseImpl } = options
  const defaultTree = createMockTree()
  const parseFn = parseImpl ?? (() => tree ?? defaultTree)

  return {
    parse: mock(parseFn),
  }
}

export function createMockTreeSitterQuery(
  options: CreateMockQueryOptions = {},
): MockQuery {
  const { captures = [], capturesImpl } = options
  const capturesFn = capturesImpl ?? (() => captures)

  return {
    captures: mock(capturesFn),
  }
}

export interface CreateMockLanguageConfigOptions {
  extensions?: string[]
  wasmFile?: string
  queryText?: string
  parser?: MockParser | null
  query?: MockQuery | null
  captures?: MockCapture[]
  tree?: MockTree | null
}

export function createMockLanguageConfig(
  options: CreateMockLanguageConfigOptions = {},
): {
  extensions: string[]
  wasmFile: string
  queryText: string
  parser: MockParser | null
  query: MockQuery | null
} {
  const {
    extensions = ['.ts'],
    wasmFile = 'tree-sitter-typescript.wasm',
    queryText = 'mock query',
    parser,
    query,
    captures,
    tree,
  } = options

  const finalQuery =
    query ??
    (captures
      ? createMockTreeSitterQuery({ captures })
      : createMockTreeSitterQuery())
  const finalParser =
    parser ??
    (tree !== undefined
      ? createMockTreeSitterParser({ tree })
      : createMockTreeSitterParser())

  return {
    extensions,
    wasmFile,
    queryText,
    parser: finalParser,
    query: finalQuery,
  }
}
