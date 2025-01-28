import { z } from 'zod'

// Default values for browser actions
export const BROWSER_DEFAULTS = {
  // Common defaults
  headless: true,
  timeout: 15000, // 15 seconds
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    retryOnErrors: ['TimeoutError', 'TargetClosedError'],
  },

  // Navigation defaults
  waitUntil: 'networkidle0' as const,

  // Click defaults
  waitForNavigation: false,
  button: 'left' as const,

  // Type defaults
  delay: 100, // 100ms between keystrokes

  // Screenshot defaults
  fullPage: false,
  quality: 60,
  maxScreenshotWidth: 400 as number,
  maxScreenshotHeight: 400 as number,
  screenshotCompression: 'jpeg' as const,
  screenshotCompressionQuality: 40,
  compressScreenshotData: false,

  // Advanced configuration defaults
  maxConsecutiveErrors: 3,
  totalErrorThreshold: 10,
  sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
  debug: false,
} as const

/**
 * Response schema for browser action results
 */
export const LogSchema = z.object({
  type: z.enum(['error', 'warning', 'info', 'debug', 'verbose']),
  message: z.string(),
  timestamp: z.number(),
  location: z.string().optional(),
  stack: z.string().optional(),
  category: z.string().optional(),
  level: z.number().optional(),
})

export const MetricsSchema = z.object({
  loadTime: z.number(),
  memoryUsage: z.number(),
  jsErrors: z.number(),
  networkErrors: z.number(),
  ttfb: z.number().optional(),
  lcp: z.number().optional(),
  fcp: z.number().optional(),
  domContentLoaded: z.number().optional(),
  sessionDuration: z.number().optional(),
})

export const NetworkEventSchema = z.object({
  url: z.string(),
  method: z.string(),
  status: z.number().optional(),
  errorText: z.string().optional(),
  timestamp: z.number(),
})

export const LogFilterSchema = z.object({
  types: z
    .array(z.enum(['error', 'warning', 'info', 'debug', 'verbose']))
    .optional(),
  minLevel: z.number().optional(),
  categories: z.array(z.string()).optional(),
})

// Required options for each action type
export const RequiredRetryOptionsSchema = z.object({
  maxRetries: z.number(),
  retryDelay: z.number(),
  retryOnErrors: z.array(z.string()),
})

// Optional configurations that can be added to any action
export const OptionalBrowserConfigSchema = z.object({
  timeout: z.number().optional(),
  retryOptions: z
    .object({
      maxRetries: z.number().optional(),
      retryDelay: z.number().optional(),
      retryOnErrors: z.array(z.string()).optional(),
    })
    .optional(),
  logFilter: LogFilterSchema.optional(),
  debug: z.boolean().optional(),
})

// Advanced optional configurations specific to start action
export const OptionalStartConfigSchema = z.object({
  maxConsecutiveErrors: z.number().optional(),
  totalErrorThreshold: z.number().optional(),
  sessionTimeoutMs: z.number().optional(),
  headless: z.boolean().optional(),
})

// Optional configurations specific to each action type
export const OptionalNavigateConfigSchema = z.object({
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0']).optional(),
})

export const OptionalClickConfigSchema = z.object({
  waitForNavigation: z.boolean().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
})

export const OptionalTypeConfigSchema = z.object({
  delay: z.number().optional(),
})

export const OptionalScreenshotConfigSchema = z.object({
  fullPage: z.boolean().optional(),
  quality: z.number().min(0).max(100).optional(),
  maxScreenshotWidth: z.number().optional(),
  maxScreenshotHeight: z.number().optional(),
  screenshotCompression: z.enum(['jpeg', 'png']).optional(),
  screenshotCompressionQuality: z.number().min(0).max(100).optional(),
  compressScreenshotData: z.boolean().optional(),
})

// Maximum size for a single WebSocket message (10MB)
export const MAX_MESSAGE_SIZE = 10 * 1024 * 1024

export const BrowserResponseChunkSchema = z.object({
  id: z.string(),
  total: z.number(),
  index: z.number(),
  data: z.string(), // Base64 encoded chunk
})

export const BrowserResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  screenshot: z.string().optional(), // Base64 encoded
  logs: z.array(LogSchema),
  metrics: MetricsSchema.optional(),
  networkEvents: z.array(NetworkEventSchema).optional(),
  logFilter: LogFilterSchema.optional(),
  chunks: z.array(BrowserResponseChunkSchema).optional(),
})

// Update action schemas to include retry options
// Required base schemas
export const RequiredBrowserStartActionSchema = z.object({
  type: z.literal('start'),
  url: z.string().url(),
})

// Combined schema
export const BrowserStartActionSchema = RequiredBrowserStartActionSchema.merge(
  OptionalBrowserConfigSchema
).merge(OptionalStartConfigSchema)

export const RequiredBrowserNavigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().url(),
})

export const BrowserNavigateActionSchema =
  RequiredBrowserNavigateActionSchema.merge(OptionalBrowserConfigSchema).merge(
    OptionalNavigateConfigSchema
  )

export const RequiredBrowserClickActionSchema = z.object({
  type: z.literal('click'),
  selector: z.string(),
})

export const BrowserClickActionSchema = RequiredBrowserClickActionSchema.merge(
  OptionalBrowserConfigSchema
).merge(OptionalClickConfigSchema)

export const RequiredBrowserTypeActionSchema = z.object({
  type: z.literal('type'),
  selector: z.string(),
  text: z.string(),
})

export const BrowserTypeActionSchema = RequiredBrowserTypeActionSchema.merge(
  OptionalBrowserConfigSchema
).merge(OptionalTypeConfigSchema)

export const RequiredBrowserScrollActionSchema = z.object({
  type: z.literal('scroll'),
})

export const OptionalScrollConfigSchema = z.object({
  direction: z.enum(['up', 'down']).optional(),
})

export const BrowserScrollActionSchema =
  RequiredBrowserScrollActionSchema.merge(OptionalBrowserConfigSchema).merge(
    OptionalScrollConfigSchema
  )

export const RequiredBrowserScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
})

export const BrowserScreenshotActionSchema =
  RequiredBrowserScreenshotActionSchema.merge(
    OptionalBrowserConfigSchema
  ).merge(OptionalScreenshotConfigSchema)

export const RequiredBrowserStopActionSchema = z.object({
  type: z.literal('stop'),
})

export const BrowserStopActionSchema = RequiredBrowserStopActionSchema.merge(
  OptionalBrowserConfigSchema
)

// First define the base action schemas without the diagnostic step
const BaseBrowserActionSchema = z.discriminatedUnion('type', [
  BrowserStartActionSchema,
  BrowserNavigateActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  BrowserScrollActionSchema,
  BrowserScreenshotActionSchema,
  BrowserStopActionSchema,
])

// Now we can define the diagnostic step schema that references the base actions
export const DiagnosticStepSchema = z.object({
  label: z.string().optional(),
  // The actual browser action to run
  action: BaseBrowserActionSchema,
  // Success conditions to verify after step
  expectedLogs: z.array(z.string()).optional(),
  noJsErrors: z.boolean().optional(),
  noNetworkErrors: z.boolean().optional(),
  customCondition: z.string().optional(),
})

// The 'diagnose' action for multi-step debugging
export const BrowserDiagnoseActionSchema = z.object({
  type: z.literal('diagnose'),
  // Array of steps to run
  steps: z.array(DiagnosticStepSchema),
  // Toggle whether to run all steps automatically or step-by-step
  automated: z.boolean().optional(),
  // Optional maximum steps/time to run
  maxSteps: z.number().optional(),
  sessionTimeoutMs: z.number().optional(),
  // Include optional browser config
  ...OptionalBrowserConfigSchema.shape,
})

// Finally, export the complete schema that includes diagnostic actions
export const BrowserActionSchema = z.discriminatedUnion('type', [
  BrowserStartActionSchema,
  BrowserNavigateActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  BrowserScrollActionSchema,
  BrowserScreenshotActionSchema,
  BrowserStopActionSchema,
  BrowserDiagnoseActionSchema,
])

/**
 * Creates an XML string from a BrowserAction object
 */
export function createBrowserActionXML(action: BrowserAction): string {
  const { type, ...attributes } = action
  const attrsString = Object.entries(attributes)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      // Handle different value types
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
      // Escape special characters in XML attributes
      const escaped = val.replace(/[<>&'"]/g, (char) => {
        switch (char) {
          case '<':
            return '&lt;'
          case '>':
            return '&gt;'
          case '&':
            return '&amp;'
          case '"':
            return '&quot;'
          case "'":
            return '&apos;'
          default:
            return char
        }
      })
      return `${k}="${escaped}"`
    })
    .join(' ')
  return `<browser_action action="${type}" ${attrsString} />`
}

/**
 * Parses XML attributes into a BrowserAction object
 */
export function parseBrowserActionXML(xmlString: string): BrowserAction {
  // Basic XML validation
  if (!xmlString.includes('<browser_action') || !xmlString.includes('/>')) {
    throw new Error('Invalid browser action XML: missing browser_action tag')
  }

  // Extract attributes using regex
  const attrs: Record<string, string> = {}
  const attrPattern = /(\w+)="([^"]*)"/g
  let match

  while ((match = attrPattern.exec(xmlString)) !== null) {
    const [_, key, value] = match
    attrs[key] = value
  }

  if (!attrs.action) {
    throw new Error('Invalid browser action XML: missing action attribute')
  }

  // Convert action attribute to type
  const type = attrs.action
  delete attrs.action

  // Parse special values (booleans, numbers, objects)
  const parsedAttrs = Object.entries(attrs).reduce(
    (acc, [key, value]) => {
      try {
        // Try to parse as JSON for objects
        if (value.startsWith('{') || value.startsWith('[')) {
          acc[key] = JSON.parse(value)
        }
        // Parse booleans
        else if (value === 'true' || value === 'false') {
          acc[key] = value === 'true'
        }
        // Parse numbers
        else if (!isNaN(Number(value))) {
          acc[key] = Number(value)
        }
        // Keep as string
        else {
          acc[key] = value
        }
      } catch {
        // If parsing fails, keep as string
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, any>
  )

  // Construct and validate the BrowserAction
  const action = { type, ...parsedAttrs } as BrowserAction
  return BrowserActionSchema.parse(action)
}

export type BrowserResponse = z.infer<typeof BrowserResponseSchema>
export type BrowserAction = z.infer<typeof BrowserActionSchema>



/**
 * Parse browser action XML attributes into a typed BrowserAction object
 */
export function parseBrowserActionAttributes(
  attributes: Record<string, string>
): BrowserAction {
  const { action, ...rest } = attributes
  return {
    type: action,
    ...Object.entries(rest).reduce((acc, [key, value]) => {
      // Convert string values to appropriate types
      if (value === 'true') return { ...acc, [key]: true }
      if (value === 'false') return { ...acc, [key]: false }
      if (!isNaN(Number(value))) return { ...acc, [key]: Number(value) }
      return { ...acc, [key]: value }
    }, {}),
  } as BrowserAction
}
