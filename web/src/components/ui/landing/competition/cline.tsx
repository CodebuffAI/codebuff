import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useCallback, useState } from 'react'

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

const confusingErrors = [
  'Context limit reached. Please free up slot 3 to continue.',
  'Unable to analyze file: exceeds 400 line limit.',
  "Command '/suggest' not available in current mode. Try '/plan' first.",
  'Plan requires approval before continuing.',
  'Insufficient context. Please describe project architecture again.',
  'VS Code extension update required to proceed.',
  'Unable to load custom user settings. Please reconfigure.',
]

const commandConfusion = [
  'Unknown command. Did you mean /edit, /plan, or /suggest?',
  "Command '/implement' must be preceded by '/plan'.",
  "Use '/context' to provide additional information first.",
  "'/approve' command required before proceeding.",
  "Command '/refactor' not available in current context.",
]

const Message = ({
  message,
  onAction,
}: {
  message: Message
  onAction: (id: number) => void
}) => {
  const handleButtonClick = () => {
    setTimeout(() => onAction(message.id), 200)
  }

  const renderContent = () => {
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
              <button
                className="action-button px-2 py-1 bg-yellow-700/40 rounded text-white/80 text-[10px]"
                onClick={handleButtonClick}
              >
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
              <button
                className="action-button bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80"
                onClick={handleButtonClick}
              >
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
              <button
                className="action-button bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80"
                onClick={handleButtonClick}
              >
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
    <motion.div
      className="message-item"
      data-id={message.id}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {renderContent()}
    </motion.div>
  )
}

export function ClineVisualization({
  progress,
  complexity,
  isActive = false,
}: ClineVisualizationProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const effectiveProgress = isActive ? progress : 0
  const messageCountFrustration = Math.min(1, messages.length / 4)
  const progressFrustration = Math.min(1, effectiveProgress / 100)
  const frustrationLevel = Math.max(
    messageCountFrustration,
    progressFrustration,
  )

  const addMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const maxMessages = 5
      const newMessages = [...current, message]
      return newMessages.slice(-maxMessages)
    })
    setAutoScroll(true)
  }, [])

  const removeMessage = useCallback((id: number) => {
    setMessages((current) => current.filter((m) => m.id !== id))
  }, [])

  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages.length, autoScroll])

  useEffect(() => {
    if (!isActive || effectiveProgress === 0) {
      setMessages([])
    }
  }, [isActive, effectiveProgress])

  useEffect(() => {
    if (!isActive || messages.length > 0) return

    if (effectiveProgress > 0) {
      const addInitialMessage = () => {
        addMessage({
          id: Date.now(),
          type: 'confirm',
          text: 'Welcome to Cline. Please follow the prompts to continue.',
        })
      }

      const addFirstError = () => {
        addMessage({
          id: Date.now(),
          type: 'confirm',
          text: endlessConfirmations[
            Math.floor(Math.random() * endlessConfirmations.length)
          ],
        })
      }

      setTimeout(addInitialMessage, 1000)
      setTimeout(addFirstError, 3000)
    }
  }, [isActive, effectiveProgress, messages.length, addMessage])

  useEffect(() => {
    if (!isActive) return

    const generateMessage = () => {
      if (!isActive || messages.length >= 5) return

      let messageType: 'confirm' | 'error' | 'command' = 'confirm'
      let messageText = ''

      if (frustrationLevel > 0.3) {
        const errorChance = frustrationLevel * 0.4
        if (Math.random() < errorChance) {
          messageType = Math.random() > 0.5 ? 'error' : 'command'
        }
      }

      switch (messageType) {
        case 'confirm':
          messageText =
            endlessConfirmations[
              Math.floor(Math.random() * endlessConfirmations.length)
            ]
          break
        case 'error':
          messageText =
            confusingErrors[Math.floor(Math.random() * confusingErrors.length)]
          break
        case 'command':
          messageText =
            commandConfusion[
              Math.floor(Math.random() * commandConfusion.length)
            ]
          break
      }

      addMessage({
        id: Date.now(),
        type: messageType,
        text: messageText,
      })
    }

    const baseInterval = 2500
    const minInterval = 500
    const interval = Math.max(
      minInterval,
      baseInterval - frustrationLevel * 1500,
    )

    const messageTimer = setInterval(generateMessage, interval)
    return () => clearInterval(messageTimer)
  }, [isActive, frustrationLevel, messages.length, addMessage])

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current
      setAutoScroll(scrollTop + clientHeight >= scrollHeight - 10)
    }
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-yellow-400 mr-2">👶</span>
            Cline
          </h3>
          <p className="text-white/60 mt-1">Requires constant babysitting</p>
        </div>

        <div className="bg-black/30 border border-yellow-700/30 rounded px-2 py-1 flex items-center">
          <div className="text-white/60 text-xs font-mono mr-1">
            VS Code Only
          </div>
          <div className="text-blue-500 text-sm">⬚</div>
        </div>
      </div>

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
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
          repeat: frustrationLevel > 0.75 ? Infinity : 0,
          repeatDelay: 0.5,
        }}
      >
        <div className="flex h-full">
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

          <div className="flex-1 flex flex-col">
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

            <div
              ref={messagesContainerRef}
              className="flex-1 p-3 overflow-y-auto font-mono text-sm max-h-[400px] min-h-[350px] flex flex-col"
              style={{
                scrollBehavior: 'smooth',
                overflowAnchor: 'auto',
              }}
              onScroll={handleScroll}
            >
              <div className="flex-grow" />

              <div className="mb-4">
                <div className="text-white/50 mb-1 text-xs"># Request</div>
                <div className="text-white/90">
                  Update the profile page to add a new settings section
                </div>
              </div>

              <div className="space-y-4 mt-auto">
                <AnimatePresence>
                  {messages.map((message) => (
                    <Message
                      key={message.id}
                      message={message}
                      onAction={removeMessage}
                    />
                  ))}
                </AnimatePresence>
                <div className="h-4" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mt-3 flex items-center">
        <div className="text-sm text-white/60 flex items-start">
          <span className="text-yellow-400 font-medium mr-1">
            Constant attention required
          </span>
        </div>
      </div>
    </div>
  )
}
