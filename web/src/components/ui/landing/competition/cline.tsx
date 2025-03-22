import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useEffect, useState, useRef } from 'react'

// Add type definition at the top
type DialogType = {
  id: number
  type: 'confirm' | 'error' | 'command'
  index: number
  position: { x: number; y: number }
}

interface ClineVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

// Visual representation of the babysitting required - a growing list of required custom instructions
const customInstructions = [
  'Instructions for file editing (required)',
  'Path to project root (required)',
  'Preferred coding style (required)',
  'Key components overview (required)',
  'Architecture description (required)',
  'Database schema (required)',
  'API endpoints (required)',
  'Testing strategy (required)',
  'Deployment process (required)',
  'Project history (recommended)',
  'Known limitations (recommended)',
  'Dependencies and versions (recommended)',
  'Performance considerations (recommended)',
  'Security guidelines (recommended)',
  'Third-party integrations (recommended)',
  'Code conventions (recommended)',
  'Team members (recommended)',
  'Legacy code mappings (recommended)',
  'Documentation approach (recommended)',
  'Release process (recommended)',
]

// Dialog prompts that require constant user interaction
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
  'Select authentication method',
  'Choose component pattern',
  'Action needed: Verify project structure',
  'Required: Select file format',
  'Configure token access rules',
  'Select import strategy',
  'Choose build configuration',
]

// Confusing error messages that impede progress
const confusingErrors = [
  'Context limit reached. Please free up slot 3 to continue.',
  'Unable to analyze file: exceeds 400 line limit.',
  "Command '/suggest' not available in current mode. Try '/plan' first.",
  'Plan requires approval before continuing.',
  'Insufficient context. Please describe project architecture again.',
  'VS Code extension update required to proceed.',
  'Unable to load custom user settings. Please reconfigure.',
  'Memory allocation exceeded. Please simplify request.',
  'Slot system full (4/4). Remove a context to continue.',
  'Unable to process. Please use smaller code segments.',
  'File parsing failed. Please check formatting.',
  'Limited token budget remaining. Consider freeing memory.',
  'Command stuck in THINKING mode. Please restart VS Code.',
  'File structure analysis failed. Provide manual mapping.',
  'Too many contexts loaded. Remove slots 2-4 to continue.',
]

// Command mode confusion messages
const commandConfusion = [
  'Unknown command. Did you mean /edit, /plan, or /suggest?',
  "Command '/implement' must be preceded by '/plan'.",
  "Use '/context' to provide additional information first.",
  "'/approve' command required before proceeding.",
  "Command '/refactor' not available in current context.",
  "Did you mean to use '/slot save' instead?",
  "Please use '/help commands' to see available options.",
  'Command unavailable. Mode: ANALYSIS_PENDING',
  "Must use '/mode edit' before using edit commands.",
  "Command '/generate' requires plan approval first.",
  "Use '/save' to commit changes before continuing.",
]

export function ClineVisualization({
  progress,
  complexity,
  isActive = false,
}: ClineVisualizationProps) {
  const errorDelay = 10 // Show VSCode error sooner
  const largeFileDelay = 20 // Show large file error next
  const instructionsDelay = 35 // Show instructions babysitting next
  const summaryDelay = 60 // Show summary at the end

  // State for custom instructions panel open/closed
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [checkedItems, setCheckedItems] = useState<number[]>([])

  // For typing effect
  const [planningStep, setPlanningStep] = useState(0)
  const planSteps = [
    'PLAN: Analyze file structure',
    'PLAN: Check for large files',
    'PLAN: Determine dependencies',
    'PLAN: Read custom instructions',
    'PLAN: Configure environment',
    'PLAN: Validate inputs',
    'PLAN: Examine context boundaries',
    'PLAN: Verify slot availability',
    'PLAN: Prepare action sequence',
    'PLAN: Request user approval',
  ]

  // State for current confirmation dialog
  const [currentConfirmationIndex, setCurrentConfirmationIndex] = useState(0)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmationHistory, setConfirmationHistory] = useState<number[]>([])
  const [showError, setShowError] = useState(false)
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0)

  // State for command mode errors
  const [showCommandError, setShowCommandError] = useState(false)
  const [currentCommandErrorIndex, setCurrentCommandErrorIndex] = useState(0)

  // State for the animated cursor
  const [cursorPosition, setCursorPosition] = useState({ x: 300, y: 200 })
  const [cursorTarget, setCursorTarget] = useState({ x: 300, y: 200 })
  const [cursorState, setCursorState] = useState<
    'normal' | 'waiting' | 'clicking' | 'rageClick'
  >('normal')
  const [clickCount, setClickCount] = useState(0)

  // Adding multiple dialog frustration
  const [multipleDialogs, setMultipleDialogs] = useState<DialogType[]>([])

  // State for visual frustration effects
  const [screenShake, setScreenShake] = useState(false)
  const [rageMode, setRageMode] = useState(false)

  // References
  const customInstructionsRef = useRef<HTMLDivElement>(null)
  const confirmationCountRef = useRef(0)
  const errorCountRef = useRef(0)
  const commandErrorCountRef = useRef(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const dialogsContainerRef = useRef<HTMLDivElement>(null)
  const vscodeContainerRef = useRef<HTMLDivElement>(null)
  const lastTargetChangeRef = useRef(Date.now())

  // Calculate effective progress based on whether the component is active
  const effectiveProgress = isActive ? progress : 0

  // Calculate frustration level (0-1) for visual effects
  const frustrationLevel = Math.min(1, effectiveProgress / 100)

  // Calculate cursor color based on frustration - more gradual reddening
  const cursorColor =
    frustrationLevel <= 0.3
      ? 'rgb(255, 255, 255)' // Stay white longer
      : frustrationLevel <= 0.5
        ? `rgb(255, ${255 - (frustrationLevel - 0.3) * 500}, ${255 - (frustrationLevel - 0.3) * 500})` // Start turning pink
        : frustrationLevel <= 0.7
          ? `rgb(255, ${130 - (frustrationLevel - 0.5) * 300}, ${130 - (frustrationLevel - 0.5) * 300})` // Getting redder
          : frustrationLevel <= 0.9
            ? `rgb(255, ${50 - (frustrationLevel - 0.7) * 100}, ${40 - (frustrationLevel - 0.7) * 100})` // Almost full red
            : `rgb(255, 0, 0)` // Pure red only at very end

  // Calculate glow effect based on frustration - more gradual like the color
  const cursorGlow =
    frustrationLevel <= 0.4
      ? 'none' // No glow for first 40%
      : frustrationLevel <= 0.6
        ? `drop-shadow(0 0 ${(frustrationLevel - 0.4) * 20}px rgba(255, 100, 100, 0.6))` // Subtle glow starts
        : frustrationLevel <= 0.8
          ? `drop-shadow(0 0 ${(frustrationLevel - 0.5) * 15}px rgba(255, 50, 50, 0.8))` // Medium glow
          : `drop-shadow(0 0 ${(frustrationLevel - 0.7) * 25}px rgba(255, 0, 0, 0.9))` // Strong glow at the end

  // Calculate cursor movement parameters based on frustration - more realistic but still showing frustration
  const cursorSpeed = 5 + frustrationLevel * 8 // Faster movement with frustration but not unrealistically fast
  const jitterAmount = frustrationLevel * 6 // Jitter increases with frustration, but still realistic
  const wrongDirectionChance =
    frustrationLevel > 0.7 ? 0.15 : frustrationLevel > 0.5 ? 0.08 : 0.02 // Occasional wrong direction

  // Auto-trigger rage mode at extreme frustration
  useEffect(() => {
    if (frustrationLevel > 0.75) {
      if (!rageMode) {
        setRageMode(true)
      }

      // Screen shake effect
      const shakeInterval = setInterval(() => {
        if (Math.random() > 0.7) {
          setScreenShake(true)
          setTimeout(() => setScreenShake(false), 300)
        }
      }, 2000)

      return () => clearInterval(shakeInterval)
    } else {
      setRageMode(false)
    }
  }, [frustrationLevel, rageMode])

  // Auto-open instructions panel
  useEffect(() => {
    if (effectiveProgress > instructionsDelay && !instructionsOpen) {
      setInstructionsOpen(true)
    }
  }, [effectiveProgress, instructionsOpen])

  // Typing effect for the plan steps
  useEffect(() => {
    if (!isActive || effectiveProgress < instructionsDelay) return

    const typingInterval = setInterval(() => {
      setPlanningStep((prev) => {
        if (prev >= planSteps.length - 1) {
          clearInterval(typingInterval)
          return prev
        }
        return prev + 1
      })
    }, 1200)

    return () => clearInterval(typingInterval)
  }, [effectiveProgress, isActive])

  // Add more checked items as progress increases
  useEffect(() => {
    if (!isActive || effectiveProgress < instructionsDelay) return

    const checkingInterval = setInterval(() => {
      setCheckedItems((prev) => {
        const nextIndex = prev.length
        if (nextIndex >= customInstructions.length) {
          clearInterval(checkingInterval)
          return prev
        }
        return [...prev, nextIndex]
      })
    }, 800) // Faster checking to show more items

    return () => clearInterval(checkingInterval)
  }, [effectiveProgress, isActive])

  // Auto-scroll the instructions panel as more items are checked
  useEffect(() => {
    if (customInstructionsRef.current && checkedItems.length > 0) {
      customInstructionsRef.current.scrollTop =
        customInstructionsRef.current.scrollHeight
    }
  }, [checkedItems])

  // Track confirmations that will appear directly in editor
  const [editorConfirmations, setEditorConfirmations] = useState<
    { id: number; text: string; timestamp: number }[]
  >([])

  // Show confirmation dialogs as progress increases - now in editor section
  useEffect(() => {
    if (!isActive || effectiveProgress < 15) return

    // Periodically show confirmation dialogs
    const confirmationInterval = setInterval(
      () => {
        // Calculate chances based on frustration level
        const dialogChance = 0.7 + frustrationLevel * 0.2 // 70-90% chance based on frustration
        const multiDialogChance =
          frustrationLevel > 0.4
            ? frustrationLevel * 0.7
            : frustrationLevel * 0.2 // Higher chance for multiple dialogs

        if (Math.random() < dialogChance) {
          // High chance to show a dialog
          const nextConfirmIndex = Math.floor(
            Math.random() * endlessConfirmations.length
          )
          confirmationCountRef.current += 1

          // Add confirmation message to editor, always at the bottom
          setEditorConfirmations((prev) => {
            const newConfirmations = [
              ...prev,
              {
                id: Date.now(),
                text: endlessConfirmations[nextConfirmIndex],
                timestamp: Date.now(),
              },
            ]

            // Limit the number of displayed confirmations, but always show the newest ones
            // This ensures new messages appear at the bottom
            return newConfirmations.slice(-5)
          })

          // Still use error dialogs for errors, just not for confirmations
          if (Math.random() < multiDialogChance && effectiveProgress > 50) {
            // Show errors in dialogs
            const errorIndex = Math.floor(
              Math.random() * confusingErrors.length
            )
            errorCountRef.current += 1

            // Create random position for error dialog
            const errPosOffset = {
              x: Math.random() * 100 - 50,
              y: Math.random() * 80 - 40,
            }
            setMultipleDialogs((prev) =>
              [
                ...prev,
                {
                  id: Date.now(),
                  type: 'error' as const,
                  index: errorIndex,
                  position: {
                    x: 250 + errPosOffset.x,
                    y: 180 + errPosOffset.y,
                  },
                },
              ].slice(-3)
            )
            // Limit to 3 error dialogs at once
          }

          // Set target for cursor animation - specifically target the newest confirmation button
          // Y position changes based on scroll position to target the latest confirmation
          // This ensures cursor follows as the messages scroll down
          setTimeout(() => {
            if (messagesEndRef.current) {
              // Get position of the messages end element
              const rect = messagesEndRef.current.getBoundingClientRect()
              // Target slightly above the end element (where the buttons are)
              const buttonX = 280 + (Math.random() * 40 - 20) // Target "Confirm" button
              const buttonY = Math.min(
                350,
                rect.top - 40 + (Math.random() * 20 - 10)
              )
              setCursorTarget({ x: buttonX, y: buttonY })
              setCursorState('waiting')
            } else {
              // Fallback if ref not available
              const buttonX = 280 + (Math.random() * 40 - 20)
              const buttonY = 320 + (Math.random() * 30 - 15)
              setCursorTarget({ x: buttonX, y: buttonY })
              setCursorState('waiting')
            }
          }, 150) // Small delay to let the rendering happen

          // For command errors at higher frustration
          if (frustrationLevel > 0.6 && Math.random() > 0.6) {
            setTimeout(() => {
              const cmdErrorIndex = Math.floor(
                Math.random() * commandConfusion.length
              )
              commandErrorCountRef.current += 1

              // Create random position for command error dialog
              const cmdPosOffset = {
                x: Math.random() * 140 - 70,
                y: Math.random() * 120 - 60,
              }
              setMultipleDialogs((prev) =>
                [
                  ...prev,
                  {
                    id: Date.now() + 2,
                    type: 'command' as const,
                    index: cmdErrorIndex,
                    position: {
                      x: 220 + cmdPosOffset.x,
                      y: 200 + cmdPosOffset.y,
                    },
                  },
                ].slice(-3)
              )
            }, 600)
          }
        } else if (Math.random() > 0.5 && effectiveProgress > 40) {
          // Occasionally show errors
          const errorIndex = Math.floor(Math.random() * confusingErrors.length)
          errorCountRef.current += 1

          // Create random position for error dialog
          const errPosOffset = {
            x: Math.random() * 100 - 50,
            y: Math.random() * 80 - 40,
          }

          // Show error dialog
          setMultipleDialogs((prev) =>
            [
              ...prev,
              {
                id: Date.now(),
                type: 'error' as const, // Use const assertion for the type
                index: errorIndex,
                position: {
                  x: 250 + errPosOffset.x,
                  y: 180 + errPosOffset.y,
                },
              },
            ].slice(-3)
          )

          // Set target for cursor animation - error dismiss button
          const buttonX = Math.random() * 40 + 320
          const buttonY = Math.random() * 15 + 230
          setCursorTarget({ x: buttonX, y: buttonY })
          setCursorState('waiting')
        }
      },
      2000 - frustrationLevel * 1000
    ) // More frequent as frustration increases

    return () => clearInterval(confirmationInterval)
  }, [
    effectiveProgress,
    currentConfirmationIndex,
    isActive,
    frustrationLevel,
    multipleDialogs.length,
  ])

  // Auto-scroll the dialogs container when new dialogs appear
  useEffect(() => {
    if (dialogsContainerRef.current) {
      dialogsContainerRef.current.scrollTop =
        dialogsContainerRef.current.scrollHeight
    }
  }, [multipleDialogs])

  // Add a ref for the end of messages to enable auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // More robust auto-scroll when new confirmations or messages appear
  useEffect(() => {
    // Only auto-scroll if component is active
    if (!isActive) return;
    
    if (editorConfirmations.length > 0) {
      // Use a slightly longer delay to ensure the DOM has updated and animations have started
      setTimeout(() => {
        // Primary approach: Use the messagesEndRef if available
        if (messagesEndRef.current) {
          try {
            messagesEndRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'end',
            });
          } catch (e) {
            console.error('Error scrolling to messages end:', e);
          }
        } 
        // Fallback: Scroll the editor container to the bottom
        else if (editorRef.current) {
          try {
            editorRef.current.scrollTo({
              top: editorRef.current.scrollHeight,
              behavior: 'smooth',
            });
          } catch (e) {
            console.error('Error scrolling editor:', e);
          }
        }
      }, 150);
    }
  }, [editorConfirmations.length, planningStep, isActive]);

  // Set random targets periodically for more realistic cursor movement
  useEffect(() => {
    if (!isActive) return

    // Random movement points in the editor area
    const editorPoints = [
      { x: 300, y: 120 }, // Near top of editor
      { x: 250, y: 180 }, // Text area
      { x: 400, y: 220 }, // Right side
      { x: 220, y: 250 }, // Middle area
      { x: 350, y: 300 }, // Bottom area
      { x: 180, y: 160 }, // Left side
    ]

    // Move to random points when not handling dialogs
    const moveTimer = setInterval(
      () => {
        if (
          cursorState === 'normal' &&
          multipleDialogs.length === 0 &&
          !showConfirmDialog &&
          !showError &&
          !showCommandError
        ) {
          // 70% chance to move to a new random point
          if (Math.random() > 0.3) {
            const randomPoint =
              editorPoints[Math.floor(Math.random() * editorPoints.length)]
            // Add some randomness to the exact position
            setCursorTarget({
              x: randomPoint.x + (Math.random() * 40 - 20),
              y: randomPoint.y + (Math.random() * 40 - 20),
            })
          }
        }
      },
      1500 + Math.random() * 1000
    ) // Move every 1.5-2.5 seconds

    return () => clearInterval(moveTimer)
  }, [
    isActive,
    cursorState,
    multipleDialogs.length,
    showConfirmDialog,
    showError,
    showCommandError,
  ])

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
            setTimeout(() => {
              // If highly frustrated, perform rage clicks
              if (frustrationLevel > 0.5 && Math.random() > 0.3) {
                setCursorState('rageClick')
                setClickCount(5 + Math.floor(frustrationLevel * 8)) // More rage clicks at high frustration

                // After rage clicking, clear dialogs
                setTimeout(() => {
                  setShowConfirmDialog(false)
                  setShowError(false)
                  setShowCommandError(false)

                  // Clear editor confirmations based on frustration level
                  if (frustrationLevel > 0.8) {
                    // When extremely frustrated, rage clicking only clears some confirmations
                    // Keep the newest ones (slice from the middle to end)
                    setEditorConfirmations((prev) => {
                      const halfPoint = Math.floor(prev.length / 2)
                      return prev.slice(halfPoint)
                    })
                  } else {
                    // Less frustrated clears all confirmations
                    setEditorConfirmations([])
                  }

                  // Only clear some dialogs if extremely frustrated
                  if (frustrationLevel > 0.7) {
                    setMultipleDialogs((prev) =>
                      prev.slice(Math.floor(prev.length / 2))
                    )
                  } else {
                    setMultipleDialogs([]) // Clear all dialogs after rage clicking
                  }

                  setCursorState('normal')

                  // Set new random target - after click, move somewhere else
                  setCursorTarget({
                    x: 150 + Math.random() * 300,
                    y: 150 + Math.random() * 200,
                  })
                  lastTargetChangeRef.current = Date.now()

                  // Trigger screen shake with rage clicks
                  if (frustrationLevel > 0.6) {
                    setScreenShake(true)
                    setTimeout(() => setScreenShake(false), 300)
                  }
                }, 600)
              } else {
                // Normal click
                setShowConfirmDialog(false)
                setShowError(false)
                setShowCommandError(false)

                // Handle editor confirmations - remove the oldest confirmation after clicking
                if (editorConfirmations.length > 0) {
                  setEditorConfirmations((prev) => prev.slice(1)) // Remove oldest (first) confirmation
                }
                // Only remove one dialog from multiple dialog mode
                else if (multipleDialogs.length > 0) {
                  setMultipleDialogs((prev) => prev.slice(1))
                }

                setCursorState('normal')

                // Set new random target - after click, move somewhere else
                setCursorTarget({
                  x: 150 + Math.random() * 300,
                  y: 150 + Math.random() * 200,
                })
                lastTargetChangeRef.current = Date.now()
              }
            }, 200)
          }

          // Even if we're not clicking, after staying at target for a while,
          // occasionally move to a new position (simulating user reading/thinking)
          if (
            cursorState === 'normal' &&
            Date.now() - lastTargetChangeRef.current > 2000 &&
            Math.random() > 0.995
          ) {
            // Move to a new slightly different position
            setCursorTarget({
              x: cursorTarget.x + (Math.random() * 40 - 20),
              y: cursorTarget.y + (Math.random() * 40 - 20),
            })
            lastTargetChangeRef.current = Date.now()
          }

          return prev
        }

        // Add jitter based on frustration level - more realistic but still shows frustration
        const jitterFactor =
          frustrationLevel > 0.7 ? jitterAmount * 1.5 : jitterAmount

        // Use sine waves for more natural jitter that looks like hand trembling
        const time = Date.now() / 1000
        const jitterX =
          Math.sin(time * 10) * jitterFactor * 0.3 +
          (Math.random() - 0.5) * jitterFactor * 0.7
        const jitterY =
          Math.sin(time * 12 + 1) * jitterFactor * 0.3 +
          (Math.random() - 0.5) * jitterFactor * 0.7

        // Extreme behavior: occasionally move cursor in wrong direction when highly frustrated
        const movingWrongDirection = Math.random() < wrongDirectionChance

        // Calculate new position with jitter and possibly wrong direction
        const directionMultiplier = movingWrongDirection ? -0.7 : 1
        const speedMultiplier = rageMode ? 1.5 : 1 // Even faster in rage mode

        // Add slight mouse acceleration/deceleration for more natural movement
        const speedFactor = Math.min(1, distance / 100) // Slow down as we approach target
        const newX =
          prev.x +
          (dx / distance) *
            cursorSpeed *
            directionMultiplier *
            speedMultiplier *
            speedFactor +
          jitterX
        const newY =
          prev.y +
          (dy / distance) *
            cursorSpeed *
            directionMultiplier *
            speedMultiplier *
            speedFactor +
          jitterY

        return { x: newX, y: newY }
      })

      // Continue animation
      animationFrameId = requestAnimationFrame(animateCursor)
    }

    animationFrameId = requestAnimationFrame(animateCursor)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [
    isActive,
    cursorTarget,
    cursorState,
    cursorSpeed,
    jitterAmount,
    frustrationLevel,
    wrongDirectionChance,
    rageMode,
  ])

  // Calculate metrics
  const timeWasted = Math.floor(effectiveProgress / 8) * 15 // Minutes wasted
  const hoursWasted = Math.floor(effectiveProgress / 6) // Hours wasted per week
  const interruptions =
    confirmationCountRef.current +
    errorCountRef.current +
    commandErrorCountRef.current
  const productivityTax = Math.min(99, Math.floor(70 + frustrationLevel * 29)) // Percentage - starts higher

  return (
    <div className="flex flex-col h-full p-6" ref={editorRef}>
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

      {/* Main interface - mockup of VSCode with Cline errors and config issues */}
      <motion.div
        className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative"
        ref={vscodeContainerRef}
        animate={
          screenShake
            ? {
                x: [0, -5, 5, -5, 5, 0],
                y: [0, -3, 3, -2, 2, 0],
              }
            : {}
        }
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Rage mode overlay */}
        {rageMode && (
          <div className="absolute inset-0 pointer-events-none z-30 bg-red-900/10 border-4 border-red-900/30 rounded-lg"></div>
        )}

        {/* Animated cursor */}
        {isActive && (
          <motion.div
            className="absolute z-50 pointer-events-none"
            style={{
              left: cursorPosition.x,
              top: cursorPosition.y,
              filter: cursorGlow,
              transform: `scale(${1 + frustrationLevel * 0.7})`, // Cursor gets MUCH larger with frustration
            }}
            animate={
              cursorState === 'rageClick'
                ? {
                    x: [0, -5, 5, -5, 5, -3, 3, 0],
                    y: [0, -5, 5, -5, 5, -3, 3, 0],
                    scale: [1, 1.3, 0.9, 1.3, 0.9, 1.2, 0.95, 1],
                    rotate: [0, -8, 8, -8, 8, -5, 5, 0],
                  }
                : cursorState === 'clicking'
                  ? { scale: [1, 0.8, 1] }
                  : {}
            }
            transition={{
              duration: cursorState === 'rageClick' ? 0.12 : 0.1,
              repeat: cursorState === 'rageClick' ? clickCount : 0,
              repeatType: 'loop',
            }}
          >
            {/* SVG cursor with changing color - more realistic pointer */}
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

        {/* Multiple dialogs container for extreme frustration - OVERLAPPING DIALOGS - now constrained to the editor area */}
        <div className="absolute inset-0 z-40 overflow-hidden pointer-events-none">
          <AnimatePresence>
            {multipleDialogs.map((dialog, idx) => (
              <motion.div
                key={dialog.id}
                className={cn(
                  'z-40 rounded-md p-3 shadow-lg absolute pointer-events-auto',
                  dialog.type === 'confirm'
                    ? 'bg-zinc-800/95 border border-zinc-700'
                    : dialog.type === 'error'
                      ? 'bg-red-900/40 border border-red-700/50'
                      : 'bg-yellow-900/30 border border-yellow-700/40'
                )}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                style={{
                  left: `${Math.max(150, Math.min(dialog.position.x, 450))}px`, // Constrain to editor area
                  top: `${Math.max(100, Math.min(dialog.position.y, 350))}px`, // Constrain to editor area
                  width: '250px',
                  maxWidth: 'calc(100% - 150px)', // Prevent overflow
                  zIndex: 50 + idx,
                }}
              >
                {dialog.type === 'confirm' ? (
                  <>
                    <div className="text-white/80 text-sm mb-3">
                      {endlessConfirmations[dialog.index]}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className="bg-yellow-600/50 text-white/90 px-3 py-1 text-xs rounded hover:bg-yellow-600/70">
                        Confirm
                      </button>
                      <button className="bg-black/30 text-white/70 px-3 py-1 text-xs rounded hover:bg-black/40">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : dialog.type === 'error' ? (
                  <>
                    <div className="flex items-start">
                      <span className="text-red-500 mr-2">⚠️</span>
                      <div>
                        <div className="text-white/90 text-sm mb-2 font-medium">
                          Error
                        </div>
                        <div className="text-white/80 text-xs mb-3">
                          {confusingErrors[dialog.index]}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button className="bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start">
                      <span className="text-yellow-500 mr-2">⚙️</span>
                      <div>
                        <div className="text-white/90 text-sm mb-2 font-medium">
                          Command Error
                        </div>
                        <div className="text-white/80 text-xs mb-3">
                          {commandConfusion[dialog.index]}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button className="bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                        Got it
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Error dialogs - positioned in editor area */}
        {showError && (
          <motion.div
            className="absolute z-40 bg-red-900/30 border border-red-700/50 rounded-md p-3 shadow-lg w-64 mx-auto left-1/4 top-2/3 max-w-[300px]"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start">
              <span className="text-red-500 mr-2">⚠️</span>
              <div>
                <div className="text-white/90 text-sm mb-2 font-medium">
                  Error
                </div>
                <div className="text-white/80 text-xs mb-3">
                  {confusingErrors[currentErrorIndex]}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                Dismiss
              </button>
            </div>
            <div className="text-[9px] text-white/40 mt-2 text-right">
              Error {errorCountRef.current} today
            </div>
          </motion.div>
        )}

        {/* Command error dialog - positioned in editor area */}
        {showCommandError && (
          <motion.div
            className="absolute z-40 bg-yellow-900/20 border border-yellow-700/40 rounded-md p-3 shadow-lg w-64 mx-auto right-1/4 top-1/2 max-w-[280px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start">
              <span className="text-yellow-500 mr-2">⚙️</span>
              <div>
                <div className="text-white/90 text-sm mb-2 font-medium">
                  Command Error
                </div>
                <div className="text-white/80 text-xs mb-3">
                  {commandConfusion[currentCommandErrorIndex]}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="bg-zinc-800/60 text-white/80 px-3 py-1 text-xs rounded hover:bg-zinc-800/80">
                Got it
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex h-full">
          {/* Left side - file explorer and large file error */}
          <div className="w-1/4 border-r border-zinc-800 bg-black/20 text-white/70 text-xs">
            <div className="p-2 border-b border-zinc-800">
              <div className="font-medium mb-1">EXPLORER</div>
              <div className="ml-2">
                <div>src/</div>
                <div className="ml-2">components/</div>
                <div className="ml-4">Button.tsx</div>
                <div className="ml-4">Card.tsx</div>
                <div className="ml-4">Layout.tsx</div>
                <div className="ml-2">utils/</div>
                <div className="ml-4 text-yellow-400">
                  helpers.js (423 lines)
                </div>
                <div className="ml-4 text-yellow-400">
                  formatters.js (516 lines)
                </div>
                <div className="ml-2">config/</div>
                <div>public/</div>
                <div className="text-yellow-400">
                  .cline-instructions (required)
                </div>
              </div>
            </div>

            {/* Large file error message */}
            {effectiveProgress > largeFileDelay && (
              <motion.div
                className="m-2 bg-yellow-900/30 border border-yellow-700/50 rounded p-2 text-yellow-200/90 text-[10px]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="font-bold">⚠️ Large File Warning</div>
                <div className="mt-1">
                  Multiple files exceed the 400 line limit:
                </div>
                <div className="mt-1">- helpers.js (423 lines)</div>
                <div className="mt-1">- formatters.js (516 lines)</div>
                <div className="mt-1 font-bold">Cline limitation:</div>
                <div>Cannot efficiently process files over 400 lines.</div>
                <div className="mt-1 font-bold">Required action:</div>
                <div>Split files manually before proceeding.</div>
              </motion.div>
            )}

            {/* File count overload message */}
            {effectiveProgress > summaryDelay && (
              <motion.div
                className="m-2 mt-4 bg-red-900/20 border border-red-700/40 rounded p-2 text-red-200/90 text-[10px]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <div className="font-bold">⚠️ Project Size Warning</div>
                <div className="mt-1">
                  This project contains too many files for optimal processing.
                </div>
                <div className="mt-1 font-bold">Required action:</div>
                <div>Manually organize project into smaller contexts.</div>
              </motion.div>
            )}

            {/* Token limit message */}
            {effectiveProgress > 50 && (
              <motion.div
                className="m-2 mt-4 bg-purple-900/20 border border-purple-700/40 rounded p-2 text-purple-200/90 text-[10px]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <div className="font-bold">⚠️ Token Limit Warning</div>
                <div className="mt-1">Context slots nearly full (3/4)</div>
                <div className="mt-1 font-bold">Required action:</div>
                <div>Use /slot clear 2 to free up memory.</div>
              </motion.div>
            )}
          </div>

          {/* Main content area - code and babysitting UI */}
          <div className="flex-1 flex flex-col">
            {/* Editor limitation banner */}
            <motion.div
              className="border-b border-zinc-800 bg-blue-900/30 p-2 text-xs flex justify-between items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
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
            </motion.div>

            {/* Main editor area with unified message stream */}
            <div
              ref={editorRef}
              className="flex-1 p-3 overflow-y-auto font-mono text-sm"
            >
              {/* Initial command */}
              <div className="mb-4">
                <div className="text-white/50 mb-1 text-xs"># Request</div>
                <div className="text-white/90">
                  Update the profile page to add a new settings section
                </div>
              </div>

              {/* All interactions appear in this single stream */}
              <div className="space-y-4" id="message-stream">
                {/* Plan/Act system - always appears first after certain progress */}
                {effectiveProgress > instructionsDelay && (
                  <motion.div
                    className="bg-yellow-900/10 p-3 rounded border-l-2 border-yellow-600"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-yellow-400 font-medium">
                        Cline Plan/Act System
                      </div>
                      <div className="text-[10px] text-white/40">
                        Required manual review
                      </div>
                    </div>

                    {/* Planning phase - shows how much mental overhead Cline requires */}
                    <div className="bg-black/30 p-2 rounded mb-3 text-xs space-y-1 font-mono">
                      {planSteps.slice(0, planningStep + 1).map((step, idx) => (
                        <div key={idx} className="text-white/70">
                          {step}
                        </div>
                      ))}
                      {planningStep < planSteps.length - 1 && (
                        <motion.div
                          className="inline-block h-4 w-2 bg-yellow-500/70"
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                        />
                      )}
                    </div>

                    <div className="text-white/60 text-xs mb-2">
                      Cline requires manual confirmation before proceeding:
                    </div>

                    <div className="flex gap-2">
                      <button className="px-2 py-1 bg-yellow-700/40 rounded text-white/80 text-[10px]">
                        Approve Plan
                      </button>
                      <button className="px-2 py-1 bg-black/30 rounded text-white/60 text-[10px]">
                        Modify Plan
                      </button>
                      <button className="px-2 py-1 bg-black/30 rounded text-white/60 text-[10px]">
                        Provide More Context
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Editor confirmations - these appear directly in the editor in sequence */}
                {editorConfirmations.length > 0 && (
                  <div className="space-y-3" id="editor-confirmations">
                    {editorConfirmations.map((confirmation) => (
                      <motion.div
                        key={confirmation.id}
                        className="bg-zinc-900/80 p-2 rounded border border-zinc-700/70"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-white/80 text-xs font-medium flex items-center">
                            <span className="text-yellow-400 mr-1.5">⚠️</span>
                            Required User Action
                          </div>
                          <div className="text-[10px] text-white/40">
                            Action #
                            {confirmationCountRef.current -
                              editorConfirmations.length +
                              editorConfirmations.findIndex(
                                (c) => c.id === confirmation.id
                              ) +
                              1}
                          </div>
                        </div>

                        <div className="text-white/80 text-xs mb-2">
                          {confirmation.text}
                        </div>
                        <div className="flex gap-2">
                          <button className="px-2 py-1 bg-yellow-700/40 rounded text-white/80 text-[10px]">
                            Confirm
                          </button>
                          <button className="px-2 py-1 bg-black/30 rounded text-white/60 text-[10px]">
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    ))}

                    {/* Invisible element for scrolling anchor */}
                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Move these inside the message stream div */}
                {/* Large files error message */}
                {effectiveProgress > largeFileDelay && (
                  <motion.div
                    className="bg-red-900/10 p-3 rounded border-l-2 border-red-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-red-400 font-medium mb-2">
                      ⚠️ File Size Error
                    </div>
                    <div className="text-white/80 mb-2">
                      Cline cannot process files larger than 400 lines of code.
                    </div>
                    <div className="text-white/70 text-xs">
                      Required Action: Please manually split{' '}
                      <span className="text-yellow-400">
                        helpers.js (423 lines)
                      </span>{' '}
                      and{' '}
                      <span className="text-yellow-400">
                        formatters.js (516 lines)
                      </span>{' '}
                      into smaller files.
                    </div>

                    <div className="text-white/60 text-xs mt-3 mb-1">
                      This limitation impacts:
                    </div>
                    <ul className="list-disc list-inside text-white/60 text-[10px] space-y-1">
                      <li>Large components and utility files</li>
                      <li>Generated code files</li>
                      <li>Complex business logic</li>
                      <li>Legacy code</li>
                    </ul>
                  </motion.div>
                )}
              </div>

              {/* Custom instructions requirement */}
              {effectiveProgress > instructionsDelay && (
                <motion.div
                  className="mt-4 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div
                    className="bg-zinc-800/80 p-2 rounded-t flex justify-between items-center cursor-pointer"
                    onClick={() => setInstructionsOpen(!instructionsOpen)}
                  >
                    <div className="text-white/80 text-xs font-medium flex items-center">
                      <span className="text-yellow-400 mr-1">📋</span>
                      Custom Instructions Required
                    </div>
                    <div className="text-white/60 text-xs">
                      {instructionsOpen ? '▼' : '▶'}
                    </div>
                  </div>

                  {instructionsOpen && (
                    <div
                      ref={customInstructionsRef}
                      className="bg-black/30 border border-zinc-700 rounded-b p-2 max-h-40 overflow-y-auto"
                    >
                      <div className="text-white/60 text-[10px] mb-2">
                        Cline requires detailed instructions to function
                        properly. Please complete all required fields:
                      </div>
                      <div className="space-y-1 text-[10px]">
                        {customInstructions.map((instruction, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'flex items-center',
                              checkedItems.includes(idx)
                                ? 'text-white/80'
                                : 'text-white/50'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mr-1.5"
                              checked={checkedItems.includes(idx)}
                              readOnly
                            />
                            <span>{instruction}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Editor message removed, now shown as top banner */}

              {/* Final summary of issues - only shows at end */}
              {effectiveProgress > summaryDelay && (
                <motion.div
                  className="mt-4 bg-black/30 p-3 rounded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="text-white/70 text-xs bg-yellow-950/20 p-2 rounded mb-2 border border-yellow-900/30">
                    <span className="text-yellow-400 font-medium">
                      User babysitting required
                    </span>
                    : Cline needs constant attention to work properly
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-start">
                      <span className="text-yellow-400 mr-1 mt-0.5">⚙️</span>
                      <div>
                        <span className="text-white/80">
                          VS Code dependency:
                        </span>
                        <span className="text-white/60 ml-1">
                          Only works in VS Code, not in your preferred editor
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="text-yellow-400 mr-1 mt-0.5">📏</span>
                      <div>
                        <span className="text-white/80">File size limits:</span>
                        <span className="text-white/60 ml-1">
                          Files over 400 lines require manual splitting
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="text-yellow-400 mr-1 mt-0.5">📝</span>
                      <div>
                        <span className="text-white/80">
                          Extensive configuration:
                        </span>
                        <span className="text-white/60 ml-1">
                          {customInstructions.length} fields to configure and
                          maintain
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="text-yellow-400 mr-1 mt-0.5">🔍</span>
                      <div>
                        <span className="text-white/80">
                          Plan/Act approval:
                        </span>
                        <span className="text-white/60 ml-1">
                          Each action requires manual review and confirmation
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="text-red-400 mr-1 mt-0.5">⏱️</span>
                      <div>
                        <span className="text-white/80">Interruptions:</span>
                        <span className="text-white/60 ml-1">
                          Constant confirmations and errors disrupt workflow
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Command confusion */}
                  <div className="mt-3 bg-zinc-900/40 border border-zinc-800 rounded p-2 font-mono text-[10px]">
                    <div className="text-white/70 mb-2">
                      <span className="text-yellow-400">{'>'} </span>
                      /implement function updateUserProfile
                    </div>

                    <div className="text-red-400 mb-1">
                      Error: Unknown command. Did you mean /edit, /plan, or
                      /suggest?
                    </div>

                    <div className="text-white/70 mb-2">
                      <span className="text-yellow-400">{'>'} </span>
                      /plan implementation of updateUserProfile
                    </div>

                    <div className="text-yellow-400 mb-1">
                      Command requires approval in plan mode first. Use
                      /set-mode plan
                    </div>

                    <div className="text-white/70 mb-2">
                      <span className="text-yellow-400">{'>'} </span>
                      /set-mode plan
                    </div>

                    <div className="text-green-400/70 mb-1">
                      Mode set to PLAN. Use /approve after reviewing plan.
                    </div>

                    <div className="text-white/70">
                      <span className="text-yellow-400">{'>'} </span>
                      <span className="animate-pulse">|</span>
                    </div>
                  </div>

                  <div className="text-[9px] text-white/30 mt-2 flex justify-between">
                    <span>{interruptions} user interruptions</span>
                    <span className="text-red-400/80">
                      0 lines of code written
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status display highlighting the babysitting - simplified */}
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
