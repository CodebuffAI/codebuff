import { z } from 'zod'
import {
  finetunedVertexModels,
  finetunedVertexModelNames, // Added import
  costModes,
  type CostMode,
  type FinetunedVertexModel,
} from 'common/constants'

// Create the customFileCounts shape using the centralized costModes
const customFileCountsShape = costModes.reduce(
  (acc, mode) => {
    acc[mode] = z.number().int().positive().optional()
    return acc
  },
  {} as Record<CostMode, z.ZodOptional<z.ZodNumber>>
)

// Simplified Zod schema for custom file picker configuration
export const CustomFilePickerConfigSchema = z.object({
  // Model to use for file picking - programmatically generated from finetunedVertexModelNames
  modelName: z.enum(
    Object.values(finetunedVertexModelNames) as [string, ...string[]]
  ),

  // Maximum number of files to request per call
  maxFilesPerRequest: z.number().int().positive().optional(),

  // Custom file count per cost mode
  customFileCounts: z.object(customFileCountsShape).optional(),
})

// Infer TypeScript type from Zod schema
export type CustomFilePickerConfig = z.infer<
  typeof CustomFilePickerConfigSchema
>
