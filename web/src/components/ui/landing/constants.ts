import { BlockColor } from '../decorative-blocks'

// Demo code samples
export const DEMO_CODE = {
  understanding: [
    '> codebuff "find memory leaks in our React components"',
    'Analyzing codebase structure...',
    'Scanning 246 files and dependencies...',
    'Found 18 React components with potential issues',
    'Memory leak detected in UserDashboard.tsx:',
    '• Line 42: useEffect missing cleanup function',
    '• Line 87: Event listener not removed on unmount',
    '> Would you like me to fix these issues?',
    'Yes, fix all memory leaks',
    '> Applied precise fixes to 7 components',
    '• All memory leaks resolved correctly',
  ],
  rightStuff: [
    '> codebuff "set up TypeScript with Next.js"',
    'Analyzing project needs and best practices...',
    'Creating config files with optimized settings:',
    '• tsconfig.json with strict type checking',
    '• ESLint configuration with NextJS ruleset',
    '• Tailwind CSS with TypeScript types',
    '• Husky pre-commit hooks for code quality',
    '> Setup complete. Testing build...',
    'Build successful - project ready for development',
  ],
  remembers: [
    '> codebuff',
    'Welcome back! Loading your context...',
    'Found knowledge.md files in 3 projects',
    'Last session (2 days ago), you were:',
    '• Implementing authentication with JWT',
    '• Refactoring the API client for better error handling',
    '• Working on optimizing database queries',
    '> How would you like to continue?',
    'Continue with the API client refactoring',
    '> Retrieving context from previous work...',
  ],
}

// Section themes
export const SECTION_THEMES = {
  hero: {
    background: 'black',
    textColor: 'text-white',
    decorativeColors: [BlockColor.TerminalYellow],
  },
  feature1: {
    background: BlockColor.TerminalYellow,
    textColor: 'text-black',
    decorativeColors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
  },
  feature2: {
    background: BlockColor.Black,
    textColor: 'text-white',
    decorativeColors: [BlockColor.AcidMatrix, BlockColor.TerminalYellow],
  },
  feature3: {
    background: BlockColor.TerminalYellow,
    textColor: 'text-black',
    decorativeColors: [BlockColor.GenerativeGreen, BlockColor.CRTAmber],
  },
  competition: {
    background: 'black',
    textColor: 'text-white',
    decorativeColors: [BlockColor.AcidMatrix],
  },
  testimonials: {
    background: '#ffff33',
    textColor: 'text-black',
    decorativeColors: [BlockColor.CRTAmber],
  },
  cta: {
    background: 'black',
    textColor: 'text-white',
    decorativeColors: [
      BlockColor.TerminalYellow,
      BlockColor.CRTAmber,
      BlockColor.DarkForestGreen,
    ],
  },
}

// Animation timings
export const ANIMATION = {
  fadeIn: {
    duration: 0.5,
    delay: 0.2,
  },
  slideUp: {
    duration: 0.7,
    delay: 0.1,
  },
  scale: {
    duration: 0.8,
    ease: [0.165, 0.84, 0.44, 1],
  },
}

// Feature section key points
export const FEATURE_POINTS = {
  understanding: [
    {
      icon: '🧠',
      title: 'Complete Codebase Context',
      description:
        'Analyzes your entire project to understand its architecture and how components interact',
    },
    {
      icon: '🔍',
      title: 'Precise Problem Identification',
      description:
        'Quickly identifies bugs, vulnerabilities, and optimization opportunities',
    },
    {
      icon: '⚡',
      title: 'Smarter Suggestions',
      description:
        "Delivers code recommendations that align with your project's patterns and standards",
    },
  ],
  rightStuff: [
    {
      icon: '🛠️',
      title: 'Intelligent Configuration',
      description:
        'Sets up project scaffolding, dependencies, and configurations tailored to your needs',
    },
    {
      icon: '✂️',
      title: 'Precise Code Edits',
      description:
        "Makes targeted changes instead of rewriting entire files, preserving your code's integrity",
    },
    {
      icon: '🔄',
      title: 'Seamless Integration',
      description:
        'Works with any technology stack or framework without environment restrictions',
    },
  ],
  remembers: [
    {
      icon: '🧩',
      title: 'Persistent Context',
      description:
        'Maintains project-specific knowledge in knowledge.md files that persists between sessions',
    },
    {
      icon: '📈',
      title: 'Adaptive Workflows',
      description:
        'Learns your coding style and preferences to provide increasingly personalized assistance',
    },
    {
      icon: '⏱️',
      title: 'Time-Saving Recall',
      description:
        'Instantly recalls previous solutions and decisions to avoid repetitive explanations',
    },
  ],
}