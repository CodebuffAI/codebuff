import type { Config } from 'tailwindcss'

const config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)'],
      mono: ['var(--font-mono)'],
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
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
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
        marquee: {
          from: { transform: 'translate3d(0, 0, 0)' },
          to: { transform: 'translate3d(calc(-100% - var(--gap)), 0, 0)' },
        },
        'marquee-vertical': {
          from: { transform: 'translate3d(0, 0, 0)' },
          to: { transform: 'translate3d(0, calc(-100% - var(--gap)), 0)' },
        },
        'background-position-spin': {
          '0%': { backgroundPosition: 'top center' },
          '100%': { backgroundPosition: 'bottom center' },
        },
        scanlines: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(8px)' },
        },
        crtflicker: {
          '0%': { opacity: '0.65' },
          '33%': { opacity: '0.75' },
          '66%': { opacity: '0.62' },
          '100%': { opacity: '0.65' },
        },
        textflicker: {
          '0%': { opacity: '0.95', textShadow: '2px 0 0 rgba(255,176,0,0.6)' },
          '25%': { opacity: '0.92', textShadow: '-2px 0 0 rgba(255,176,0,0.6)' },
          '50%': { opacity: '0.94', textShadow: '2px 0 0 rgba(255,176,0,0.6)' },
          '75%': { opacity: '0.91', textShadow: '-2px 0 0 rgba(255,176,0,0.6)' },
          '100%': { opacity: '0.95', textShadow: '2px 0 0 rgba(255,176,0,0.6)' },
        },
        pathGlow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.3))' },
          '50%': { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.6))' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        'pulse-border': {
          '0%, 100%': { boxShadow: '0 0 0 rgba(124, 255, 63, 0)' },
          '50%': { boxShadow: '0 0 5px rgba(124, 255, 63, 0.5)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee var(--duration) infinite linear',
        'marquee-vertical': 'marquee-vertical var(--duration) linear infinite',
        'background-position-spin': 'background-position-spin 3000ms infinite alternate',
        scanlines: 'scanlines 1s linear infinite',
        textflicker: 'textflicker 0.1s infinite',
        crtflicker: 'crtflicker 2s infinite ease-in-out',
        'path-glow': 'pathGlow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'pulse-border': 'pulse-border 2s ease-in-out infinite'
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config

export default config
