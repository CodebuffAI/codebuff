import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useEffect, useState, useRef } from 'react'

// Message interface for type checking
interface Message {
  id: number
  type: 'confirm' | 'error' | 'command'
  text: string
}

interface ClineVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

// Message content - confirmation requests that need interaction
const endlessConfirmations = [
  'Action required: Select component organization',
  'Interaction needed: Choose file structure',
  'User action: Select API approach',
  'Action needed: Verify dependency list',
  'Required: Confirm component hierarchy',
  'File structure confirmation needed',
  'Select configuration option',
  'Choose database access pattern',
  'Select state management approach',
  'Required: Approve code generation',
  'Choose styling format',
  'Configuration needed: Select editor mode',
  'Required: Validate file paths',
]

// Confusing error messages
const confusingErrors = [
  'Context limit reached. Please free up slot 3 to continue.',
  'Unable to analyze file: exceeds 400 line limit.',
  "Command '/suggest' not available in current mode. Try '/plan' first.",
  'Plan requires approval before continuing.',
  'Insufficient context. Please describe project architecture again.',
  'VS Code extension update required to proceed.',
  'Unable to load custom user settings. Please reconfigure.',
]

// Command mode confusion messages
const commandConfusion = [
  'Unknown command. Did you mean /edit, /plan, or /suggest?',
  "Command '/implement' must be preceded by '/plan'.",
  "Use '/context' to provide additional information first.",
  "'/approve' command required before proceeding.",
  "Command '/refactor' not available in current context.",
]

export function ClineVisualization({
  progress,
  complexity,
  isActive = false,
}: ClineVisualizationProps) {
  // Main state to keep track of messages
  const [messages, setMessages] = useState<Message[]>([])

  // Reference to the message container for auto scrolling
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Reference to track if auto scrolling is enabled
  const autoScrollRef = useRef(true)

  // Cursor position and state
  const [cursorPosition, setCursorPosition] = useState({ x: 300, y: 200 })
  const [cursorTarget, setCursorTarget] = useState({ x: 300, y: 200 })
  const [cursorState, setCursorState] = useState<
    'normal' | 'waiting' | 'clicking'
  >('normal')

  // Calculate effective progress based on whether the component is active
  const effectiveProgress = isActive ? progress : 0

  // Calculate frustration level (0-1) for visual effects
  const frustrationLevel = Math.min(1, effectiveProgress / 100)

  // Cursor styling based on frustration
  const cursorColor =
    frustrationLevel <= 0.5
      ? 'rgb(255, 255, 255)'
      : `rgb(255, ${255 - (frustrationLevel - 0.5) * 500}, ${255 - (frustrationLevel - 0.5) * 500})`

  // Scroll to bottom function - will be called whenever messages change
  const scrollToBottom = () => {
    if (autoScrollRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }

  // Enhanced auto-scroll when messages change - multiple attempts for reliability
  useEffect(() => {
    // Immediate scroll attempt
    scrollToBottom()

    // Multiple delayed attempts to ensure scrolling happens after animation/rendering
    const scrollTimeout1 = setTimeout(scrollToBottom, 10)
    const scrollTimeout2 = setTimeout(scrollToBottom, 50)
    const scrollTimeout3 = setTimeout(scrollToBottom, 150)

    return () => {
      clearTimeout(scrollTimeout1)
      clearTimeout(scrollTimeout2)
      clearTimeout(scrollTimeout3)
    }
  }, [messages.length])

  // Reset messages when component becomes inactive or progress resets
  useEffect(() => {
    // Clear messages when the component becomes inactive
    if (!isActive && messages.length > 0) {
      setMessages([])
    }

    // Also reset messages when progress goes back to 0 (animation reset)
    if (effectiveProgress === 0 && messages.length > 0) {
      setMessages([])
    }
  }, [isActive, effectiveProgress, messages.length])

  // Add new messages as progress increases - with faster timing
  useEffect(() => {
    if (!isActive) return

    // Add multiple initial messages immediately for faster feedback
    if (messages.length === 0 && effectiveProgress > 0) {
      // First message appears instantly
      const initialMessages = []

      // Welcome message
      initialMessages.push({
        id: Date.now(),
        type: 'confirm' as const,
        text: 'Welcome to Cline. Please follow the prompts to continue.',
      })

      // Two additional messages for immediate visibility
      const confirmIndex1 = Math.floor(
        Math.random() * endlessConfirmations.length
      )
      initialMessages.push({
        id: Date.now() + 1,
        type: 'confirm' as const,
        text: endlessConfirmations[confirmIndex1],
      })

      const errorIndex = Math.floor(Math.random() * confusingErrors.length)
      initialMessages.push({
        id: Date.now() + 2,
        type: 'error' as const,
        text: confusingErrors[errorIndex],
      })

      // Set all initial messages at once
      setMessages(initialMessages)

      // Force immediate scroll to bottom
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight

          // Double check with timeouts
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight
            }
          }, 50)

          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight
            }
          }, 150)
        }
      })

      // Target the first message's button
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const buttons =
            messagesContainerRef.current.querySelectorAll('.action-button')
          if (buttons.length > 0) {
            const button = buttons[0]
            const rect = button.getBoundingClientRect()
            setCursorTarget({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            })
            setCursorState('waiting')
          }
        }
      }, 50)

      return
    }

    // Function to add a new message
    const addMessage = () => {
      // Only add if active and we have some progress
      if (!isActive) return

      // Determine message type based on progress and randomness
      let messageType: 'confirm' | 'error' | 'command' = 'confirm'
      let messageText = ''

      // Higher chance of errors as frustration increases
      if (frustrationLevel > 0.3 && Math.random() < frustrationLevel * 0.4) {
        messageType = Math.random() > 0.5 ? 'error' : 'command'
      }

      // Select appropriate message text based on type
      if (messageType === 'confirm') {
        const index = Math.floor(Math.random() * endlessConfirmations.length)
        messageText = endlessConfirmations[index]
      } else if (messageType === 'error') {
        const index = Math.floor(Math.random() * confusingErrors.length)
        messageText = confusingErrors[index]
      } else {
        const index = Math.floor(Math.random() * commandConfusion.length)
        messageText = commandConfusion[index]
      }

      // Add the new message to state
      setMessages((prevMessages) => {
        // Limit to maximum 10 messages to prevent overflow and performance issues
        // Keep most recent messages by removing oldest if needed
        const maxMessages = 10
        const messagesToKeep =
          prevMessages.length >= maxMessages
            ? prevMessages.slice(-maxMessages + 1)
            : prevMessages

        const newMessages = [
          ...messagesToKeep,
          {
            id: Date.now(),
            type: messageType,
            text: messageText,
          },
        ]

        // Force scroll after state update using requestAnimationFrame
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight

            // Double-ensure with a small delay
            setTimeout(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop =
                  messagesContainerRef.current.scrollHeight
              }
            }, 10)
          }
        })

        return newMessages
      })

      // After adding a message, move cursor to target the latest message
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const messageElements =
            messagesContainerRef.current.querySelectorAll('.message-item')
          if (messageElements.length > 0) {
            const lastMessage = messageElements[messageElements.length - 1]
            const buttons = lastMessage.querySelectorAll('button')

            if (buttons.length > 0) {
              // Target the confirm button
              const button = buttons[0]
              const rect = button.getBoundingClientRect()
              setCursorTarget({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              })
              setCursorState('waiting')
            }
          }
        }
      }, 50) // Faster cursor targeting
    }

    // Set up interval to add messages periodically - ultra fast interval for demo purposes
    const messageInterval = setInterval(
      addMessage,
      // Ultra fast messages (200-350ms) for better demonstration
      350 - frustrationLevel * 150
    )

    return () => clearInterval(messageInterval)
  }, [isActive, effectiveProgress, frustrationLevel])

  // Handle message click/dismiss
  const handleMessageAction = (messageId: number) => {
    // Remove the clicked message
    setMessages((prevMessages) =>
      prevMessages.filter((message) => message.id !== messageId)
    )

    // Reset cursor state
    setCursorState('normal')

    // Move cursor to a new random position
    setCursorTarget({
      x: 150 + Math.random() * 300,
      y: 150 + Math.random() * 200,
    })
  }

  // Animate cursor movement
  useEffect(() => {
    if (!isActive) return

    let animationFrameId: number

    const animateCursor = () => {
      setCursorPosition((prev) => {
        // Calculate direction to target
        const dx = cursorTarget.x - prev.x
        const dy = cursorTarget.y - prev.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // If we've reached the target
        if (distance < 5) {
          // If we're supposed to click, perform click
          if (cursorState === 'waiting') {
            setCursorState('clicking')

            // Find closest message to click based on position
            if (messagesContainerRef.current) {
              const messageElements =
                messagesContainerRef.current.querySelectorAll('.message-item')

              // Find closest message by checking button positions
              let closestMessage: Element | null = null
              let closestDistance = Infinity

              messageElements.forEach((msg) => {
                const buttons = msg.querySelectorAll('button')
                if (buttons.length > 0) {
                  const button = buttons[0]
                  const rect = button.getBoundingClientRect()
                  const buttonX = rect.left + rect.width / 2
                  const buttonY = rect.top + rect.height / 2

                  const distance = Math.sqrt(
                    Math.pow(buttonX - cursorPosition.x, 2) +
                      Math.pow(buttonY - cursorPosition.y, 2)
                  )

                  if (distance < closestDistance) {
                    closestDistance = distance
                    closestMessage = msg
                  }
                }
              })

              // If we found a close enough message, click its button
              if (closestMessage && closestDistance < 50) {
                const messageId = Number(closestMessage.getAttribute('data-id'))
                if (!isNaN(messageId)) {
                  setTimeout(() => handleMessageAction(messageId), 200)
                }
              } else {
                setCursorState('normal')
              }
            }
          }
          return prev
        }

        // Add slight jitter based on frustration
        const jitterAmount = frustrationLevel * 3
        const jitterX = (Math.random() - 0.5) * jitterAmount
        const jitterY = (Math.random() - 0.5) * jitterAmount

        // Calculate new position with jitter
        const cursorSpeed = 5 + frustrationLevel * 5
        const newX = prev.x + (dx / distance) * cursorSpeed + jitterX
        const newY = prev.y + (dy / distance) * cursorSpeed + jitterY

        return { x: newX, y: newY }
      })

      // Continue animation
      animationFrameId = requestAnimationFrame(animateCursor)
    }

    animationFrameId = requestAnimationFrame(animateCursor)

    return () => cancelAnimationFrame(animationFrameId)
  }, [isActive, cursorTarget, cursorState, frustrationLevel])

  // Message rendering function
  const renderMessage = (message: Message) => {
    switch (message.type) {
      case 'confirm':
        return (
          <div className="bg-zinc-900/80 p-2 rounded border border-zinc-700/70">
            <div className="flex justify-between items-center mb-2">
              <div className="text-white/80 text-xs font-medium flex items-center">
                <span className="text-yellow-400 mr-1.5">⚠️</span>
                Required User Action
              </div>
            </div>
            <div className="text-white/80 text-xs mb-2">{message.text}</div>
            <div className="flex gap-2">
              <button className="action-button px-2 py-1 bg-yellow-700/40 rounded text-white/80 text-[10px]">
                Confirm
              </button>
              <button className="px-2 py-1 bg-black/30 rounded text-white/60 text-[10px]">
                Cancel
              </button>
            </div>
          </div>
        )

      case 'error':
        return (
          <div className="bg-red-900/20 p-2 rounded border border-red-700/40">
            <div className="flex items-start">
              <span className="text-red-500 mr-2">⚠️</span>
              <div>
                <div className="text-white/90 text-sm mb-2 font-medium">
                  Error
                </div>
                <div className="text-white/80 text-xs mb-3">{message.text}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="action-button bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                Dismiss
              </button>
            </div>
          </div>
        )

      case 'command':
        return (
          <div className="bg-yellow-900/20 p-2 rounded border border-yellow-700/40">
            <div className="flex items-start">
              <span className="text-yellow-500 mr-2">⚙️</span>
              <div>
                <div className="text-white/90 text-sm mb-2 font-medium">
                  Command Error
                </div>
                <div className="text-white/80 text-xs mb-3">{message.text}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="action-button bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                Got it
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-yellow-400 mr-2">👶</span>
            Cline
            <span className="ml-2 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10">
              <span className="text-yellow-400">High Maintenance</span>
            </span>
          </h3>
          <p className="text-white/60 mt-1">Requires constant babysitting</p>
        </div>

        {/* VSCode icon and indicator */}
        <div className="bg-black/30 border border-yellow-700/30 rounded px-2 py-1 flex items-center">
          <div className="text-white/60 text-xs font-mono mr-1">
            VS Code Only
          </div>
          <div className="text-blue-500 text-sm">⬚</div>
        </div>
      </div>

      {/* Main interface */}
      <motion.div
        className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative"
        animate={
          frustrationLevel > 0.75
            ? {
                x: [0, -5, 5, -5, 5, 0],
                y: [0, -3, 3, -2, 2, 0],
              }
            : {}
        }
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Animated cursor */}
        {isActive && (
          <motion.div
            className="absolute z-50 pointer-events-none"
            style={{
              left: cursorPosition.x,
              top: cursorPosition.y,
              filter:
                frustrationLevel > 0.5
                  ? `drop-shadow(0 0 ${frustrationLevel * 10}px rgba(255, 0, 0, 0.7))`
                  : 'none',
              transform: `scale(${1 + frustrationLevel * 0.3})`,
            }}
            animate={cursorState === 'clicking' ? { scale: [1, 0.8, 1] } : {}}
            transition={{
              duration: 0.1,
              repeat: cursorState === 'clicking' ? 0 : 0,
              repeatType: 'loop',
            }}
          >
            {/* SVG cursor */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7,2 L17,12 L12,12 L12,20 L10,20 L5,15 L5,10 L7,2 Z"
                fill={cursorColor}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="0.5"
              />
            </svg>
          </motion.div>
        )}

        <div className="flex h-full">
          {/* Left side - file explorer */}
          <div className="w-1/4 border-r border-zinc-800 bg-black/20 text-white/70 text-xs">
            <div className="p-2 border-b border-zinc-800">
              <div className="font-medium mb-1">EXPLORER</div>
              <div className="ml-2">
                <div>src/</div>
                <div className="ml-2">components/</div>
                <div className="ml-4">Button.tsx</div>
                <div className="ml-4">Card.tsx</div>
                <div className="ml-2">utils/</div>
                <div className="ml-4 text-yellow-400">
                  helpers.js (423 lines)
                </div>
                <div className="ml-2">config/</div>
                <div>public/</div>
                <div className="text-yellow-400">.cline-instructions</div>
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col">
            {/* Editor limitation banner */}
            <div className="border-b border-zinc-800 bg-blue-900/30 p-2 text-xs flex justify-between items-center">
              <div className="text-white/90 flex items-center">
                <span className="text-red-400 mr-2">⚠️</span>
                <span className="font-semibold">Editor Limitation:</span>
                <span className="ml-1">
                  Cline only works in VS Code, not in your preferred editor
                </span>
              </div>
              <div className="flex gap-1">
                <button className="px-2 py-0.5 bg-blue-700/50 rounded text-white/80 text-[10px]">
                  Install VS Code
                </button>
              </div>
            </div>

            {/* Messages container with auto-scroll - improved styling */}
            <div
              ref={messagesContainerRef}
              className="flex-1 p-3 overflow-y-auto font-mono text-sm max-h-[400px] min-h-[350px] flex flex-col"
              style={{
                scrollBehavior: 'smooth', // Smooth scrolling
                overflowAnchor: 'auto', // Modern CSS to help with scroll anchoring
              }}
              onScroll={() => {
                // Detect when user manually scrolls
                if (messagesContainerRef.current) {
                  const { scrollTop, scrollHeight, clientHeight } =
                    messagesContainerRef.current
                  // If we're not at the bottom, disable auto-scroll
                  autoScrollRef.current =
                    scrollTop + clientHeight >= scrollHeight - 10
                }
              }}
            >
              {/* Flex spacer to push content to the bottom */}
              <div className="flex-grow"></div>

              {/* Initial command */}
              <div className="mb-4">
                <div className="text-white/50 mb-1 text-xs"># Request</div>
                <div className="text-white/90">
                  Update the profile page to add a new settings section
                </div>
              </div>

              {/* Message list */}
              <div className="space-y-4 mt-auto">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    className="message-item"
                    data-id={message.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {renderMessage(message)}
                  </motion.div>
                ))}

                {/* Auto-scroll marker (invisible) */}
                <div className="h-4"></div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status display */}
      <div className="mt-3 flex justify-center items-center">
        <div className="text-sm text-white/60 flex items-center">
          <span className="text-yellow-400 font-medium mr-1">
            Constant attention required
          </span>
          <span>to complete tasks</span>
        </div>
      </div>
    </div>
  )
}
