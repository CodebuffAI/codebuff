import type { Model } from '../old-constants'

// Cache the explicitly defined models for O(1) lookup performance
// Cast to string[] to avoid TypeScript union type issues with (string & {})
let explicitlyDefinedModels: Set<string> | null = null

function getExplicitlyDefinedModels(): Set<string> {
  if (explicitlyDefinedModels === null) {
    // NOTE: Inline require() avoids circular dependency - old-constants imports this
    // module, so a top-level import would create a circular reference
    const { models, shouldCacheModels } = require('../old-constants')
    explicitlyDefinedModels = new Set([
      ...(Object.values(models) as string[]),
      ...(Object.values(shouldCacheModels) as string[]),
    ])
  }
  return explicitlyDefinedModels
}

/**
 * Check if a model is explicitly defined in the models constant object.
 * This is used to determine if a model should allow fallbacks or support cache control.
 * @param model - The model to check
 * @returns boolean - True if the model is explicitly defined, false otherwise
 */
export function isExplicitlyDefinedModel(model: Model): boolean {
  return getExplicitlyDefinedModels().has(model as string)
}
