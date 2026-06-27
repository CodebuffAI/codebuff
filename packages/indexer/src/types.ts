export interface IndexedFile {
  path: string       // relative to project root
  mtime: number      // ms epoch, for cache invalidation
  size: number       // bytes
  hash: string       // sha256 content hash, for robust cache invalidation
  ext: string        // '.ts', '.md', etc.
  symbols: string[]  // top exported/defined identifiers from code-map
  imports: string[]  // import paths (regex extracted)
  headings: string[] // for .md/.mdx only
  concepts: string[] // normalized doc concepts/headings for graph search
}

export type IndexNodeType = 'file' | 'symbol' | 'import' | 'heading' | 'concept'

export interface IndexNode {
  id: string
  type: IndexNodeType
  label: string
  path?: string
}

export type IndexEdgeType =
  | 'defines'
  | 'imports'
  | 'calls'
  | 'contains_heading'
  | 'mentions'
  | 'references'

export interface IndexEdge {
  from: string
  to: string
  type: IndexEdgeType
  weight: number
  label?: string
}

export interface IndexGraph {
  nodes: Record<string, IndexNode>
  edges: IndexEdge[]
}

export interface MetadataIndex {
  version: '2'
  projectRoot: string
  builtAt: number
  fileCount: number
  files: Record<string, IndexedFile>
  graph: IndexGraph
}

export type QueryIndexMode =
  | 'search'
  | 'neighbors'
  | 'path'
  | 'explain'
  | 'commands'
  | 'references'

/**
 * Per-token lexical scoring weights applied during `scoreFile`. Every weight
 * defaults to the historical hardcoded constant so omitting `weights` keeps
 * ranking identical. Exposed in `openbuff.json` so users can tune relevance for
 * their corpus (e.g. down-weight symbols in generated code, up-weight
 * headings in docs-heavy repos).
 */
export interface LexicalWeights {
  /** Match inside the file name (basename). Historical default: 5. */
  fileName?: number
  /** Match anywhere else in the path. Historical default: 2. */
  path?: number
  /** Match against defined/exported symbols. Historical default: 3. */
  symbol?: number
  /** Match against markdown headings. Historical default: 2.5. */
  heading?: number
  /** Match against doc/config concepts. Historical default: 1.5. */
  concept?: number
  /** Match against import specifiers. Historical default: 1. */
  import?: number
}

/**
 * Graph edge weights applied when `buildGraph` materialises edges into the
 * index. Defaults match the historical hardcoded constants; customising lets a
 * repo emphasise call relationships over import relationships, etc. Note these
 * are baked into the persisted index at build time, so changing them triggers
 * a graph rebuild (the file-level token data is reused).
 */
export interface GraphWeights {
  /** File defines a symbol. Historical default: 1. */
  defines?: number
  /** File imports a module. Historical default: 0.7. */
  imports?: number
  /** File references a resolved file (import → file edge). Historical default: 0.9. */
  references?: number
  /** File contains a heading (docs). Historical default: 0.8. */
  containsHeading?: number
  /** File mentions a concept. Historical default: 0.6. */
  mentions?: number
  /** File calls a symbol defined elsewhere (caller → callee). Historical default: 1.1. */
  calls?: number
}

/**
 * Blend weight for semantic hits folded into lexical results. `1` means a
 * full-magnitude semantic hit contributes as much as the top lexical hit.
 * Lower to de-emphasise semantic ranking, raise to amplify it. Historical
 * default: 1 (no `weight` arg passed to `blendSemanticScores`).
 */
export type SemanticBlendWeight = number

/**
 * Configurable blending weights for the indexer. All optional; every field
 * falls back to its historical hardcoded default so the feature is fully
 * backwards compatible. Surfaced via `indexing.weights` in `openbuff.json`.
 */
export interface IndexingWeights {
  lexical?: LexicalWeights
  graph?: GraphWeights
  /** Semantic blend weight (see {@link SemanticBlendWeight}). */
  semanticBlend?: SemanticBlendWeight
}

export interface RelatedFile {
  path: string
  score: number
  reason: string
  via?: string
}

export interface QueryIndexResult {
  path: string
  score: number
  matchedOn: Array<'symbol' | 'path' | 'heading' | 'import' | 'graph' | 'concept' | 'semantic' | 'command'>
  symbols?: string[]
  headings?: string[]
  matchedSnippets?: string[]
  relatedFiles?: RelatedFile[]
  explanation?: string
}

export interface IndexingConfig {
  enabled?: boolean
  cacheDir?: string
  exclude?: string[]
  semantic?: {
    enabled?: boolean
    model?: string
  }
  /**
   * Lexical/graph/semantic blending weights. All optional with historical
   * defaults; see {@link IndexingWeights}. P1-3 rescoped feature.
   */
  weights?: IndexingWeights
}
