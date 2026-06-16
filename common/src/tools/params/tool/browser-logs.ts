import z from 'zod/v4'

import {
  BrowserActionInputSchema,
  BrowserResponseSchema,
} from '../../../browser-actions'
import { $getNativeToolCallExampleString } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'browser_logs'
const endsAgentStep = true
const inputSchema = BrowserActionInputSchema
const description = `
Purpose: Use this tool to inspect and interact with a local browser session in order to visually verify web apps, debug console errors, test functionality, and inspect page state.

IMPORTANT: Assume the user's development server is ALREADY running and active, unless you see logs indicating otherwise. Never start the user's development server for them, unless they ask you to do so.

### Response Analysis

After each action, you'll receive:
1. Success/failure status, current URL, and page title
2. New console logs since the previous browser action
3. Network requests and responses
4. JavaScript errors with stack traces
5. For screenshot, recording, PDF, and pixel-diff actions, a model-visible media result when applicable

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
- Use \`click\`, \`type\`, \`key\`, \`mouse\`, \`hover\`, \`drag\`, \`select\`, \`scroll\`, \`wait_for\`, \`upload\`, \`tab\`, \`viewport\`, \`network\`, \`cookie\`, \`storage\`, and \`evaluate\` for manual interaction and environment control.
- Check network requests for anomalies

**Debugging Flow**
- Start with minimal reproduction steps
- Collect data at each step
- Analyze results before next action
- Take screenshots to track your changes after each UI change you make

Available actions:
- \`navigate\`: load a URL. Params: \`url\`, optional \`waitUntil\`. Bare live domains such as \`infraformat.com\` are allowed and should resolve as HTTPS; localhost-style dev URLs resolve as HTTP when no scheme is given.
- \`snapshot\`: return page text plus suggested selectors for visible controls and content. Supports same-origin iframe targeting via \`frameSelector\`, \`frameId\`, \`frameUrl\`, or \`frameName\`.
- \`screenshot\`: capture the page and return it as image media. Params: optional \`fullPage\`, \`screenshotCompression\`.
- \`click\`: real mouse click using Chrome \`Input.dispatchMouseEvent\`. Params: \`selector\` or \`x\`/\`y\`, optional \`button\`, \`clickCount\`, iframe targeting.
- \`type\`: focus and type real text with \`Input.insertText\`; use \`inputMode: "setValue"\` for legacy value assignment. Params: \`selector\`, \`text\`, optional \`clear\`, \`pressEnter\`, iframe targeting.
- \`key\`: dispatch real keyboard events. Params: \`key\`, optional \`text\`, \`command\` ("press"|"down"|"up"), \`modifiers\`.
- \`mouse\`: dispatch raw mouse move/down/up/click. Params: \`event\`, \`selector\` or \`x\`/\`y\`.
- \`hover\`: move the mouse to an element for hover-triggered UI. Params: \`selector\`.
- \`drag\`: drag between selectors or coordinates. Params: \`fromSelector\`/\`toSelector\` or \`fromX\`/\`fromY\`/\`toX\`/\`toY\`.
- \`select\`: choose an option in a native \`<select>\`. Params: \`selector\` plus \`value\`, \`label\`, or \`index\`.
- \`scroll\`: scroll the page or element. Params: optional \`direction\` ("up"|"down"|"left"|"right"), \`amount\`, \`selector\`, iframe targeting.
- \`wait_for\`: wait until a selector is present/visible or text appears. Params: \`selector\`, \`text\`, optional \`visible\`, \`timeout\`.
- \`upload\`: set files on a file input. Params: \`selector\`, \`paths\`.
- \`cookie\`: get/set/delete/clear browser cookies. Params: \`operation\`, plus cookie fields for set/delete.
- \`storage\`: get/set/remove/clear localStorage or sessionStorage. Params: \`storage\`, \`operation\`, optional \`key\`, \`value\`.
- \`viewport\`: set viewport/device metrics, touch, and optional user-agent.
- \`network\`: emulate latency, throughput, or offline mode.
- \`tab\`: list/create/switch/close tabs. Params: \`operation\`, optional \`targetId\`, \`url\`, \`titleIncludes\`, \`urlIncludes\`.
- \`recording\`: start/stop CDP screencast recording; stop returns an APNG media attachment.
- \`pdf\`: render the page to PDF with \`Page.printToPDF\`.
- \`pixel_diff\`: capture a PNG screenshot and compare against \`expectedImagePath\` or \`expectedImageBase64\`; returns mismatch stats and a diff PNG.
- \`evaluate\`: run JavaScript in the page or a targeted same-origin iframe. Params: \`script\`.
- \`diagnose\`: run a sequence of browser actions and collect their responses.
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
