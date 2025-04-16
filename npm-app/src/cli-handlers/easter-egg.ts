import { blue, cyan, green, magenta, red, yellow } from 'picocolors'

// Utility: clear the terminal screen
function clearScreen() {
  process.stdout.write('\u001b[2J\u001b[0;0H')
}

// Utility: Generate a set of points tracing a "C" shape using an arc.
function generateCPath(cx: number, cy: number, r: number, steps: number) {
  const points = []
  // A typical "C" opens to the right: from 45° to 315° (in radians)
  const startAngle = Math.PI / 4
  const endAngle = (7 * Math.PI) / 4
  const angleStep = (endAngle - startAngle) / steps
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + i * angleStep
    const x = Math.floor(cx + r * Math.cos(angle))
    const y = Math.floor(cy + r * Math.sin(angle))
    points.push({ x, y })
  }
  return points
}

// Utility: Generate points along a quadratic Bézier curve.
function quadraticBezier(
  P0: { x: number; y: number },
  P1: { x: number; y: number },
  P2: { x: number; y: number },
  steps: number
) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round(
      (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x
    )
    const y = Math.round(
      (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y
    )
    points.push({ x, y })
  }
  return points
}

// Generate a vertical line from startY to endY at a given x.
function generateVerticalLine(x: number, startY: number, endY: number) {
  const points = []
  const step = startY < endY ? 1 : -1
  for (let y = startY; y !== endY; y += step) {
    points.push({ x, y })
  }
  points.push({ x, y: endY })
  return points
}

// Generate a path approximating a B shape using two quadratic Bézier curves
// for the rounded bubbles, and then closing the shape with a vertical spine.
function generateBPath(
  bX: number,
  bYTop: number,
  bYBottom: number,
  bWidth: number,
  bGap: number,
  stepsPerCurve: number
) {
  let points: { x: number; y: number }[] = []
  const middle = Math.floor((bYTop + bYBottom) / 2)

  // Upper bubble: from top-left (spine) out then back to the spine at the middle.
  const upperStart = { x: bX, y: bYTop }
  const upperControl = {
    x: bX + bWidth + bGap - 10,
    y: Math.floor((bYTop + middle) / 2),
  }
  const upperEnd = { x: bX, y: middle }
  const upperCurve = quadraticBezier(
    upperStart,
    upperControl,
    upperEnd,
    stepsPerCurve
  )

  // Lower bubble: from the middle to the bottom.
  const lowerStart = { x: bX, y: middle }
  const lowerControl = {
    x: bX + bWidth + bGap,
    y: Math.floor((middle + bYBottom) / 2),
  }
  const lowerEnd = { x: bX, y: bYBottom }
  const lowerCurve = quadraticBezier(
    lowerStart,
    lowerControl,
    lowerEnd,
    stepsPerCurve
  )

  // Combine the curves.
  points = points.concat(upperCurve, lowerCurve)

  // Add a vertical line from the bottom of the B back up to the top.
  const closingLine = generateVerticalLine(bX, bYBottom, bYTop)
  points = points.concat(closingLine)

  return points
}

// Array of picocolors functions for random colors.
const colors = [red, green, yellow, blue, magenta, cyan]
function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)]
}

export async function showEasterEgg(complete: () => void) {
  const text = 'codebuffy'

  const termWidth = process.stdout.columns
  const termHeight = process.stdout.rows
  const baselineWidth = 80
  const baselineHeight = 24
  const scaleFactor = Math.min(
    termWidth / baselineWidth,
    termHeight / baselineHeight
  )

  // Dynamically scale parameters for the shapes.
  // Use Math.max to ensure values don't get too small.
  const cCenterX = Math.floor(termWidth * 0.3)
  const cCenterY = Math.floor(termHeight / 2)
  const cRadius = Math.max(2, Math.floor(8 * scaleFactor))
  const cSteps = Math.max(10, Math.floor(30 * scaleFactor))

  const bX = Math.floor(termWidth * 0.55)
  const bYTop = Math.floor(termHeight / 2 - 7 * scaleFactor)
  const bYBottom = Math.floor(termHeight / 2 + 7 * scaleFactor)
  const bWidth = Math.max(2, Math.floor(8 * scaleFactor))
  const bGap = Math.max(1, Math.floor(35 * scaleFactor))
  const bStepsPerCurve = Math.max(10, Math.floor(20 * scaleFactor))

  // Generate the paths.
  const fullPath = [
    ...generateCPath(cCenterX, cCenterY, cRadius, cSteps),
    ...generateBPath(bX, bYTop, bYBottom, bWidth, bGap, bStepsPerCurve),
  ]

  // Animation state: index into the fullPath.
  let index = 0
  let completedCycle = false

  // Main animation function
  function animate() {
    if (index >= fullPath.length) {
      completedCycle = true
      return
    }

    const { x, y } = fullPath[index]
    const cursorPosition = `\u001b[${y + 1};${x + 1}H`
    process.stdout.write(cursorPosition + getRandomColor()(text))

    index++
  }

  clearScreen()
  const interval = setInterval(() => {
    animate()
    if (completedCycle) {
      clearInterval(interval)
      clearScreen()
      complete()
    }
  }, 100)
}
