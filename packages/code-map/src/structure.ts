import { getLanguageConfig } from './languages'

import type { Node } from 'web-tree-sitter'

/**
 * A single structural definition (function, class, method, type, …) extracted
 * from a source file, with its 1-indexed inclusive line span.
 *
 * Produced by walking the tree-sitter AST (not regex), so it is accurate across
 * every language code-map has a grammar for. `depth` is the nesting level by
 * range containment (0 = top level, 1 = e.g. a method inside a class).
 */
export interface SymbolRange {
  name: string
  kind: string
  startLine: number
  endLine: number
  depth: number
}

/**
 * AST node types that introduce a named definition, mapped to a normalized
 * `kind`. Reference/usage captures (calls, type uses) are intentionally absent
 * so they never show up as definitions. Shared types (e.g. `function_definition`
 * in both Python and C/C++) map to the same kind. Keep keys unique.
 */
const DEFINITION_NODE_KINDS: Record<string, string> = {
  // JavaScript / TypeScript
  function_declaration: 'function',
  generator_function_declaration: 'function',
  function_signature: 'function',
  method_definition: 'method',
  method_signature: 'method',
  abstract_method_signature: 'method',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
  // Python (function_definition/class_definition)
  function_definition: 'function',
  class_definition: 'class',
  // Java / C#
  method_declaration: 'method',
  constructor_declaration: 'method',
  record_declaration: 'class',
  struct_declaration: 'struct',
  namespace_declaration: 'module',
  // C / C++
  struct_specifier: 'struct',
  class_specifier: 'class',
  union_specifier: 'union',
  enum_specifier: 'enum',
  type_definition: 'type',
  // Rust
  function_item: 'function',
  struct_item: 'struct',
  enum_item: 'enum',
  union_item: 'union',
  type_item: 'type',
  trait_item: 'trait',
  mod_item: 'module',
  const_item: 'constant',
  static_item: 'variable',
  macro_definition: 'macro',
  impl_item: 'impl',
  // Ruby
  method: 'method',
  singleton_method: 'method',
  class: 'class',
  module: 'module',
  // Go
  type_spec: 'type',
}

const IDENTIFIER_NODE_TYPES = new Set([
  'identifier',
  'type_identifier',
  'field_identifier',
  'property_identifier',
  'constant',
])

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? text
  return line.trim()
}

/** Last segment of a scoped/qualified name (e.g. `foo::bar::Baz` -> `Baz`). */
function lastSegment(text: string): string {
  const cleaned = firstLine(text)
  const parts = cleaned.split(/::|\./).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cleaned
}

/** Shallow search for the first identifier-like descendant of a node. */
function findIdentifier(node: Node, maxDepth = 3): Node | null {
  const stack: Array<{ node: Node; depth: number }> = [{ node, depth: 0 }]
  while (stack.length > 0) {
    const { node: current, depth } = stack.shift()!
    if (IDENTIFIER_NODE_TYPES.has(current.type)) return current
    if (depth >= maxDepth) continue
    for (const child of current.namedChildren) {
      if (child) stack.push({ node: child, depth: depth + 1 })
    }
  }
  return null
}

/**
 * Resolve the declared name of a definition node across grammars:
 * 1. the explicit `name` field (most languages),
 * 2. the `declarator` field, drilling through nested declarators (C/C++),
 * 3. the `type` field (Rust `impl` blocks have no name),
 * 4. the first identifier-like descendant as a last resort.
 */
function extractDefName(node: Node): string | null {
  // Rust impl blocks have no name of their own; label them by the type they
  // implement (and trait, if any) so they read naturally in an outline and do
  // not collide with the struct/enum of the same name.
  if (node.type === 'impl_item') {
    const typeField = node.childForFieldName('type')
    const typeName = typeField ? lastSegment(typeField.text) : ''
    if (!typeName) return null
    const traitField = node.childForFieldName('trait')
    return traitField
      ? `impl ${lastSegment(traitField.text)} for ${typeName}`
      : `impl ${typeName}`
  }

  const nameField = node.childForFieldName('name')
  if (nameField) return lastSegment(nameField.text)

  let declarator = node.childForFieldName('declarator')
  for (let i = 0; declarator && i < 4; i++) {
    if (IDENTIFIER_NODE_TYPES.has(declarator.type)) {
      return lastSegment(declarator.text)
    }
    const nested = declarator.childForFieldName('declarator')
    if (!nested) break
    declarator = nested
  }
  if (declarator) {
    const id = findIdentifier(declarator)
    if (id) return lastSegment(id.text)
  }

  const typeField = node.childForFieldName('type')
  if (typeField) return lastSegment(typeField.text)

  const id = findIdentifier(node)
  return id ? lastSegment(id.text) : null
}

// Definition kinds that turn a contained free function into a "method".
const METHOD_CONTAINER_KINDS = new Set([
  'class',
  'struct',
  'interface',
  'trait',
  'impl',
])

const FUNCTION_VALUE_TYPES = new Set([
  'arrow_function',
  'function',
  'function_expression',
  'generator_function',
  'generator_function_expression',
])
const CLASS_VALUE_TYPES = new Set(['class', 'class_expression'])

/**
 * Is this variable_declarator declared at module top level (so it is a real
 * module member worth outlining), rather than a local inside a function/block?
 * Accepts `const x = …` and `export const x = …` at the program root.
 */
function isTopLevelDeclarator(node: Node): boolean {
  const declaration = node.parent // lexical_declaration | variable_declaration
  if (!declaration) return false
  const container = declaration.parent
  if (!container) return false
  if (container.type === 'program') return true
  if (container.type === 'export_statement') {
    return container.parent?.type === 'program'
  }
  return false
}

/**
 * Classify a JS/TS `variable_declarator`. Function/arrow/class initializers are
 * real definitions the tag grammar's declaration patterns miss (e.g. the very
 * common `export const f = () => {}` and non-exported module helpers). Plain
 * value consts are surfaced only at top level (module constants/config), not
 * for every local.
 */
function variableDeclaratorKind(node: Node): string | null {
  const value = node.childForFieldName('value')
  if (!value) return null
  if (!isTopLevelDeclarator(node)) return null
  if (FUNCTION_VALUE_TYPES.has(value.type)) return 'function'
  if (CLASS_VALUE_TYPES.has(value.type)) return 'class'
  return 'variable'
}

function assignDepths(symbols: SymbolRange[]): SymbolRange[] {
  const sorted = [...symbols].sort(
    (a, b) => a.startLine - b.startLine || b.endLine - a.endLine,
  )
  for (const sym of sorted) {
    const containers = sorted.filter(
      (other) =>
        other !== sym &&
        other.startLine <= sym.startLine &&
        other.endLine >= sym.endLine &&
        (other.startLine < sym.startLine || other.endLine > sym.endLine),
    )
    sym.depth = containers.length
    // Languages without a distinct method node (Python, Rust impl fns, Ruby)
    // model methods as plain functions. Relabel a function whose nearest
    // enclosing definition is a type/impl container so outlines read uniformly.
    if (sym.kind === 'function' && containers.length > 0) {
      const nearest = containers.reduce((a, b) =>
        b.endLine - b.startLine < a.endLine - a.startLine ? b : a,
      )
      if (METHOD_CONTAINER_KINDS.has(nearest.kind)) sym.kind = 'method'
    }
  }
  return sorted
}

/**
 * Extract structural definitions from source content using tree-sitter.
 *
 * Returns `null` when no grammar is available for the file's extension (or
 * tree-sitter could not initialize), so callers can fall back to a heuristic.
 * Returns `[]` for a parseable file with no top-level definitions.
 */
export async function parseFileStructure(
  content: string,
  filePath: string,
): Promise<SymbolRange[] | null> {
  let cfg
  try {
    cfg = await getLanguageConfig(filePath)
  } catch {
    return null
  }
  if (!cfg?.parser) return null

  let tree
  try {
    tree = cfg.parser.parse(content)
  } catch {
    return null
  }
  if (!tree) return null

  try {
    const symbols: SymbolRange[] = []
    const seen = new Set<string>()
    // Iterative DFS to avoid deep recursion on large files.
    const stack: Node[] = [tree.rootNode]
    while (stack.length > 0) {
      const node = stack.pop()!
      const kind = DEFINITION_NODE_KINDS[node.type]
      if (kind) {
        const name = extractDefName(node)
        if (name) {
          const startLine = node.startPosition.row + 1
          const endLine = node.endPosition.row + 1
          const key = `${startLine}:${endLine}:${name}`
          if (!seen.has(key)) {
            seen.add(key)
            symbols.push({ name, kind, startLine, endLine, depth: 0 })
          }
        }
      } else if (node.type === 'variable_declarator') {
        // Function/arrow/class consts + top-level value consts — the grammar's
        // declaration patterns don't cover these (incl. non-exported ones).
        const vkind = variableDeclaratorKind(node)
        const nameNode = node.childForFieldName('name')
        if (vkind && nameNode) {
          const name = lastSegment(nameNode.text)
          const startLine = node.startPosition.row + 1
          const endLine = node.endPosition.row + 1
          const key = `${startLine}:${endLine}:${name}`
          if (name && !seen.has(key)) {
            seen.add(key)
            symbols.push({ name, kind: vkind, startLine, endLine, depth: 0 })
          }
        }
      }
      for (const child of node.namedChildren) {
        if (child) stack.push(child)
      }
    }
    return assignDepths(symbols)
  } catch {
    return null
  } finally {
    ;(tree as { delete?: () => void }).delete?.()
  }
}
