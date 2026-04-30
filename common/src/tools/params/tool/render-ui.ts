import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'render_ui'
const endsAgentStep = false

const buttonLinkSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:'
      } catch {
        return false
      }
    },
    { message: 'Button links must use http:// or https://' },
  )

const buttonWidgetSchema = z.object({
  type: z
    .literal('button')
    .describe('Widget type. Currently, the only supported widget is button.'),
  text: z
    .string()
    .min(1)
    .max(80)
    .describe('Short button label shown to the user.'),
  link: buttonLinkSchema.describe(
    'The http:// or https:// URL to open when the user clicks the button.',
  ),
  variant: z
    .enum(['primary', 'secondary'])
    .optional()
    .default('primary')
    .describe(
      'Theme-aware color treatment. Use primary for the main action and secondary for lower-emphasis actions.',
    ),
})

export type RenderUIButtonWidget = z.infer<typeof buttonWidgetSchema>

const widgetSchema = z.discriminatedUnion('type', [buttonWidgetSchema])

const inputSchema = z
  .object({
    widget: widgetSchema.describe('The UI widget to render.'),
  })
  .describe(
    'Render a small interactive UI widget in the Codebuff CLI. Currently supports a button that opens a link.',
  )

const outputSchema = z.object({
  message: z.string(),
})

const description = `
Render a small interactive UI widget in the Codebuff CLI.

Currently supported widgets:
- button: renders a clickable button with text and an http(s) link.

Use this when the user should click a clear action, such as opening a generated report, documentation page, checkout page, deployment URL, preview, or dashboard.

Color variants:
- primary: the main action
- secondary: a lower-emphasis action

Keep button text short and action-oriented.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    widget: {
      type: 'button',
      text: 'Open preview',
      link: 'https://example.com/preview',
      variant: 'primary',
    },
  },
  endsAgentStep,
})}
`.trim()

export const renderUIParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(outputSchema),
} satisfies $ToolParams
