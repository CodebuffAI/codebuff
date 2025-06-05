import { z } from 'zod'
import {
  finetunedVertexModelNames, // Restore usage
  costModes,
  type CostMode,
} from 'common/constants'

// Create the customFileCounts shape using the centralized costModes
const customFileCountsShape = costModes.reduce(
  (acc, mode) => {
    acc[mode] = z.number().int().positive().optional()
    return acc
  },
  {} as Record<CostMode, z.ZodOptional<z.ZodNumber>>
)

// Prepare enum values for modelName.
// finetunedVertexModelNames is Record<string, string>, so Object.values gives string[].
const modelNameEnumValues = Object.values(finetunedVertexModelNames)

// Add a more robust check to ensure the array is suitable for z.enum
if (
  !Array.isArray(modelNameEnumValues) ||
  modelNameEnumValues.length === 0 ||
  !modelNameEnumValues.every(val => typeof val === 'string' && val.length > 0)
) {
  // This will prevent the server/tests from starting if no valid model names are found.
  let problemDescription = 'Unknown issue.'
  if (!Array.isArray(modelNameEnumValues)) problemDescription = 'Not an array.'
  else if (modelNameEnumValues.length === 0) problemDescription = 'Array is empty.'
  else problemDescription = 'Array contains non-string or empty string values.'
  
  throw new Error(
    `CustomFilePickerConfigSchema: No valid string values found for modelName enum. Problem: ${problemDescription}. Values from finetunedVertexModelNames: ${JSON.stringify(modelNameEnumValues)}`
  )
}

// Simplified Zod schema for custom file picker configuration
export const CustomFilePickerConfigSchema = z.object({
  // Model to use for file picking
  modelName: z.enum(modelNameEnumValues as [string, ...string[]]), // Use the validated array

  // Maximum number of files to request per call
  maxFilesPerRequest: z.number().int().positive().optional(),

  // Custom file count per cost mode
  customFileCounts: z.object(customFileCountsShape).optional(),
})

// Infer TypeScript type from Zod schema
export type CustomFilePickerConfig = z.infer<
  typeof CustomFilePickerConfigSchema
>
