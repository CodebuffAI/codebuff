import z from 'zod/v4'

import { jsonObjectSchema } from '../../../types/json'
import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const inspect3dAssetParams = {
  toolName: 'inspect_3d_asset',
  endsAgentStep: true,
  description:
    'Inspect a project-contained 3D asset as structured metadata without treating binary bytes as text. Supports native glTF/GLB/OBJ parsing and Blender-backed inspection for other formats.',
  inputSchema: z.object({
    path: z.string().min(1).describe('Project-relative 3D asset path.'),
  }),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams

const previewViewSchema = z.enum([
  'camera',
  'perspective',
  'front',
  'side',
  'top',
])

export const render3dPreviewParams = {
  toolName: 'render_3d_preview',
  endsAgentStep: true,
  description:
    'Render deterministic project-scoped PNG previews of a supported 3D asset and attach the images with source-bound artifact receipts. Non-.blend formats are imported through fixed Blender operators. Requires the local Blender CLI.',
  inputSchema: z.object({
    path: z.string().min(1).describe('Project-relative 3D asset path.'),
    views: z.array(previewViewSchema).min(1).max(4).default(['perspective']),
    mode: z.enum(['material', 'clay', 'wireframe']).default('material'),
    width: z.number().int().min(128).max(2048).default(768),
    height: z.number().int().min(128).max(2048).default(768),
  }),
  outputSchema: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('json'), value: jsonObjectSchema }),
      z.object({
        type: z.literal('media'),
        data: z.string(),
        mediaType: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams

const vector3Schema = z.tuple([z.number(), z.number(), z.number()])
const editOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rename_object'),
    object: z.string().min(1),
    new_name: z.string().min(1),
  }),
  z.object({
    type: z.literal('set_object_transform'),
    object: z.string().min(1),
    location: vector3Schema.optional(),
    rotation_degrees: vector3Schema.optional(),
    scale: vector3Schema.optional(),
  }),
  z.object({
    type: z.literal('set_render_resolution'),
    width: z.number().int().min(16).max(16_384),
    height: z.number().int().min(16).max(16_384),
    percentage: z.number().int().min(1).max(100).default(100),
  }),
  z
    .object({
      type: z.literal('set_frame_range'),
      start: z.number().int(),
      end: z.number().int(),
    })
    .refine((value) => value.end >= value.start, {
      message: 'Frame range end must be at or after start.',
    }),
])

export const edit3dAssetParams = {
  toolName: 'edit_3d_asset',
  endsAgentStep: true,
  description:
    'Apply bounded declarative operations to a .blend file. Requires the exact source hash from inspect_3d_asset, edits a project-scoped working copy, reopens it for validation, and conditionally commits only if the source is unchanged. Python and shell input are not accepted.',
  inputSchema: z.object({
    path: z.string().min(1).describe('Project-relative .blend path.'),
    source_hash: z
      .string()
      .regex(/^(?:sha256:)?[0-9a-f]{64}$/i)
      .describe('Exact source hash returned by inspect_3d_asset.'),
    operations: z.array(editOperationSchema).min(1).max(20),
  }),
  outputSchema: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('json'), value: jsonObjectSchema }),
      z.object({
        type: z.literal('media'),
        data: z.string(),
        mediaType: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
