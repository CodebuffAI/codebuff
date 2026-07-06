export type {
  IndexedFile,
  IndexingConfig,
  MetadataIndex,
  QueryIndexResult,
  IndexNodeType,
  IndexNode,
  IndexEdgeType,
  IndexEdge,
  IndexGraph,
  QueryIndexMode,
  RelatedFile,
} from './types'
export { IndexManager } from './index-manager'
export { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'
export { loadIndex, saveIndex, isIndexStale, isIndexReady } from './index-store'
export { queryIndex, evaluateQueryIndexQuality } from './query'
export {
  buildRepoMap,
  compareRetrievalStrategies,
  formatRetrievalComparisonReport,
  queryRepoMap,
} from './repo-map'
export type {
  RepoMapEntry,
  RepoMapOptions,
  RepoMapResult,
  RetrievalComparisonCase,
  RetrievalComparisonReport,
  RetrievalStrategyMetrics,
} from './repo-map'
export { walkProject } from './file-walker'
export type { WalkedFile } from './file-walker'
export type { QueryOptions, QueryQualityCase, QueryQualityReport } from './query'
export {
  isSemanticIndexingAvailable,
  cosineSimilarity,
  buildFileVectors,
  semanticSearch,
  blendSemanticScores,
  fileEmbeddingText,
} from './semantic'
export type { EmbedFn, FileVector, SemanticHit } from './semantic'
