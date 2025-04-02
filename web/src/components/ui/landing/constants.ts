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
    background: '#c96442',
    textColor: 'text-white',
    decorativeColors: [BlockColor.TerminalYellow],
  },
  feature1: {
    background: BlockColor.BetweenGreen,
    textColor: 'text-black',
    decorativeColors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
  },
  feature2: {
    background: BlockColor.Black,
    textColor: 'text-white',
    decorativeColors: [BlockColor.CRTAmber, BlockColor.TerminalYellow],
  },
  feature3: {
    background: BlockColor.BetweenGreen,
    textColor: 'text-black',
    decorativeColors: [BlockColor.GenerativeGreen, BlockColor.CRTAmber],
  },
  competition: {
    background: BlockColor.Black,
    textColor: 'text-white',
    decorativeColors: [BlockColor.AcidMatrix],
  },
  testimonials: {
    background: BlockColor.BetweenGreen,
    textColor: 'text-black',
    decorativeColors: [BlockColor.CRTAmber],
  },
  cta: {
    background: BlockColor.Black,
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
      icon: '🤪',
      title: 'Total Codebase Mind-Reading',
      description:
        'Uses psychic powers to understand your code before you even write it - we call it "pre-coding"',
    },
    {
      icon: '🔮',
      title: 'Bug Fortune Telling',
      description:
        "Can predict bugs you'll create next week. Spooky? Yes. Useful? Also yes.",
    },
    {
      icon: '🦄',
      title: 'Unicorn-Powered Solutions',
      description:
        "Our code is actually written by mythical unicorns. Don't ask how - it's proprietary technology",
    },
  ],
  rightStuff: [
    {
      icon: '🎪',
      title: 'Circus-Level Setup',
      description:
        'So easy to set up, even a circus clown could do it. (No offense to circus professionals)',
    },
    {
      icon: '🧙‍♂️',
      title: 'Magical Code Spells',
      description:
        'Casts arcane incantations that somehow transform spaghetti code into beautiful architecture',
    },
    {
      icon: '🏄‍♂️',
      title: 'Terminal Surfing',
      description:
        'Rides the command line waves with style. Cowabunga, dude! Your terminal has never been this rad',
    },
  ],
  remembers: [
    {
      icon: '🐘',
      title: 'Elephant-Grade Memory',
      description:
        'Remembers everything better than your best friend who never forgets that embarrassing thing you did in 2009',
    },
    {
      icon: '👻',
      title: 'Haunted By Your Code',
      description:
        "Your code style haunts our AI at night. It's actually kind of creepy how well it mimics you",
    },
    {
      icon: '⏰',
      title: 'Time-Traveling Assistant',
      description:
        'Might actually be from the future. Our legal team says we can neither confirm nor deny this claim',
    },
  ],
}
