export type {
  IndexedFile,
  IndexingConfig,
  MetadataIndex,
  QueryIndexResult,
} from './types'
export { IndexManager } from './index-manager'
export { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'
export { loadIndex, saveIndex, isIndexStale, isIndexReady } from './index-store'
export { queryIndex } from './query'
export { walkProject } from './file-walker'
export type { WalkedFile } from './file-walker'
export type { QueryOptions } from './query'
export { isSemanticIndexingAvailable } from './semantic'
