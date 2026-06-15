import z from 'zod/v4'

import {
  BrowserActionSchema,
  BrowserResponseSchema,
} from '../../../browser-actions'
import { $getNativeToolCallExampleString } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'browser_logs'
const endsAgentStep = true
const inputSchema = BrowserActionSchema
const description = `
Purpose: Use this tool to inspect and interact with a local browser session in order to visually verify web apps, debug console errors, test functionality, and inspect page state.

IMPORTANT: Assume the user's development server is ALREADY running and active, unless you see logs indicating otherwise. Never start the user's development server for them, unless they ask you to do so.

### Response Analysis

After each action, you'll receive:
1. Success/failure status, current URL, and page title
2. New console logs since the previous browser action
3. Network requests and responses
4. JavaScript errors with stack traces
5. For screenshot actions, a model-visible image media result

Use this data to:
- Verify expected behavior
- Debug issues
- Guide next actions
- Make informed decisions about fixes

### Best Practices

**Workflow**
- Navigate to the user's website using the URL supplied by the user, by a detected dev-server log line, or by the parent agent. Do not assume a fixed localhost port.
- Use \`snapshot\` to inspect text and suggested CSS selectors.
- Use \`screenshot\` to visually inspect layout, styling, spacing, color, and responsive behavior.
- Use \`click\`, \`type\`, \`scroll\`, and \`evaluate\` for manual interaction.
- Check network requests for anomalies

**Debugging Flow**
- Start with minimal reproduction steps
- Collect data at each step
- Analyze results before next action
- Take screenshots to track your changes after each UI change you make

Available actions:
- \`navigate\`: load a URL. Params: \`url\`, optional \`waitUntil\`. Bare live domains such as \`infraformat.com\` are allowed and should resolve as HTTPS; localhost-style dev URLs resolve as HTTP when no scheme is given.
- \`snapshot\`: return page text plus suggested selectors for visible controls and content.
- \`screenshot\`: capture the page and return it as image media. Params: optional \`fullPage\`.
- \`click\`: click an element by CSS selector. Params: \`selector\`.
- \`type\`: fill an input/textarea/select by CSS selector. Params: \`selector\`, \`text\`.
- \`scroll\`: scroll the page. Params: optional \`direction\` ("up"|"down") and \`amount\`.
- \`evaluate\`: run JavaScript in the page. Params: \`script\`.
- \`stop\`: close the browser session.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    type: 'navigate',
    url: 'http://localhost:<detected-port>',
    waitUntil: 'domcontentloaded',
  },
  endsAgentStep,
})}
    `.trim()

export const browserLogsParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('json'),
        value: BrowserResponseSchema,
      }),
      z.object({
        type: z.literal('media'),
        data: z.string(),
        mediaType: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
