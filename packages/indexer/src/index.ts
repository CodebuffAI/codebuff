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
export {
  loadIndex,
  saveIndex,
  loadSemanticVectors,
  saveSemanticVectors,
  isIndexStale,
  isIndexReady,
} from './index-store'
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
export { extractAssetRefs, extractGodotScriptRefs } from './asset-refs'
export type { AssetRef } from './asset-refs'
export type {
  QueryOptions,
  QueryQualityCase,
  QueryQualityReport,
} from './query'
export {
  isSemanticIndexingAvailable,
  cosineSimilarity,
  buildFileVectors,
  semanticSearch,
  blendSemanticScores,
  fileEmbeddingText,
  getSemanticConfigFingerprint,
} from './semantic'
export type { EmbedFn, FileVector, SemanticHit } from './semantic'
export { evaluateRetrievalQuality } from './retrieval-quality'
export type {
  RetrievalQualityCase,
  RetrievalQualityCorpus,
  RetrievalQualityDocument,
  RetrievalQualityEvaluationOptions,
  RetrievalQualityMetrics,
} from './retrieval-quality'
