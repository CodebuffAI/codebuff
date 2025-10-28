import { green, yellow, blue, magenta, cyan, red } from 'picocolors'

// Terminal confetti characters that fit the coding theme
const CONFETTI_CHARS = [
  '✨',
  '🚀',
  '⚡',
  '💻',
  '🤖',
  '🔧', // Emoji confetti
  '$',
  '>',
  '#',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']', // Code symbols
  '!',
  '@',
  '%',
  '^',
  '&',
  '*', // Special chars
  '+',
  '=',
  '~',
  '|',
  '\\',
  '/', // More symbols
]

const COLORS = [green, yellow, blue, magenta, cyan, red]

interface ConfettiParticle {
  char: string
  x: number
  y: number
  vx: number // velocity x
  vy: number // velocity y
  life: number // frames remaining
  color: (text: string) => string
}

/**
 * Creates a burst of terminal confetti at the specified position
 */
export function createTerminalConfetti(
  centerX: number = Math.floor(process.stdout.columns / 2),
  centerY: number = Math.floor(process.stdout.rows / 2),
  particleCount: number = 30,
): ConfettiParticle[] {
  const particles: ConfettiParticle[] = []

  for (let i = 0; i < particleCount; i++) {
    // Random angle and speed for explosion effect
    const angle =
      (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5
    const speed = Math.random() * 3 + 1

    particles.push({
      char: CONFETTI_CHARS[Math.floor(Math.random() * CONFETTI_CHARS.length)],
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5, // Reduce vertical spread
      life: Math.floor(Math.random() * 20) + 30, // 30-50 frames
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    })
  }

  return particles
}

/**
 * Updates particle positions and removes dead particles
 */
function updateParticles(particles: ConfettiParticle[]): ConfettiParticle[] {
  return particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx,
      y: particle.y + particle.vy,
      vy: particle.vy + 0.1, // gravity
      life: particle.life - 1,
    }))
    .filter(
      (particle) =>
        particle.life > 0 &&
        particle.x >= 0 &&
        particle.x < process.stdout.columns &&
        particle.y >= 0 &&
        particle.y < process.stdout.rows,
    )
}

/**
 * Renders particles to the terminal
 */
function renderParticles(particles: ConfettiParticle[]) {
  particles.forEach((particle) => {
    const x = Math.floor(particle.x)
    const y = Math.floor(particle.y)

    // Move cursor to particle position and draw
    process.stdout.write(
      `\u001b[${y + 1};${x + 1}H${particle.color(particle.char)}`,
    )
  })
}

/**
 * Displays a celebratory message with confetti
 */
export async function showTerminalConfetti(
  message: string = '🎉 CODEBUFF MAGIC! 🎉',
  duration: number = 3000,
): Promise<void> {
  return new Promise((resolve) => {
    // Hide cursor
    process.stdout.write('\u001b[?25l')

    // Create confetti burst
    let particles = createTerminalConfetti()

    // Display the message at the center
    const messageX = Math.floor((process.stdout.columns - message.length) / 2)
    const messageY = Math.floor(process.stdout.rows / 2)

    const interval = setInterval(() => {
      // Clear screen
      process.stdout.write('\u001b[2J')

      // Show the message
      process.stdout.write(`\u001b[${messageY};${messageX}H${green(message)}`)

      // Update and render particles
      particles = updateParticles(particles)
      renderParticles(particles)

      // Add new particles occasionally for continuous effect
      if (Math.random() < 0.3 && particles.length < 50) {
        particles.push(
          ...createTerminalConfetti(
            Math.floor(Math.random() * process.stdout.columns),
            Math.floor((Math.random() * process.stdout.rows) / 3),
            5,
          ),
        )
      }

      // End when no particles left
      if (particles.length === 0) {
        clearInterval(interval)

        // Clear screen and show cursor
        process.stdout.write('\u001b[2J\u001b[?25h')
        resolve()
      }
    }, 100) // 10 FPS

    // Force end after duration
    setTimeout(() => {
      clearInterval(interval)
      process.stdout.write('\u001b[2J\u001b[?25h')
      resolve()
    }, duration)
  })
}

/**
 * Creates a "code rain" effect similar to Matrix
 */
export async function showCodeRain(duration: number = 2000): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write('\u001b[?25l') // Hide cursor

    const columns = process.stdout.columns
    const drops: number[] = new Array(columns).fill(0)

    const codeChars = '01{}()<>[]$#@%^&*+=|\\/:;"\',~`'.split('')

    const interval = setInterval(() => {
      // Fade background
      process.stdout.write('\u001b[2J')

      // Update drops
      for (let i = 0; i < drops.length; i++) {
        const char = codeChars[Math.floor(Math.random() * codeChars.length)]
        const color = Math.random() > 0.98 ? cyan : green

        if (drops[i] > 0) {
          process.stdout.write(`\u001b[${drops[i]};${i + 1}H${color(char)}`)
        }

        if (drops[i] > process.stdout.rows || Math.random() > 0.95) {
          drops[i] = 0
        }

        if (drops[i] === 0 && Math.random() > 0.98) {
          drops[i] = 1
        }

        if (drops[i] > 0) {
          drops[i]++
        }
      }
    }, 100)

    setTimeout(() => {
      clearInterval(interval)
      process.stdout.write('\u001b[2J\u001b[?25h') // Clear and show cursor
      resolve()
    }, duration)
  })
}

/**
 * Simple typing effect for displaying text character by character
 */
export async function typewriterEffect(
  text: string,
  delay: number = 50,
): Promise<void> {
  for (const char of text) {
    process.stdout.write(green(char))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  process.stdout.write('\n')
}
