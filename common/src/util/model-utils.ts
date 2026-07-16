// Compatibility export for callers that imported the old utility path. The
// implementation lives beside `models`, avoiding the old model-config ->
// model-utils -> old-constants -> model-config cycle and its CommonJS require.
export { isExplicitlyDefinedModel } from '../constants/model-config'
