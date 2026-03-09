import typography from '@tailwindcss/typography'
import tailwindcssAnimate from 'tailwindcss-animate'

import type { Config } from 'tailwindcss'

const config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)'],
      mono: ['"DM Mono"', 'var(--font-mono)'],
    },
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'acid-green': '#00FF95',
        'acid-matrix': '#7CFF3F',
        'dark-forest-green': '#03100A',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        shimmer: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(200%)' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100vh)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'terminal-cursor': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'glow-pulse': {
          '0%, 100%': {
            textShadow: '0 0 20px rgba(0,255,149,0.4), 0 0 40px rgba(0,255,149,0.2), 0 0 80px rgba(0,255,149,0.1)',
          },
          '50%': {
            textShadow: '0 0 30px rgba(0,255,149,0.6), 0 0 60px rgba(0,255,149,0.3), 0 0 100px rgba(0,255,149,0.15)',
          },
        },

      },
      animation: {
        shimmer: 'shimmer 2.5s infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'terminal-cursor': 'terminal-cursor 1s steps(1) infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',

      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config

export default config
