import { z } from 'zod'

/**
 * Common action sub-schemas
 */
const BrowserStartActionSchema = z.object({
  type: z.literal('start'),
  url: z.string().url(),
  headless: z.boolean().optional().default(true),
  timeout: z.number().optional().default(15000),
})

const BrowserNavigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().url(),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle0'])
    .optional()
    .default('networkidle0'),
  timeout: z.number().optional().default(15000),
})

const BrowserClickActionSchema = z.object({
  type: z.literal('click'),
  selector: z.string(),
  waitForNavigation: z.boolean().optional().default(false),
  button: z.enum(['left', 'right', 'middle']).optional().default('left'),
  timeout: z.number().optional().default(15000),
})

const BrowserTypeActionSchema = z.object({
  type: z.literal('type'),
  selector: z.string(),
  text: z.string(),
  delay: z.number().optional().default(100), // ms between key presses
})

const BrowserScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  fullPage: z.boolean().optional().default(false),
  quality: z.number().min(0).max(100).optional().default(80),
})

const BrowserStopActionSchema = z.object({
  type: z.literal('stop'),
})

/**
 * Top-level discriminated union to represent a single browser action
 */
export const BrowserActionSchema = z.discriminatedUnion('type', [
  BrowserStartActionSchema,
  BrowserNavigateActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  BrowserScreenshotActionSchema,
  BrowserStopActionSchema,
])

export type BrowserAction = z.infer<typeof BrowserActionSchema>

/**
 * Response schema for browser action results
 */
export const BrowserResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  screenshot: z.string().optional(), // Base64 encoded
  logs: z.array(z.object({
    type: z.enum(['error', 'warning', 'info']),
    message: z.string(),
    timestamp: z.number(),
    location: z.string().optional(),
    stack: z.string().optional(),
  })),
  metrics: z.object({
    loadTime: z.number(),
    memoryUsage: z.number(),
    jsErrors: z.number(),
  }).optional(),
})

export type BrowserResponse = z.infer<typeof BrowserResponseSchema>
