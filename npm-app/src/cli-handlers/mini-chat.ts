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
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import wrapAnsi from 'wrap-ansi'
import stringWidth from 'string-width'

interface ChatMessage {
  role: 'assistant' | 'user'
  content: string
  timestamp: number
}

interface ChatStep {
  question: string
  field: string
  placeholder: string
  defaultValue?: string
}

interface ChatConfig {
  title: string
  steps: ChatStep[]
  onComplete: (responses: Record<string, string>) => void
}

let isInMiniChat = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let chatMessages: ChatMessage[] = []
let currentInput = ''
let scrollOffset = 0
let contentLines: string[] = []
let currentStep = 0
let responses: Record<string, string> = {}
let chatConfig: ChatConfig | null = null

function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']
  
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }
  
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

function addMessage(role: 'assistant' | 'user', content: string) {
  chatMessages.push({
    role,
    content,
    timestamp: Date.now()
  })
  updateContentLines()
  renderChat()
}

function updateContentLines() {
  const terminalWidth = process.stdout.columns || 80
  const lines: string[] = []
  
  // Add title
  lines.push(bold(cyan(chatConfig?.title || '🤖 Chat Assistant')))
  lines.push('')
  
  // Add chat messages
  chatMessages.forEach((message, index) => {
    const prefix = message.role === 'assistant' ? 
      bold(blue('Assistant: ')) : 
      bold(green('You: '))
    
    const contentLines = message.content.split('\n')
    contentLines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        const fullLine = prefix + line
        lines.push(...wrapLine(fullLine, terminalWidth))
      } else {
        const indentedLine = ' '.repeat(11) + line // Match "Assistant: " length
        lines.push(...wrapLine(indentedLine, terminalWidth))
      }
    })
    
    if (index < chatMessages.length - 1) {
      lines.push('') // Add spacing between messages
    }
  })
  
  contentLines = lines
}

function renderChat() {
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1))
  
  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const inputAreaHeight = 4 // Space for input area
  const maxContentLines = terminalHeight - inputAreaHeight
  
  // Auto-scroll to bottom unless user has manually scrolled
  const totalLines = contentLines.length
  if (scrollOffset === 0 || scrollOffset >= totalLines - maxContentLines) {
    scrollOffset = Math.max(0, totalLines - maxContentLines)
  }
  
  // Display content
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxContentLines)
  process.stdout.write(visibleLines.join('\n'))
  
  // Fill remaining space
  const remainingLines = maxContentLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }
  
  // Display input area
  process.stdout.write('\n' + gray('─'.repeat(terminalWidth)))
  
  const currentStepInfo = chatConfig?.steps[currentStep]
  if (currentStepInfo) {
    const placeholder = gray(`(${currentStepInfo.placeholder})`)
    process.stdout.write(`\n${bold('Your response:')} ${currentInput}${currentInput ? '' : placeholder}`)
  } else {
    process.stdout.write(`\n${gray('Press Enter to create your agent...')}`)
  }
  
  process.stdout.write(`\n${gray('ESC to cancel, Ctrl+C to exit')}`)
}

function processUserInput(input: string) {
  if (!chatConfig || currentStep >= chatConfig.steps.length) {
    return
  }
  
  const step = chatConfig.steps[currentStep]
  const trimmedInput = input.trim()
  
  // Add user message
  addMessage('user', trimmedInput || '(default)')
  
  // Store the response
  if (!trimmedInput && step.defaultValue) {
    responses[step.field] = step.defaultValue
  } else {
    responses[step.field] = trimmedInput
  }
  
  currentStep++
  
  // Move to next question or complete
  if (chatConfig && currentStep < chatConfig.steps.length) {
    setTimeout(() => {
      if (chatConfig) {
        addMessage('assistant', chatConfig.steps[currentStep].question)
      }
    }, 500)
  } else {
    // All questions answered
    setTimeout(() => {
      addMessage('assistant', 'Perfect! I have everything I need. Processing your responses...')
      setTimeout(() => {
        exitMiniChat()
        if (chatConfig?.onComplete) {
          chatConfig.onComplete(responses)
        }
      }, 1000)
    }, 500)
  }
}

function setupKeyHandler(rl: any, onExit: () => void) {
  // Store original handlers
  const listeners = process.stdin.listeners('keypress')
  
  
  const currentStepInfo = chatConfig?.steps[currentStep]
    process.stdout.write(`\n${gray('Press Enter to continue...')}`)
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]
  // Remove existing handlers
  process.stdin.removeAllListeners('keypress')
  // Add our handler
  process.stdin.on('keypress', (str: string, key: any) => {
    if (key && key.name === 'escape') {
      exitMiniChat()
      onExit()
      return
    }
    
    if (key && key.ctrl && key.name === 'c') {
      exitMiniChat()
      onExit()
      return
    }
    
    if (key && key.name === 'return') {
      processUserInput(currentInput)
      currentInput = ''
      renderChat()
      return
    }
    
    if (key && key.name === 'backspace') {
      currentInput = currentInput.slice(0, -1)
      renderChat()
      return
    }
    
    // Handle scrolling
    if (key && key.name === 'up' && key.ctrl) {
      scrollOffset = Math.max(0, scrollOffset - 1)
      renderChat()
      return
    }
    
    if (key && key.name === 'down' && key.ctrl) {
      const terminalHeight = process.stdout.rows || 24
      const maxContentLines = terminalHeight - 4
      const maxScrollOffset = Math.max(0, contentLines.length - maxContentLines)
      scrollOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      renderChat()
      return
    }
    
    // Add printable characters
    if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
      currentInput += str
      renderChat()
    }
  })
  
  // Enable raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
  }
}

export function enterMiniChat(
  rl: any,
  onExit: () => void,
  config: ChatConfig
) {
  if (isInMiniChat) {
    console.log(yellow('Already in mini-chat mode!'))
    return
  }
  
  // Reset state
  chatMessages = []
  currentInput = ''
  scrollOffset = 0
  currentStep = 0
  responses = {}
  chatConfig = config
  
  // Enter alternate screen
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(HIDE_CURSOR)
  
  isInMiniChat = true
  
  // Start conversation
  if (config.steps.length > 0) {
    addMessage('assistant', config.steps[0].question)
  }
  
  // Setup input handling
  setupKeyHandler(rl, onExit)
}

export function exitMiniChat() {
  if (!isInMiniChat) {
    return
  }
  
  // Restore handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }
  
  // Exit alternate screen
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)
  
  isInMiniChat = false
  chatConfig = null
}

export function isInMiniChatMode(): boolean {
  return isInMiniChat
}



// Cleanup function
export function cleanupMiniChat() {
  if (isInMiniChat) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInMiniChat = false
  }
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup
process.on('exit', cleanupMiniChat)
process.on('SIGINT', cleanupMiniChat)
process.on('SIGTERM', cleanupMiniChat)