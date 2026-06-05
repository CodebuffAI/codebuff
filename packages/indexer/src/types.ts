export interface IndexedFile {
  path: string       // relative to project root
  mtime: number      // ms epoch, for cache invalidation
  size: number       // bytes
  ext: string        // '.ts', '.md', etc.
  symbols: string[]  // top exported/defined identifiers from code-map
  imports: string[]  // import paths (regex extracted)
  headings: string[] // for .md/.mdx only
}

export interface MetadataIndex {
  version: '1'
  projectRoot: string
  builtAt: number
  fileCount: number
  files: Record<string, IndexedFile>
}

export interface QueryIndexResult {
  path: string
  score: number
  matchedOn: Array<'symbol' | 'path' | 'heading' | 'import'>
  symbols?: string[]
  headings?: string[]
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
