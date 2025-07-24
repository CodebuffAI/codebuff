import {
  green,
  yellow,
  cyan,
  magenta,
  bold,
  gray,
  blue,
  italic,
} from 'picocolors'
import { pluralize } from '@codebuff/common/util/string'
import {
  getSubagentData,
  getSubagentFullContent,
  getSubagentFormattedContent,
  getAllSubagentIds,
  getRecentSubagents,
  SubagentData,
} from '../subagent-storage'
import { logger } from '../utils/logger'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import { enterSubagentListBuffer } from './subagent-list'
import wrapAnsi from 'wrap-ansi'
import stringWidth from 'string-width'

/**
 * Wrap a line to fit within terminal width using robust npm packages
 */
function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']

  // Use string-width to check actual display width
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }

  // Use wrap-ansi for robust ANSI-aware wrapping
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

let isInSubagentBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let scrollOffset = 0
let contentLines: string[] = []
let currentAgentId: string | null = null
let lastContentLength = 0

// Chat interface state
let chatMessages: Array<{
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}> = []
let chatInput = ''
let mockStreamingContent = ''
let mockStreamingIndex = 0
let mockStreamingTimer: NodeJS.Timeout | null = null
let eventLoopKeepAlive: NodeJS.Timeout | null = null
let isStreaming = false
let streamingUpdateBuffer: string = ''
let streamingUpdateTimer: NodeJS.Timeout | null = null
let userHasManuallyScrolled = false

export function isInSubagentBufferMode(): boolean {
  return isInSubagentBuffer
}

/**
 * Display a formatted list of subagents with enhanced styling
 */
export function displaySubagentList(agents: SubagentData[]) {
  console.log(bold(cyan('🤖 Available Subagents')))
  console.log(gray(`Found ${pluralize(agents.length, 'subagent')}`))
  console.log()
  if (agents.length === 0) {
    console.log(gray('  (none)'))
  } else {
    agents.forEach((agent) => {
      const status = agent.isActive ? green('●') : gray('○')
      const promptPreview = agent.prompt
        ? gray(agent.prompt)
        : gray('(no prompt)')
      console.log(
        `  ${status} ${bold(agent.agentId)} ${gray(`(${agent.agentType})`)}`
      )
      console.log(`    ${promptPreview}`)
      console.log()
    })
  }
}

export function enterSubagentBuffer(
  rl: any,
  agentId: string,
  onExit: () => void
) {
  if (isInSubagentBuffer) {
    console.log(yellow('Already in subagent buffer mode!'))
    return
  }

  // Validate agent ID exists
  const agentData = getSubagentData(agentId)
  if (!agentData) {
    console.log(yellow(`No subagent found with ID: ${agentId}`))
    const recentSubagents = getRecentSubagents(5)
    displaySubagentList(recentSubagents)
    return
  }

  currentAgentId = agentId

  // Reset scroll state to ensure clean start
  scrollOffset = 0
  contentLines = []
  lastContentLength = 0

  // Reset chat state
  chatMessages = []
  chatInput = ''
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }
  if (streamingUpdateTimer) {
    clearTimeout(streamingUpdateTimer)
    streamingUpdateTimer = null
  }
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1)) // Ensure cursor starts at top-left

  isInSubagentBuffer = true
  needsFullRender = true // Force full render on entry

  // Display subagent content
  updateSubagentContent()

  // Set up key handler for ESC to exit
  setupSubagentKeyHandler(rl, onExit)
}

export function exitSubagentBuffer(rl: any) {
  if (!isInSubagentBuffer) {
    return
  }

  // Reset state
  scrollOffset = 0
  contentLines = []
  currentAgentId = null
  lastContentLength = 0

  // Reset chat state
  chatMessages = []
  chatInput = ''
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }
  if (streamingUpdateTimer) {
    clearTimeout(streamingUpdateTimer)
    streamingUpdateTimer = null
  }
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false

  // Restore all original key handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }

  // Remove resize listener
  process.stdout.removeAllListeners('resize')

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInSubagentBuffer = false
}

function updateSubagentContent() {
  if (!currentAgentId) return

  const agentData = getSubagentData(currentAgentId)
  if (!agentData) return

  const fullContent = getSubagentFormattedContent(currentAgentId)

  // Check if content has changed
  if (fullContent.length === lastContentLength && chatMessages.length === 0) {
    return // No new content and no chat messages
  }
  lastContentLength = fullContent.length

  // Split content into lines and wrap them properly
  const terminalWidth = process.stdout.columns || 80
  const contentBodyLines = fullContent
    ? fullContent.split('\n')
    : ['(no content yet)']

  const wrappedLines: string[] = []

  // Add prompt if exists (but don't duplicate if it's already in the content)
  if (
    agentData.prompt &&
    !fullContent.includes(`Prompt: ${agentData.prompt}`)
  ) {
    const promptLine = bold(gray(`Prompt: ${agentData.prompt}`))
    wrappedLines.push(...wrapLine(promptLine, terminalWidth))
    wrappedLines.push('') // Add spacing after prompt
  }

  // Wrap each content line, preserving empty lines
  for (let i = 0; i < contentBodyLines.length; i++) {
    const line = contentBodyLines[i]
    if (line === '') {
      wrappedLines.push('') // Preserve empty lines
    } else {
      const wrapped = wrapLine(line, terminalWidth)
      wrappedLines.push(...wrapped)
    }
  }

  // Add chat messages to the content if any exist
  if (chatMessages.length > 0) {
    wrappedLines.push('') // Add spacing before chat
    wrappedLines.push(gray('─'.repeat(terminalWidth)))
    wrappedLines.push(bold(cyan('💬 Chat History')))
    wrappedLines.push(gray('─'.repeat(terminalWidth)))
    wrappedLines.push('')

    chatMessages.forEach((msg, index) => {
      const prefix = msg.role === 'user' ? green('You: ') : cyan('Agent: ')
      const content = msg.content || ''

      // Add message separator (except for first message)
      if (index > 0) {
        wrappedLines.push(gray('┄'.repeat(terminalWidth - 4)))
      }

      // Wrap long messages
      const maxWidth = terminalWidth - 10
      if (content.length > maxWidth) {
        const wrapped = wrapLine(content, maxWidth)
        wrappedLines.push(prefix + wrapped[0])
        wrapped.slice(1).forEach((line) => {
          wrappedLines.push('      ' + line) // Indent continuation lines
        })
      } else {
        wrappedLines.push(prefix + content)
      }
    })
  }

  // Ensure we end with an empty line for spacing
  if (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] !== '') {
    wrappedLines.push('')
  }

  contentLines = wrappedLines

  // Only reset scroll when entering a new subagent view (not when chat updates)
  if (chatMessages.length === 0) {
    scrollOffset = 0        }
        renderSubagentContent()
}

function startMockStreaming(userMessage: string) {
  // Mock responses based on user input - longer, more realistic responses
  const responses = [
    `I understand you're asking about "${userMessage}". Let me think through this step by step...

First, I need to analyze the current codebase structure to understand how this relates to the existing implementation. Looking at the patterns I can see, there are several approaches we could take:

1. **Direct Implementation**: We could implement this feature directly in the existing module, which would be the fastest approach but might not be the most maintainable long-term.

2. **Modular Approach**: Alternatively, we could create a new module specifically for this functionality, which would provide better separation of concerns and make the code more testable.

3. **Hybrid Solution**: We could also consider a hybrid approach that leverages existing utilities while adding new functionality where needed.

Based on the current architecture, I'd recommend the modular approach because it aligns with the existing patterns in the codebase and will make future maintenance easier. Here's how we could structure it:

\`\`\`typescript
// New module structure
export interface ${userMessage.replace(/\s+/g, '')}Config {
  enabled: boolean
  options: Record<string, any>
}

export class ${userMessage.replace(/\s+/g, '')}Manager {
  constructor(private config: ${userMessage.replace(/\s+/g, '')}Config) {}
  
  async process(): Promise<void> {
    // Implementation here
  }
}
\`\`\`

This approach provides a clean interface and makes the functionality easily extensible. What do you think about this direction?`,
    `That's an interesting question about "${userMessage}"! Based on the codebase context, I can see several relevant patterns and implementations that we can build upon.

Looking at the current architecture, I notice that the system already has robust handling for similar functionality in other areas. For example, the way the WebSocket communication is structured provides a good foundation for what you're asking about.

Here's my analysis of the current state:

**Existing Strengths:**
- The modular architecture makes it easy to add new features
- The TypeScript types provide good safety guarantees
- The error handling patterns are well-established
- The testing infrastructure is already in place

**Areas for Enhancement:**
- We could improve the performance by implementing caching
- The user experience could be enhanced with better feedback
- Error messages could be more descriptive
- Documentation could be expanded

**Recommended Implementation:**

1. **Phase 1**: Create the core functionality with basic features
2. **Phase 2**: Add advanced options and configuration
3. **Phase 3**: Optimize performance and add monitoring

For the implementation, I'd suggest starting with a simple approach and then iterating. Here's a rough outline:

\`\`\`typescript
// Core implementation
export async function handle${userMessage.replace(/\s+/g, '')}(
  input: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  try {
    // Validate input
    if (!input || typeof input !== 'string') {
      throw new Error('Invalid input provided')
    }
    
    // Process the request
    const result = await processRequest(input, options)
    
    // Return formatted result
    return {
      success: true,
      data: result,
      timestamp: Date.now()
    }
  } catch (error) {
    logger.error('Processing failed:', error)
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    }
  }
}
\`\`\`

This provides a solid foundation that we can build upon. Would you like me to elaborate on any particular aspect?`,
    `Great point about "${userMessage}"! Looking at the current implementation, I notice that we could improve this significantly by leveraging some of the existing patterns in the codebase.

Let me walk you through what I'm seeing and how we can enhance it:

**Current State Analysis:**
The existing code has a solid foundation, but there are several opportunities for improvement. The main areas I've identified are:

1. **Performance Optimization**: The current approach works but could be more efficient
2. **Error Handling**: We can make the error messages more user-friendly
3. **Extensibility**: The design could be more modular to support future enhancements
4. **Testing**: We need better test coverage for edge cases

**Proposed Solution:**

I recommend implementing a layered approach that builds on the existing architecture:

\`\`\`typescript
// Enhanced implementation with better patterns
interface Enhanced${userMessage.replace(/\s+/g, '')}Options {
  timeout?: number
  retries?: number
  caching?: boolean
  validation?: boolean
}

class Enhanced${userMessage.replace(/\s+/g, '')}Processor {
  private cache = new Map<string, any>()
  private metrics = {
    processed: 0,
    errors: 0,
    cacheHits: 0
  }

  constructor(private options: Enhanced${userMessage.replace(/\s+/g, '')}Options = {}) {
    this.options = {
      timeout: 5000,
      retries: 3,
      caching: true,
      validation: true,
      ...options
    }
  }

  async process(input: string): Promise<ProcessingResult> {
    const startTime = performance.now()
    
    try {
      // Check cache first
      if (this.options.caching && this.cache.has(input)) {
        this.metrics.cacheHits++
        return this.cache.get(input)
      }

      // Validate input if enabled
      if (this.options.validation) {
        this.validateInput(input)
      }

      // Process with retry logic
      const result = await this.processWithRetry(input)
      
      // Cache result if enabled
      if (this.options.caching) {
        this.cache.set(input, result)
      }

      this.metrics.processed++
      
      return {
        ...result,
        processingTime: performance.now() - startTime,
        fromCache: false
      }
    } catch (error) {
      this.metrics.errors++
      throw new ProcessingError(
        \`Failed to process: \${error.message}\`,
        { input, error, metrics: this.metrics }
      )
    }
  }

  private async processWithRetry(input: string): Promise<any> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= this.options.retries!; attempt++) {
      try {
        return await this.executeProcessing(input)
      } catch (error) {
        lastError = error as Error
        if (attempt < this.options.retries!) {
          await this.delay(Math.pow(2, attempt) * 100) // Exponential backoff
        }
      }
    }
    
    throw lastError!
  }

  private validateInput(input: string): void {
    if (!input || input.trim().length === 0) {
      throw new ValidationError('Input cannot be empty')
    }
    
    if (input.length > 10000) {
      throw new ValidationError('Input too long (max 10000 characters)')
    }
  }

  getMetrics() {
    return { ...this.metrics }
  }
}
\`\`\`

**Benefits of this approach:**
- Better performance through caching
- Robust error handling with retries
- Comprehensive metrics for monitoring
- Flexible configuration options
- Easy to test and maintain

This implementation follows the existing patterns in the codebase while adding significant improvements. The modular design makes it easy to extend with additional features in the future.

Would you like me to implement any specific part of this solution first?`,
  ]

  const randomResponse = responses[Math.floor(Math.random() * responses.length)]
  mockStreamingContent = randomResponse
  mockStreamingIndex = 0

  // Add assistant message placeholder
  chatMessages.push({
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  })

  isStreaming = true
  streamingUpdateBuffer = ''

  // Keep event loop active during streaming
  eventLoopKeepAlive = setInterval(() => {
    // Empty interval to keep event loop active
  }, 10)

  // Start streaming simulation
  mockStreamingTimer = setInterval(() => {
    if (mockStreamingIndex < mockStreamingContent.length) {
      const currentMessage = chatMessages[chatMessages.length - 1]
      if (currentMessage.role === 'assistant') {
        currentMessage.content += mockStreamingContent[mockStreamingIndex]
        streamingUpdateBuffer += mockStreamingContent[mockStreamingIndex]
        mockStreamingIndex++

        // Buffer updates and render less frequently during streaming
        scheduleStreamingUpdate()
      }
    } else {
      // Streaming complete
      isStreaming = false
      if (mockStreamingTimer) {
        clearInterval(mockStreamingTimer)
        mockStreamingTimer = null
      }
      if (eventLoopKeepAlive) {
        clearInterval(eventLoopKeepAlive)
        eventLoopKeepAlive = null
      }
      if (streamingUpdateTimer) {
        clearTimeout(streamingUpdateTimer)
        streamingUpdateTimer = null
      }

      // Final update with complete content
      updateSubagentContent()

      // Only auto-scroll to bottom if user hasn't manually scrolled away
      if (!userHasManuallyScrolled) {
        scrollToBottom()
      }
    }
  }, 25) // 25ms delay between characters for realistic streaming of longer content
}
function isScrolledToBottom(): boolean {
  const { maxScrollOffset } = getLayoutDimensions()
  // Consider "at bottom" if within 2 lines of the actual bottom
  return scrollOffset >= maxScrollOffset - 2
}

function scrollToBottom() {
  const { maxScrollOffset } = getLayoutDimensions()
  // Set scroll to bottom
  scrollOffset = maxScrollOffset
}

function buildChatInputBuffer(
  terminalWidth: number,
  terminalHeight: number
): string {
  const separatorRow = terminalHeight - 2
  const inputRow = terminalHeight - 1
  const isAtBottom = isScrolledToBottom()

  let inputBuffer = ''

  // Build separator line at fixed position
  inputBuffer += `\x1b[${separatorRow};1H\x1b[K`

  if (isAtBottom) {
    const separatorLine = gray('─'.repeat(terminalWidth))
    inputBuffer += separatorLine
  } else {
    const indicator = ' ↓ messages below ↓ '
    const indicatorWidth = stringWidth(indicator)
    const separatorLength = Math.max(0, terminalWidth - indicatorWidth)
    const leftSeparator = '─'.repeat(Math.floor(separatorLength / 2))
    const rightSeparator = '─'.repeat(Math.ceil(separatorLength / 2))
    const separatorLine =
      gray(leftSeparator) + yellow(indicator) + gray(rightSeparator)
    inputBuffer += separatorLine
  }

  // Build input line at fixed position
  inputBuffer += `\x1b[${inputRow};1H\x1b[K`

  const inputPrefix = yellow('> ')
  const inputPrefixWidth = stringWidth(inputPrefix)
  const maxInputWidth = terminalWidth - inputPrefixWidth

  let displayInput = chatInput
  if (stringWidth(chatInput) > maxInputWidth) {
    while (
      stringWidth(displayInput + '...') > maxInputWidth &&
      displayInput.length > 0
    ) {
      displayInput = displayInput.slice(0, -1)
    }
    displayInput += '...'
  }

  inputBuffer += `${inputPrefix}${displayInput}`

  // Position cursor at end of input
  const cursorCol = inputPrefixWidth + stringWidth(displayInput) + 1
  inputBuffer += `\x1b[${inputRow};${cursorCol}H`

  return inputBuffer
}

// Track what was last rendered to enable selective updates
let lastRenderedContent: string[] = []
let lastScrollOffset = -1
let needsFullRender = true

// Batched rendering system to reduce stdout writes
let renderBuffer: string = ''
let pendingRender: NodeJS.Timeout | null = null
const RENDER_DEBOUNCE_MS = 4 // Minimal debounce for responsive input

function flushRenderBuffer() {
  if (renderBuffer) {
    process.stdout.write(renderBuffer)
    renderBuffer = ''
  }
  pendingRender = null
}

function scheduleRender() {
  if (pendingRender) return
  pendingRender = setTimeout(flushRenderBuffer, RENDER_DEBOUNCE_MS)
}

function addToRenderBuffer(content: string) {
  renderBuffer += content
  scheduleRender()
}

function immediateRender(content: string) {
  if (pendingRender) {
    clearTimeout(pendingRender)
    pendingRender = null
  }
  process.stdout.write(renderBuffer + content)
  renderBuffer = ''
}

function getLayoutDimensions() {
  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const bannerHeight = 4
  const chatInputHeight = 2 // Fixed: separator + input only
  const maxLines = terminalHeight - bannerHeight - chatInputHeight
  const maxScrollOffset = Math.max(0, contentLines.length - maxLines)

  return {
    terminalHeight,
    terminalWidth,
    bannerHeight,
    chatInputHeight,
    maxLines,
    maxScrollOffset,
  }
}

function scheduleStreamingUpdate() {
  if (streamingUpdateTimer) return // Already scheduled

  streamingUpdateTimer = setTimeout(() => {
    streamingUpdateTimer = null

    // Check if user is at bottom before updating content
    const wasAtBottom = isScrolledToBottom()

    // Update content with buffered changes
    updateSubagentContent()

    // Only auto-scroll if user was already at bottom
    if (wasAtBottom) {
      scrollToBottom()
    }

    streamingUpdateBuffer = ''
  }, 100) // Update every 100ms during streaming instead of every character
}

function renderSubagentContent() {
  const layout = getLayoutDimensions()
  const { terminalHeight, terminalWidth, maxLines } = layout
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxLines)

  // Force full render on first load or terminal resize
  if (needsFullRender || terminalWidth !== (process.stdout.columns || 80)) {
    renderFullScreen(layout, visibleLines)
    needsFullRender = false
    lastRenderedContent = [...visibleLines]
    lastScrollOffset = scrollOffset
    return
  }

  // Selective rendering based on what changed
  if (scrollOffset !== lastScrollOffset) {
    renderContentArea(layout, visibleLines)
    lastRenderedContent = [...visibleLines]
    lastScrollOffset = scrollOffset
    // Update chat input to show correct scroll indicator
    renderChatInputOnly()
  } else if (
    JSON.stringify(visibleLines) !== JSON.stringify(lastRenderedContent)
  ) {
    // Content changed (streaming updates)
    renderContentArea(layout, visibleLines)
    lastRenderedContent = [...visibleLines]
  }
}

function renderFullScreen(layout: any, visibleLines: string[]) {
  const { terminalHeight, terminalWidth } = layout

  // Build entire screen in memory first, then write once
  let screenBuffer = ''

  // Clear screen and move cursor to top
  screenBuffer += CLEAR_SCREEN + '\x1b[1;1H'

  // Render banner at fixed position (rows 1-3)
  const bannerText =
    'Type to chat, Enter to send | ↑/↓ to scroll | ESC to go back'
  const bannerTextWidth = stringWidth(bannerText)
  const bannerPadding = Math.max(
    0,
    Math.floor((terminalWidth - bannerTextWidth) / 2)
  )
  const banner =
    ' '.repeat(bannerPadding) + bannerText + ' '.repeat(bannerPadding)
  const bannerLine = cyan('═'.repeat(terminalWidth))

  screenBuffer += '\x1b[1;1H\x1b[K' + bannerLine
  screenBuffer += '\x1b[2;1H\x1b[K' + bold(banner)
  screenBuffer += '\x1b[3;1H\x1b[K' + bannerLine

  // Render content area
  const contentStartRow = 5
  const contentEndRow = terminalHeight - 3

  for (let row = contentStartRow; row <= contentEndRow; row++) {
    const contentIndex = row - contentStartRow
    screenBuffer += `\x1b[${row};1H\x1b[K`

    if (contentIndex < visibleLines.length) {
      screenBuffer += visibleLines[contentIndex]
    }
  }

  // Render chat input
  screenBuffer += buildChatInputBuffer(terminalWidth, terminalHeight)
  screenBuffer += '\x1b[?25h' // Show cursor at final position

  // Single write for entire screen
  immediateRender(screenBuffer)
}

function renderContentArea(layout: any, visibleLines: string[]) {
  const { terminalHeight } = layout
  const contentStartRow = 5
  const contentEndRow = terminalHeight - 3

  // Build content area in buffer, then write once
  let contentBuffer = ''
  for (let row = contentStartRow; row <= contentEndRow; row++) {
    const contentIndex = row - contentStartRow
    contentBuffer += `\x1b[${row};1H\x1b[K`

    if (contentIndex < visibleLines.length) {
      contentBuffer += visibleLines[contentIndex]
    }
  }

  addToRenderBuffer(contentBuffer)
}

function renderChatInputOnly(options: { immediate?: boolean } = {}) {
  const layout = getLayoutDimensions()
  const { terminalHeight, terminalWidth } = layout

  // Build chat input buffer
  const inputBuffer = buildChatInputBuffer(terminalWidth, terminalHeight)

  if (options.immediate) {
    // Immediate render for responsive typing
    immediateRender(inputBuffer + '\x1b[?25h')
  } else {
    // Buffered render for other updates
    addToRenderBuffer(inputBuffer + '\x1b[?25h')
  }
}

function setupSubagentKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Handle terminal resize
  const handleResize = () => {
    // Force full render on resize
    needsFullRender = true
    updateSubagentContent()
  }

  process.stdout.on('resize', handleResize)

  // Note: Mouse wheel support temporarily disabled to prevent escape sequences in chat
  // Users can use arrow keys for scrolling instead

  // Add our custom keypress handler
  process.stdin.on('keypress', (str: string, key: any) => {
    // Filter out mouse events from keypress to prevent them appearing in chat
    if (str && (str.includes('\x1b[<') || /\d+;\d+;\d+[Mm]/.test(str))) {
      return // Ignore mouse events in keypress handler
    }
    if (key && key.name === 'escape') {
      exitSubagentBuffer(rl)
      // Return to subagent list, preserving the current selection
      enterSubagentListBuffer(rl, onExit)
      return
    }

    // Handle Ctrl+C - exit to main screen instead of exiting program
    if (key && key.ctrl && key.name === 'c') {
      exitSubagentBuffer(rl)
      onExit()
      return
    } // Handle chat input (always active)
    if (key && key.name === 'return') {
      // Send message
      if (chatInput.trim()) {
        chatMessages.push({
          role: 'user',
          content: chatInput.trim(),
          timestamp: Date.now(),
        })

        const userMessage = chatInput.trim()
        chatInput = ''

        // Update content to include the new user message
        updateSubagentContent()

        // Re-render the chat input to show it's cleared
        renderChatInputOnly({ immediate: true })

        // Auto-scroll to bottom to show the new message
        scrollToBottom()

        // Start mock streaming response
        setTimeout(() => startMockStreaming(userMessage), 500)
      }
      return
    }

    if (key && key.name === 'backspace') {
      chatInput = chatInput.slice(0, -1)
      renderChatInputOnly({ immediate: true }) // Immediate render for responsive typing
      return
    }

    // Add printable characters to chat input (except when using Ctrl for scrolling)
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && !key.ctrl) {
      chatInput += str
      renderChatInputOnly({ immediate: true }) // Immediate render for responsive typing
      return
    }

    // Handle scrolling (use arrow keys for scrolling)
    const { maxLines, maxScrollOffset } = getLayoutDimensions()

    if (key && key.name === 'up' && !key.ctrl && !key.meta) {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'down' && !key.ctrl && !key.meta) {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        // Reset manual scroll flag if user scrolls back to bottom
        if (newOffset >= maxScrollOffset) {
          userHasManuallyScrolled = false
        } else {
          userHasManuallyScrolled = true
        }
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        // Reset manual scroll flag if user scrolls back to bottom
        if (newOffset >= maxScrollOffset) {
          userHasManuallyScrolled = false
        } else {
          userHasManuallyScrolled = true
        }
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        userHasManuallyScrolled = false // Reset when going to bottom
        renderSubagentContent()
      }
      return
    }

    // For other keys, just ignore them
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    // Force stdin to be readable to ensure keypress events are captured
    process.stdin.resume()
  }

  // Mouse wheel support disabled to prevent escape sequences in chat input
}

/**
 * Update the display if we're currently viewing this agent
 */
export function refreshSubagentDisplay(agentId: string) {
  if (isInSubagentBuffer && currentAgentId === agentId) {
    updateSubagentContent()
  }
}

// Cleanup function to ensure we exit subagent buffer on process termination
export function cleanupSubagentBuffer() {
  if (isInSubagentBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInSubagentBuffer = false
  }

  // Clean up mock streaming timer
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }
  if (streamingUpdateTimer) {
    clearTimeout(streamingUpdateTimer)
    streamingUpdateTimer = null
  }
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false
  if (streamingUpdateTimer) {
    clearTimeout(streamingUpdateTimer)
    streamingUpdateTimer = null
  }

  // Clean up render buffer
  if (pendingRender) {
    clearTimeout(pendingRender)
    pendingRender = null
  }
  renderBuffer = ''
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false

  // Mouse reporting was not enabled

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentBuffer)
process.on('SIGINT', cleanupSubagentBuffer)
process.on('SIGTERM', cleanupSubagentBuffer)
