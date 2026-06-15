import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'read_image'
const endsAgentStep = true
const inputSchema = z
  .object({
    paths: z
      .preprocess(
        coerceToArray,
        z.array(
          z
            .string()
            .min(1, 'Paths cannot be empty')
            .describe(
              'Image file path to read relative to the project root. Absolute paths work only when they are inside the project root.',
            ),
        ),
      )
      .describe('List of image file paths to read.'),
  })
  .describe(
    'Read image files from disk and return them as model-visible image media.',
  )

const imageResultSchema = z.object({
  path: z.string(),
  status: z.enum(['attached', 'error']),
  mediaType: z.string().optional(),
  sizeBytes: z.number().optional(),
  message: z.string(),
})

const description = `
Read image files from disk and return the actual image content as media.

Use this instead of read_files for screenshots, PNGs, JPEGs, WebP, GIF, BMP, or TIFF files. read_files is for text/code and cannot show the model an image.

Paths are resolved from the project root. Absolute paths are accepted only when they are inside the project root.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    paths: ['screenshots/current-01.png', 'screenshots/current-02.png'],
  },
  endsAgentStep,
})}
`.trim()

export const readImageParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('json'),
        value: z.object({
          images: z.array(imageResultSchema),
        }),
      }),
      z.object({
        type: z.literal('media'),
        data: z.string(),
        mediaType: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
