'use client'

import { useState, useEffect } from 'react'
import Terminal, { ColorMode } from '@/components/ui/terminal'
import TerminalOutput from '@/components/ui/terminal/terminal-output'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { cn } from '@/lib/utils'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

interface CompetitorCardProps {
  type: CompetitorType
  isActive: boolean
  className?: string
}

const competitorConfigs = {
  cursor: {
    title: 'Cursor',
    description: 'Generic AI suggestions',
    colors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
    demoCode: [
      '> Please add authentication to my app',
      'Generating code...',
      'function authenticate(username, password) {',
      '  // Basic auth check',
      '  if (username && password) {',
      '    return true;',
      '  }',
      '  return false;',
      '}',
      '// No integration with your stack',
      '// Missing error handling',
      '// Security concerns...',
      '',
      '> How do I integrate this with my app?',
      'Sorry, I need more context about your app.',
      'Please provide your tech stack and requirements.',
    ],
    ourCode: [
      '> Please add authentication to my app',
      'Analyzing your Next.js + Prisma stack...',
      'Found existing user model in schema.prisma',
      'Integrating with your error handling...',
      '',
      'export async function authenticate(',
      '  credentials: Credentials',
      '): Promise<AuthResponse> {',
      '  const user = await prisma.user.findUnique({',
      '    where: { email: credentials.email }',
      '  })',
      '',
      '  if (!user) throw new AuthError("Invalid credentials")',
      '',
      '  const valid = await verifyPassword(',
      '    credentials.password,',
      '    user.hashedPassword',
      '  )',
      '',
      '  return { user, session: await createSession(user) }',
      '}',
      '',
      '✨ Also added:',
      '• Middleware setup for protected routes',
      '• Session management with JWT',
      '• Rate limiting for security',
      '• Password reset flow',
    ],
  },
  'claude-code': {
    title: 'Claude Code',
    description: 'Slow, multi-step process',
    colors: [BlockColor.GenerativeGreen, BlockColor.AcidMatrix],
    demoCode: [
      '> Add rate limiting to the API',
      'Step 1/5: Loading project structure...',
      'Step 2/5: Analyzing dependencies...',
      'Step 3/5: Checking rate limit patterns...',
      'Step 4/5: Generating solution...',
      'Step 5/5: Finalizing code...',
      '⏳ This may take a few minutes...',
      '...',
      '',
      '> Can you speed this up?',
      'Sorry, I need to analyze the full context',
      'to ensure accuracy. Please wait...',
      '',
      'Still processing...',
    ],
    ourCode: [
      '> Add rate limiting to the API',
      'Scanning project...',
      'Found Express.js API routes',
      'Detected Redis in docker-compose.yml',
      '',
      '✨ Generated rate limiting solution:',
      'import rateLimit from "express-rate-limit"',
      'import RedisStore from "rate-limit-redis"',
      '',
      'export const limiter = rateLimit({',
      '  store: new RedisStore({',
      '    client: redis,',
      '    prefix: "api-limit:"',
      '  }),',
      '  max: 100,',
      '  windowMs: 15 * 60 * 1000',
      '})',
      '',
      '✅ Done in 0.8s',
      '',
      '🔍 Also detected and handled:',
      '• Added rate limit bypass for internal calls',
      '• Set up monitoring dashboard',
      '• Added rate limit headers',
      '• Created custom error responses',
    ],
  },
  cline: {
    title: 'Cline',
    description: 'Limited to specific environments',
    colors: [BlockColor.TerminalYellow, BlockColor.DarkForestGreen],
    demoCode: [
      '> Starting Cline...',
      'Error: VS Code extension required',
      'Error: Language server not found',
      'Error: Workspace must be a Git repository',
      '',
      'Please install required extensions',
      'and configure your IDE settings:',
      '',
      '1. Install VS Code',
      '2. Install Cline extension',
      '3. Configure language servers',
      '4. Set up Git repository',
      '5. Restart VS Code',
      '',
      'Cannot proceed without setup.',
    ],
    ourCode: [
      '> codebuff',
      'Welcome to Codebuff! 🚀',
      '',
      '✓ Works in any terminal',
      '✓ No setup required',
      '✓ Instant project analysis',
      '',
      'Ready to help with your code!',
      '',
      'Try:',
      '  • analyze - Scan your codebase',
      '  • help    - Show all commands',
      '  • fix     - Auto-fix issues',
      '',
      'Pro tip: Codebuff also works in:',
      '• VS Code (if you want)',
      '• Any other IDE',
      '• CI/CD pipelines',
      '• Production servers',
      '',
      'Just start typing to begin...',
    ],
  },
}

export function CompetitorCard({ type, isActive, className }: CompetitorCardProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const config = competitorConfigs[type]

  useEffect(() => {
    if (isActive) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <div
      className={cn(
        'relative transition-all duration-500 transform',
        isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
        className
      )}
    >
      <div className="grid grid-cols-2 gap-8 items-center">
        {/* Their Side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white/80">{config.title}</h3>
            <p className="text-white/60">{config.description}</p>
          </div>
          <DecorativeBlocks
            colors={config.colors}
            initialPlacement="top-left"
          >
            <div className="relative">
              <Terminal
                name="Their Terminal"
                colorMode={ColorMode.Dark}
                prompt="> "
                showWindowButtons={true}
              >
                {config.demoCode.map((line, i) => (
                  <TerminalOutput key={i}>{line}</TerminalOutput>
                ))}
              </Terminal>
              <div className="absolute inset-0 bg-black/20 pointer-events-none" />
            </div>
          </DecorativeBlocks>
        </div>

        {/* Our Side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-primary">Codebuff</h3>
            <p className="text-white/80">Context-aware, lightning fast</p>
          </div>
          <DecorativeBlocks
            colors={[BlockColor.GenerativeGreen, BlockColor.AcidMatrix]}
            initialPlacement="top-right"
          >
            <div className="relative">
              <Terminal
                name="Codebuff Terminal"
                colorMode={ColorMode.Dark}
                prompt="> "
                showWindowButtons={true}
              >
                {config.ourCode.map((line, i) => (
                  <TerminalOutput key={i}>{line}</TerminalOutput>
                ))}
              </Terminal>
              <div 
                className={cn(
                  "absolute inset-0 bg-primary/5 opacity-0 transition-opacity duration-500",
                  isAnimating && "opacity-100"
                )} 
              />
            </div>
          </DecorativeBlocks>
        </div>
      </div>
    </div>
  )
}