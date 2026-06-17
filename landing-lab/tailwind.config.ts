import tailwindcssAnimate from 'tailwindcss-animate'

import type { Config } from 'tailwindcss'

/**
 * Mirrors the Freebuff Next.js app design system so prototypes built here
 * transfer over cleanly. Tokens are dark-only (no light theme).
 */
const config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontFamily: {
      sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      paragraph: ['Manrope', 'Inter', 'sans-serif'],
      serif: ['Newsreader', 'serif'],
    },
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
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
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Freebuff forest-green brand palette (deep pine, not neon)
        forest: {
          DEFAULT: '#2c7a40',
          deep: '#163a20',
          mid: '#246b37',
          bright: '#54a967',
        },
        'dark-forest-green': '#03100A',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'aurora-pan': {
          '0%': { transform: 'translate3d(-8%, -4%, 0) rotate(-6deg) scale(1.3)' },
          '50%': { transform: 'translate3d(8%, 4%, 0) rotate(6deg) scale(1.45)' },
          '100%': {
            transform: 'translate3d(-8%, -4%, 0) rotate(-6deg) scale(1.3)',
          },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        float: 'float 3s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 10s ease infinite',
        'aurora-pan': 'aurora-pan 14s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config

export default config
