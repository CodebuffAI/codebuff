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

export type QueryIndexMode = 'search' | 'neighbors' | 'path' | 'explain' | 'commands'

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
}
