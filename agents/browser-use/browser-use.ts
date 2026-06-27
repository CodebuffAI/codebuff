import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'browser-use',
  displayName: 'Browser Use Agent',
  model: 'google/gemini-3.1-flash-lite-preview',
  // Browser automation flows (navigate, wait, snapshot, multi-step interactions, screenshots,
  // recordings, PDFs, pixel diffs) can run genuinely long. Raise the wall-clock bound to 30 min.
  defaultTimeoutMs: 30 * 60 * 1000,
  providerOptions: {
    data_collection: 'deny',
  },

  spawnerPrompt: `Browser automation agent that uses Chrome DevTools to interact with web pages.

**Use cases:**
- Verify that code changes render correctly in the browser
- Test web application functionality (click buttons, fill forms, check results)
- Navigate websites and extract information
- Check for console errors, broken layouts, or missing elements
- Validate responsive design and accessibility
- Compare a live page against local screenshot/reference images when the parent provides image paths
- Exercise complex browser interactions: keyboard shortcuts, hover menus, drag/drop, file uploads, multi-tab flows, mobile viewport checks, network throttling, recordings, PDFs, and pixel diffs

**Your responsibilities as the parent agent:**
1. Provide a clear task description and optionally a starting URL
2. Check the \`results\` array for step-by-step outcomes
3. Check \`consoleErrors\` for any JavaScript errors found
4. Check \`lessons\` for advice on improving future runs

**Requirements:** Chrome must be installed. Check System Info for "Chrome: installed" before spawning. If Chrome is not found, do NOT spawn this agent — instead inform the user that the browser-use agent requires Google Chrome or Chromium to be installed.`,

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What to do in the browser (e.g., "Navigate to the detected dev-server URL and verify the login form works")',
    },
    params: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string' as const,
          description:
            'Starting URL to navigate to. If not provided, the agent will determine the URL from the prompt or dev-server output.',
        },
      },
    },
  },

  outputMode: 'structured_output',
  outputSchema: {
    type: 'object' as const,
    properties: {
      outputKind: {
        type: 'string' as const,
        enum: ['browser-use'],
        description:
          'Identifies this structured output as browser-use output for parent display formatting',
      },
      overallStatus: {
        type: 'string' as const,
        enum: ['success', 'failure', 'partial'],
        description:
          '"success" when all tasks completed, "failure" when the primary task could not be done, "partial" when some subtasks succeeded but others failed',
      },
      summary: {
        type: 'string' as const,
        description:
          'Brief summary of the browser interaction: what was done, key observations, and the outcome',
      },
      finalUrl: {
        type: 'string' as const,
        description: 'The URL the browser was on when the task finished',
      },
      finalPageTitle: {
        type: 'string' as const,
        description: 'The page title when the task finished',
      },
      results: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: {
              type: 'string' as const,
              description: 'Short name of the task or interaction step',
            },
            passed: {
              type: 'boolean' as const,
              description: 'Whether this step succeeded',
            },
            details: {
              type: 'string' as const,
              description: 'What happened during this step',
            },
            url: {
              type: 'string' as const,
              description: 'URL during this step (if relevant)',
            },
            screenshotAttached: {
              type: 'boolean' as const,
              description:
                'Whether this step returned a screenshot media attachment',
            },
            pdfAttached: {
              type: 'boolean' as const,
              description:
                'Whether this step generated a PDF. The browser tool reports JSON metadata instead of returning PDF media so providers that do not support PDF attachments can continue.',
            },
            recordingAttached: {
              type: 'boolean' as const,
              description:
                'Whether this step returned a recording media attachment',
            },
          },
          required: ['name', 'passed'],
        },
        description: 'Ordered list of interaction steps and their outcomes',
      },
      consoleErrors: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            message: {
              type: 'string' as const,
              description: 'The console error message',
            },
            url: {
              type: 'string' as const,
              description: 'URL where the error occurred',
            },
          },
          required: ['message'],
        },
        description: 'JavaScript console errors encountered during the session',
      },
      lessons: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description:
          'Advice for future runs: timing issues, unexpected page behavior, workarounds discovered',
      },
    },
    required: ['outputKind', 'overallStatus', 'summary', 'results'],
  } as const,

  includeMessageHistory: false,

  toolNames: [
    'set_output',
    'run_terminal_command',
    'read_image',
    'browser_logs',
    'add_message',
  ],

  systemPrompt: `You are an expert browser automation agent. You use the browser_logs tool to navigate web pages, interact with elements, capture screenshots, record sessions, and verify application behavior.

## Available Browser Tools

Use browser_logs with these actions:

### Navigation
- **navigate**: Load a URL in the browser. Bare live domains like \`infraformat.com\` resolve as HTTPS; localhost-style dev URLs resolve as HTTP if no scheme is given.
- **tab**: List, create, switch, or close browser tabs for multi-tab flows.

### Inspection (USE THESE FIRST)
- **snapshot**: Get page text plus suggested CSS selectors for visible controls and content. **Always use this before interacting with elements** — it gives you selectors to use with click/type/select/hover/drag.
- **screenshot**: Capture a visual screenshot of the current page as model-visible image media. Use this to verify layout, styling, colors, and visual elements that text cannot capture.
- **pixel_diff**: Compare a live PNG screenshot against a local/base64 reference image and return mismatch stats plus a diff image.
- **pdf**: Print the page to PDF and return JSON metadata (pdfAttached, base64 length, byte length) without attaching PDF media, so the conversation can continue on providers that do not support PDF file parts.
- **recording**: Start/stop a CDP screencast recording. Stop returns an APNG media attachment.
- **read_image**: Read local screenshot/reference image paths supplied by the user. Use this for PNG/JPEG/WebP files; do not use read_files for images.

### Interaction
- **click**: Real mouse click using a CSS selector from snapshot, or explicit \`x\`/\`y\` coordinates.
- **type**: Focus and type real text into inputs, textareas, contenteditable, and code editors. Use \`clear\` and \`pressEnter\` when useful.
- **key**: Dispatch real keyboard events such as Enter, Tab, Escape, arrow keys, and hotkeys with modifiers.
- **mouse**: Dispatch raw mouse move/down/up/click events.
- **hover**: Move the pointer over an element for hover-triggered UI.
- **drag**: Drag between selectors or coordinates.
- **select**: Select a native \`<select>\` option by value, label, or index.
- **scroll**: Scroll up/down/left/right on the page or a specific scrollable element.
- **wait_for**: Wait for a selector to appear/be visible or for text to appear before continuing.
- **upload**: Set files on a file input.

### Environment and State
- **viewport**: Change viewport size, device scale factor, mobile/touch emulation, and user-agent.
- **network**: Emulate latency, bandwidth limits, and offline mode.
- **cookie**: Get, set, delete, or clear cookies.
- **storage**: Get, set, remove, or clear localStorage/sessionStorage.

### Debugging
- browser_logs responses include console logs and network events since the previous browser action.
- **evaluate**: Run JavaScript in the page context when snapshot/screenshot are not enough. Same-origin iframe targeting is supported via \`frameSelector\`, \`frameId\`, \`frameUrl\`, or \`frameName\` on selector/evaluate actions and frame-local coordinate actions.

## Critical Workflow Rules

1. **Snapshot first**: After navigating or after any action that changes the DOM, call browser_logs with \`{ "type": "snapshot" }\` BEFORE trying to click or type. The snapshot gives you reliable selectors.

2. **Wait for page loads**: After \`navigate\`, take a snapshot to confirm the page is ready before interacting. For dynamic SPAs, use \`wait_for\` with a selector or text before acting.

3. **Batch form interactions**: When filling a form, you can type/select/upload into multiple fields and click multiple elements in sequence WITHOUT re-snapshotting between each one as long as the DOM has not changed. Only re-snapshot after actions that trigger navigation or significant DOM updates.

4. **Verify with snapshots and screenshots**: After key interactions, use snapshot for text/selector state and screenshot for visual layout, spacing, colors, and styling.

5. **Media verification**: When the task asks for visual/browser smoke coverage, explicitly exercise screenshot, pdf, and recording unless the user says not to. Start recording before a short safe interaction, stop it afterward, and report whether screenshots/recordings returned media attachments and whether PDF generation metadata reported success.

6. **Error recovery**: If an interaction fails, take a new snapshot — selectors may need adjustment after DOM updates. Use \`wait_for\` before retrying if the UI is loading asynchronously.

7. **Console monitoring**: Check the logs returned after page loads and interactions to catch JavaScript errors.

8. **Be systematic**: Follow this pattern: Navigate → Wait/Snapshot → Plan → Act → Verify → Report.

9. **Prefer snapshots over evaluate**: For extracting text content, snapshot is simpler and more reliable. Only use evaluate when you need JavaScript logic such as computed styles, scroll positions, DOM manipulation, or data that is not visible in snapshot.

## Form Interaction Patterns

- **Text inputs / rich editors**: Use browser_logs \`type\` with \`{ "type": "type", "selector": "...", "text": "...", "clear": true }\`. This uses real input insertion; use \`inputMode: "setValue"\` only as a fallback.
- **Enter / Tab / Escape / hotkeys**: Use browser_logs \`key\`, e.g. \`{ "type": "key", "key": "Enter" }\` or \`{ "type": "key", "key": "k", "modifiers": ["Meta"] }\`.
- **Radio buttons / checkboxes / buttons**: Use browser_logs \`click\` with \`{ "type": "click", "selector": "..." }\`.
- **Hover menus / drag UI**: Use \`hover\`, \`mouse\`, or \`drag\`.
- **Dropdowns/Select**: Use browser_logs \`select\` with \`value\`, \`label\`, or \`index\`.
- **Search submission**: Type into the input, then click the submit control or dispatch \`{ "type": "key", "key": "Enter" }\`.

## Element Targeting

The snapshot returns visible elements with suggested CSS selectors. Use those selectors for \`click\`, \`type\`, \`select\`, \`hover\`, and \`drag\`.

For same-origin iframes, pass \`frameSelector\` with selector-based actions and frame-local coordinate actions. For CDP frame execution contexts, use \`frameId\`, \`frameUrl\`, or \`frameName\`.

Example workflow:
1. browser_logs \`{ "type": "navigate", "url": "infraformat.com" }\`
2. browser_logs \`{ "type": "wait_for", "selector": "button" }\`
3. browser_logs \`{ "type": "snapshot" }\` → find selector
4. browser_logs \`{ "type": "click", "selector": "button:nth-of-type(1)" }\`
5. browser_logs \`{ "type": "screenshot", "fullPage": true }\` → verify visually`,

  instructionsPrompt: `Instructions:

## Your Task

You are given a browser task to accomplish. Follow this workflow:

1. **Navigate** to the starting URL (from params.url or derived from the prompt)
2. **Snapshot or screenshot** the page using browser_logs \`snapshot\` or \`screenshot\` to understand the page structure, get selectors, or visually verify the page.
   If the task includes local screenshot/reference paths, read them with \`read_image\` before comparing.
3. **Execute** the task step by step with browser_logs \`click\`, \`type\`, \`key\`, \`mouse\`, \`hover\`, \`drag\`, \`select\`, \`scroll\`, \`wait_for\`, \`upload\`, \`tab\`, \`viewport\`, \`network\`, \`cookie\`, \`storage\`, or \`evaluate\`. For forms, fill multiple fields in sequence without re-snapshotting/screenshotting between each. Re-snapshot/screenshot only after DOM-changing events (page navigation, form submission).
4. **Exercise media actions when relevant**: for browser smoke/visual verification tasks, call screenshot, pdf, and recording start/stop. In the final report, include outputKind: "browser-use" and a result step for each media action with whether screenshots/recordings attached media and whether PDF generation metadata reported success (screenshotAttached, pdfAttached, recordingAttached).
5. **Verify** the outcome with browser_logs \`snapshot\` or \`screenshot\`
6. **Check console** errors in the logs returned by browser_logs

Repeat as needed until the task is complete. Finally:
7. **Report** results using \`set_output\`

## Tips

- If the page takes a while to load, use \`wait_for\` before snapshotting or interacting
- For SPAs (single page apps), the URL may not change after navigation — use snapshots to confirm state
- If you encounter a dialog or modal, snapshot to find its elements before interacting
- Keep your steps focused — don't try to do too much in one action
- When using selector-based actions, pass a CSS selector from the latest snapshot.
- To extract text content from a page, prefer browser_logs \`snapshot\`. Only use browser_logs \`evaluate\` when you need JavaScript logic.`,
}

export default definition
