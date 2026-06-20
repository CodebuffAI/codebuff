import typography from '@tailwindcss/typography'
import tailwindcssAnimate from 'tailwindcss-animate'

import type { Config } from 'tailwindcss'

const config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)'],
      mono: ['"DM Mono"', 'var(--font-mono)'],
      'dm-mono': ['"DM Mono"', 'monospace'],
      paragraph: ['Manrope', 'var(--font-sans)', 'sans-serif'],
      serif: ['Domine', 'serif'],
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
        // Freebuff forest-green brand palette (used by the /landing page)
        forest: {
          DEFAULT: '#2c7a40',
          deep: '#163a20',
          mid: '#246b37',
          bright: '#54a967',
        },
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
        'slide-in': {
          from: {
            transform: 'translateX(100%)',
            opacity: '0',
          },
          to: {
            transform: 'translateX(0)',
            opacity: '1',
          },
        },
        shimmer: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(200%)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 20px rgba(168, 85, 247, 0.6)',
          },
          '50%': {
            opacity: '0.8',
            boxShadow: '0 0 30px rgba(168, 85, 247, 0.8)',
          },
        },
        'fade-in-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'letter-fade-in': {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'logo-scroll': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shine: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
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
            textShadow:
              '0 0 20px rgba(124,255,63,0.4), 0 0 40px rgba(124,255,63,0.2), 0 0 80px rgba(124,255,63,0.1)',
          },
          '50%': {
            textShadow:
              '0 0 30px rgba(124,255,63,0.6), 0 0 60px rgba(124,255,63,0.3), 0 0 100px rgba(124,255,63,0.15)',
          },
        },
        'thinking-dot': {
          '0%, 80%, 100%': { opacity: '0.25', transform: 'translateY(0)' },
          '40%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        shimmer: 'shimmer 2.5s infinite',
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'letter-fade-in': 'letter-fade-in 0.4s ease-out forwards',
        'logo-scroll': 'logo-scroll 30s linear infinite',
        shine: 'shine 3s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'terminal-cursor': 'terminal-cursor 1s steps(1) infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'thinking-dot': 'thinking-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config

export default config
