import { z } from 'zod/v4'

import { jsonValueSchema } from './types/json'

// Default values for browser actions
export const BROWSER_DEFAULTS = {
  // Common defaults
  headless: true,
  debug: false,
  timeout: 15000, // 15 seconds
  userDataDir: '_browser_profile', // Will be relative to project data dir
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    retryOnErrors: ['TimeoutError', 'TargetClosedError', 'DetachedFrameError'],
  },

  // Viewport defaults
  viewportWidth: 1280,
  viewportHeight: 720,

  // Navigation defaults
  waitUntil: 'networkidle0' as const,

  // Click defaults
  waitForNavigation: false,
  button: 'left' as const,

  // Type defaults
  delay: 100, // 100ms between keystrokes

  // Screenshot defaults
  fullPage: false,
  screenshotCompression: 'jpeg' as const,
  screenshotCompressionQuality: 25,
  compressScreenshotData: true,

  // Advanced configuration defaults
  maxConsecutiveErrors: 3,
  totalErrorThreshold: 10,
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
  source: z.enum(['browser', 'tool']).default('tool'),
})

export type Log = z.infer<typeof LogSchema>

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
export type NetworkEvent = z.infer<typeof NetworkEventSchema>

export const SnapshotElementSchema = z.object({
  index: z.number(),
  tag: z.string(),
  selector: z.string(),
  text: z.string().optional(),
  role: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
})

export const BrowserTabSchema = z.object({
  targetId: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  active: z.boolean().optional(),
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
})

export type BrowserConfig = z.infer<typeof OptionalBrowserConfigSchema> &
  z.infer<typeof OptionalStartConfigSchema>

export const FrameTargetSchema = z.object({
  frameSelector: z
    .string()
    .min(1)
    .optional()
    .describe(
      'CSS selector for a same-origin iframe to scope selector-based and frame-local coordinate actions.',
    ),
  frameId: z.string().min(1).optional(),
  frameUrl: z.string().min(1).optional(),
  frameName: z.string().min(1).optional(),
})

// Optional configurations specific to each action type
export const OptionalNavigateConfigSchema = z.object({
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0']).optional(),
})

export const OptionalClickConfigSchema = z.object({
  waitForNavigation: z.boolean().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  clickCount: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  // New optional fields for visual verification
  visualVerify: z.boolean().optional(),
  visualThreshold: z.number().min(0).max(1).optional(), // fraction from 0..1
})

export const OptionalTypeConfigSchema = z.object({
  delay: z.number().optional(),
  inputMode: z.enum(['real', 'setValue']).optional(),
  clear: z.boolean().optional(),
  pressEnter: z.boolean().optional(),
})

export const OptionalScreenshotConfigSchema = z.object({
  fullPage: z.boolean().optional(),
  screenshotCompression: z.enum(['jpeg', 'png']).optional(),
  screenshotCompressionQuality: z.number().optional(),
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

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.literal('image/jpeg'),
    data: z.string(),
  }),
})
export type ImageContent = z.infer<typeof ImageContentSchema>

export const BrowserResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  action: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  result: jsonValueSchema.optional(),
  text: z.string().optional(),
  elements: z.array(SnapshotElementSchema).optional(),
  screenshotAttached: z.boolean().optional(),
  recordingAttached: z.boolean().optional(),
  pdfAttached: z.boolean().optional(),
  diffAttached: z.boolean().optional(),
  tabs: z.array(BrowserTabSchema).optional(),
  logs: z.array(LogSchema),
  logFilter: LogFilterSchema.optional(),
  networkEvents: z.array(NetworkEventSchema).optional(),
  metrics: MetricsSchema.optional(),
  screenshots: z
    .object({
      pre: ImageContentSchema.optional(),
      post: ImageContentSchema,
    })
    .optional(),
})

// Update action schemas to include retry options
// Required base schemas
export const RequiredBrowserStartActionSchema = z.object({
  type: z.literal('start'),
  url: z.string().min(1),
})

// Combined schema
export const BrowserStartActionSchema = RequiredBrowserStartActionSchema.merge(
  OptionalBrowserConfigSchema,
).merge(OptionalStartConfigSchema)

export const RequiredBrowserNavigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().min(1),
})

export const BrowserNavigateActionSchema =
  RequiredBrowserNavigateActionSchema.merge(OptionalBrowserConfigSchema).merge(
    OptionalNavigateConfigSchema,
  )

const _RangeSchema = z.object({
  min: z.number(),
  max: z.number(),
})

export const RequiredBrowserClickActionSchema = z.object({
  type: z.literal('click'),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe('CSS selector for the element to click.'),
})

export const BrowserClickActionSchema = RequiredBrowserClickActionSchema.merge(
  OptionalBrowserConfigSchema,
)
  .merge(OptionalClickConfigSchema)
  .merge(FrameTargetSchema)

export const RequiredBrowserTypeActionSchema = z.object({
  type: z.literal('type'),
  selector: z.string().min(1),
  text: z.string(),
})

export const BrowserTypeActionSchema = RequiredBrowserTypeActionSchema.merge(
  OptionalBrowserConfigSchema,
)
  .merge(OptionalTypeConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserKeyActionSchema = z
  .object({
    type: z.literal('key'),
    key: z.string().min(1),
    text: z.string().optional(),
    command: z.enum(['press', 'down', 'up']).optional(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const RequiredBrowserMouseActionSchema = z.object({
  type: z.literal('mouse'),
  event: z.enum(['move', 'down', 'up', 'click']),
})

export const BrowserMouseActionSchema = RequiredBrowserMouseActionSchema.merge(
  z.object({
    selector: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    button: z.enum(['left', 'right', 'middle']).optional(),
    clickCount: z.number().optional(),
  }),
)
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserHoverActionSchema = z
  .object({
    type: z.literal('hover'),
    selector: z.string().min(1),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserDragActionSchema = z
  .object({
    type: z.literal('drag'),
    fromSelector: z.string().min(1).optional(),
    toSelector: z.string().min(1).optional(),
    fromX: z.number().optional(),
    fromY: z.number().optional(),
    toX: z.number().optional(),
    toY: z.number().optional(),
    steps: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserSelectActionSchema = z
  .object({
    type: z.literal('select'),
    selector: z.string().min(1),
    value: z.string().optional(),
    label: z.string().optional(),
    index: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const RequiredBrowserScrollActionSchema = z.object({
  type: z.literal('scroll'),
})

export const OptionalScrollConfigSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().optional(),
  selector: z.string().min(1).optional(),
})

export const BrowserScrollActionSchema =
  RequiredBrowserScrollActionSchema.merge(OptionalBrowserConfigSchema)
    .merge(OptionalScrollConfigSchema)
    .merge(FrameTargetSchema)

export const RequiredBrowserScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
})

export const BrowserScreenshotActionSchema =
  RequiredBrowserScreenshotActionSchema.merge(
    OptionalBrowserConfigSchema,
  ).merge(OptionalScreenshotConfigSchema)

export const RequiredBrowserStopActionSchema = z.object({
  type: z.literal('stop'),
})
export const BrowserStopActionSchema = RequiredBrowserStopActionSchema.merge(
  OptionalBrowserConfigSchema,
)

export const RequiredBrowserSnapshotActionSchema = z.object({
  type: z.literal('snapshot'),
})
export const BrowserSnapshotActionSchema =
  RequiredBrowserSnapshotActionSchema.merge(OptionalBrowserConfigSchema).merge(
    FrameTargetSchema,
  )

export const RequiredBrowserEvaluateActionSchema = z.object({
  type: z.literal('evaluate'),
  script: z
    .string()
    .min(1)
    .describe('JavaScript expression or function body to evaluate.'),
})
export const BrowserEvaluateActionSchema =
  RequiredBrowserEvaluateActionSchema.merge(OptionalBrowserConfigSchema).merge(
    FrameTargetSchema,
  )

export const BrowserWaitForActionSchema = z
  .object({
    type: z.literal('wait_for'),
    selector: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    visible: z.boolean().optional(),
    pollInterval: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserUploadActionSchema = z
  .object({
    type: z.literal('upload'),
    selector: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserCookieActionSchema = z
  .object({
    type: z.literal('cookie'),
    operation: z.enum(['get', 'set', 'delete', 'clear']),
    name: z.string().optional(),
    value: z.string().optional(),
    url: z.string().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserStorageActionSchema = z
  .object({
    type: z.literal('storage'),
    storage: z.enum(['local', 'session']),
    operation: z.enum(['get', 'set', 'remove', 'clear']),
    key: z.string().optional(),
    value: z.string().optional(),
  })
  .merge(OptionalBrowserConfigSchema)
  .merge(FrameTargetSchema)

export const BrowserViewportActionSchema = z
  .object({
    type: z.literal('viewport'),
    width: z.number().min(1),
    height: z.number().min(1),
    deviceScaleFactor: z.number().optional(),
    isMobile: z.boolean().optional(),
    hasTouch: z.boolean().optional(),
    userAgent: z.string().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserNetworkActionSchema = z
  .object({
    type: z.literal('network'),
    offline: z.boolean().optional(),
    latency: z.number().optional(),
    downloadThroughput: z.number().optional(),
    uploadThroughput: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserTabActionSchema = z
  .object({
    type: z.literal('tab'),
    operation: z.enum(['list', 'create', 'switch', 'close']),
    targetId: z.string().optional(),
    url: z.string().optional(),
    titleIncludes: z.string().optional(),
    urlIncludes: z.string().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserRecordingActionSchema = z
  .object({
    type: z.literal('recording'),
    operation: z.enum(['start', 'stop']),
    everyNthFrame: z.number().optional(),
    quality: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserPdfActionSchema = z
  .object({
    type: z.literal('pdf'),
    landscape: z.boolean().optional(),
    printBackground: z.boolean().optional(),
    scale: z.number().optional(),
    paperWidth: z.number().optional(),
    paperHeight: z.number().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

export const BrowserPixelDiffActionSchema = z
  .object({
    type: z.literal('pixel_diff'),
    expectedImagePath: z.string().min(1).optional(),
    expectedImageBase64: z.string().min(1).optional(),
    threshold: z.number().min(0).max(1).optional(),
    fullPage: z.boolean().optional(),
  })
  .merge(OptionalBrowserConfigSchema)

// First define the base action schemas without the diagnostic step
const BaseBrowserActionSchema = z.discriminatedUnion('type', [
  BrowserStartActionSchema,
  BrowserNavigateActionSchema,
  BrowserSnapshotActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  BrowserKeyActionSchema,
  BrowserMouseActionSchema,
  BrowserHoverActionSchema,
  BrowserDragActionSchema,
  BrowserSelectActionSchema,
  BrowserScrollActionSchema,
  BrowserScreenshotActionSchema,
  BrowserEvaluateActionSchema,
  BrowserWaitForActionSchema,
  BrowserUploadActionSchema,
  BrowserCookieActionSchema,
  BrowserStorageActionSchema,
  BrowserViewportActionSchema,
  BrowserNetworkActionSchema,
  BrowserTabActionSchema,
  BrowserRecordingActionSchema,
  BrowserPdfActionSchema,
  BrowserPixelDiffActionSchema,
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
  BrowserSnapshotActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  BrowserKeyActionSchema,
  BrowserMouseActionSchema,
  BrowserHoverActionSchema,
  BrowserDragActionSchema,
  BrowserSelectActionSchema,
  BrowserScrollActionSchema,
  BrowserScreenshotActionSchema,
  BrowserEvaluateActionSchema,
  BrowserWaitForActionSchema,
  BrowserUploadActionSchema,
  BrowserCookieActionSchema,
  BrowserStorageActionSchema,
  BrowserViewportActionSchema,
  BrowserNetworkActionSchema,
  BrowserTabActionSchema,
  BrowserRecordingActionSchema,
  BrowserPdfActionSchema,
  BrowserPixelDiffActionSchema,
  BrowserStopActionSchema,
  BrowserDiagnoseActionSchema,
])

const BrowserActionTypeSchema = z.enum([
  'start',
  'navigate',
  'snapshot',
  'click',
  'type',
  'key',
  'mouse',
  'hover',
  'drag',
  'select',
  'scroll',
  'screenshot',
  'evaluate',
  'wait_for',
  'upload',
  'cookie',
  'storage',
  'viewport',
  'network',
  'tab',
  'recording',
  'pdf',
  'pixel_diff',
  'stop',
  'diagnose',
])

const DiagnosticStepInputSchema = z.object({
  label: z.string().optional(),
  action: z.record(z.string(), z.unknown()),
  expectedLogs: z.array(z.string()).optional(),
  noJsErrors: z.boolean().optional(),
  noNetworkErrors: z.boolean().optional(),
  customCondition: z.string().optional(),
})
/**
 * Object-shaped input schema for LLM tool definitions.
 *
 * Some OpenAI-compatible providers require function parameters to have a
 * top-level `{ type: "object" }` JSON Schema. `BrowserActionSchema` is a
 * discriminated union, which Zod serializes as top-level `oneOf`. Keep the
 * discriminated union as the source of truth for runtime validation, but expose
 * this object-shaped schema to providers so browser_logs remains tool-callable.
 */
export const BrowserActionInputSchema = z
  .object({
    type: BrowserActionTypeSchema,
    url: z.string().min(1).optional(),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0']).optional(),
    selector: z.string().min(1).optional(),
    text: z.string().optional(),
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
    maxConsecutiveErrors: z.number().optional(),
    totalErrorThreshold: z.number().optional(),
    frameSelector: z.string().min(1).optional(),
    frameId: z.string().min(1).optional(),
    frameUrl: z.string().min(1).optional(),
    frameName: z.string().min(1).optional(),
    waitForNavigation: z.boolean().optional(),
    button: z.enum(['left', 'right', 'middle']).optional(),
    clickCount: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    visualVerify: z.boolean().optional(),
    visualThreshold: z.number().min(0).max(1).optional(),
    delay: z.number().optional(),
    inputMode: z.enum(['real', 'setValue']).optional(),
    clear: z.boolean().optional(),
    pressEnter: z.boolean().optional(),
    key: z.string().min(1).optional(),
    command: z.enum(['press', 'down', 'up']).optional(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional(),
    event: z.enum(['move', 'down', 'up', 'click']).optional(),
    fromSelector: z.string().min(1).optional(),
    toSelector: z.string().min(1).optional(),
    fromX: z.number().optional(),
    fromY: z.number().optional(),
    toX: z.number().optional(),
    toY: z.number().optional(),
    steps: z.union([z.number(), z.array(DiagnosticStepInputSchema)]).optional(),
    automated: z.boolean().optional(),
    maxSteps: z.number().optional(),
    sessionTimeoutMs: z.number().optional(),
    value: z.string().optional(),
    label: z.string().optional(),
    index: z.number().optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    amount: z.number().optional(),
    fullPage: z.boolean().optional(),
    screenshotCompression: z.enum(['jpeg', 'png']).optional(),
    screenshotCompressionQuality: z.number().optional(),
    compressScreenshotData: z.boolean().optional(),
    visible: z.boolean().optional(),
    pollInterval: z.number().optional(),
    paths: z.array(z.string().min(1)).min(1).optional(),
    operation: z
      .enum([
        'get',
        'set',
        'delete',
        'remove',
        'clear',
        'list',
        'create',
        'switch',
        'close',
        'start',
        'stop',
      ])
      .optional(),
    name: z.string().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
    storage: z.enum(['local', 'session']).optional(),
    width: z.number().min(1).optional(),
    height: z.number().min(1).optional(),
    deviceScaleFactor: z.number().optional(),
    isMobile: z.boolean().optional(),
    hasTouch: z.boolean().optional(),
    userAgent: z.string().optional(),
    offline: z.boolean().optional(),
    latency: z.number().optional(),
    downloadThroughput: z.number().optional(),
    uploadThroughput: z.number().optional(),
    targetId: z.string().optional(),
    titleIncludes: z.string().optional(),
    urlIncludes: z.string().optional(),
    everyNthFrame: z.number().optional(),
    quality: z.number().optional(),
    landscape: z.boolean().optional(),
    printBackground: z.boolean().optional(),
    scale: z.number().optional(),
    paperWidth: z.number().optional(),
    paperHeight: z.number().optional(),
    expectedImagePath: z.string().min(1).optional(),
    expectedImageBase64: z.string().min(1).optional(),
    threshold: z.number().min(0).max(1).optional(),
    script: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const result = BrowserActionSchema.safeParse(value)
    if (result.success) return
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: issue.message,
        path: issue.path,
      })
    }
  })

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
  return `<browser_logs action="${type}" ${attrsString} />`
}

/**
 * Parses XML attributes into a BrowserAction object
 */
export function parseBrowserActionXML(xmlString: string): BrowserAction {
  // Basic XML validation
  if (!xmlString.includes('<browser_logs') || !xmlString.includes('/>')) {
    throw new Error('Invalid browser action XML: missing browser_logs tag')
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
    {} as Record<string, any>,
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
  attributes: Record<string, string>,
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
