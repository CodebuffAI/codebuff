import { describe, test, expect } from 'bun:test'

import {
  computeTerminalLayout,
  WIDTH_XS_BREAKPOINT,
  WIDTH_MD_BREAKPOINT,
  WIDTH_LG_BREAKPOINT,
  HEIGHT_XS_BREAKPOINT,
  HEIGHT_MD_BREAKPOINT,
} from '../use-terminal-layout'

describe('computeTerminalLayout', () => {
  const DEFAULT_HEIGHT = 24

  describe('width breakpoint constants', () => {
    test('breakpoints are in ascending order', () => {
      expect(WIDTH_XS_BREAKPOINT).toBeLessThan(WIDTH_MD_BREAKPOINT)
      expect(WIDTH_MD_BREAKPOINT).toBeLessThan(WIDTH_LG_BREAKPOINT)
    })
  })

  describe('xs width layout', () => {
    test('width 1 is xs', () => {
      const { width } = computeTerminalLayout(1, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
      expect(width.is('xs')).toBe(true)
      expect(width.is('sm')).toBe(false)
      expect(width.is('md')).toBe(false)
      expect(width.is('lg')).toBe(false)
    })

    test('width 0 is xs (edge case)', () => {
      const { width } = computeTerminalLayout(0, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
      expect(width.is('xs')).toBe(true)
    })

    test('negative width is xs (edge case)', () => {
      const { width } = computeTerminalLayout(-10, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
      expect(width.is('xs')).toBe(true)
    })

    test('width just below xs breakpoint is xs', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT - 1, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
      expect(width.is('xs')).toBe(true)
      expect(width.is('sm')).toBe(false)
    })
  })

  describe('sm width layout', () => {
    test('width at xs breakpoint is sm', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.size).toBe('sm')
      expect(width.is('xs')).toBe(false)
      expect(width.is('sm')).toBe(true)
      expect(width.is('md')).toBe(false)
      expect(width.is('lg')).toBe(false)
    })

    test('width at md breakpoint is sm', () => {
      const { width } = computeTerminalLayout(WIDTH_MD_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.size).toBe('sm')
      expect(width.is('sm')).toBe(true)
      expect(width.is('md')).toBe(false)
    })
  })

  describe('md width layout', () => {
    test('width just above md breakpoint is md', () => {
      const { width } = computeTerminalLayout(WIDTH_MD_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.size).toBe('md')
      expect(width.is('xs')).toBe(false)
      expect(width.is('sm')).toBe(false)
      expect(width.is('md')).toBe(true)
      expect(width.is('lg')).toBe(false)
    })

    test('width at lg breakpoint is md', () => {
      const { width } = computeTerminalLayout(WIDTH_LG_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.size).toBe('md')
      expect(width.is('md')).toBe(true)
      expect(width.is('lg')).toBe(false)
    })
  })

  describe('lg width layout', () => {
    test('width just above lg breakpoint is lg', () => {
      const { width } = computeTerminalLayout(WIDTH_LG_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.size).toBe('lg')
      expect(width.is('xs')).toBe(false)
      expect(width.is('sm')).toBe(false)
      expect(width.is('md')).toBe(false)
      expect(width.is('lg')).toBe(true)
    })

    test('very large width is lg', () => {
      const { width } = computeTerminalLayout(1000, DEFAULT_HEIGHT)
      expect(width.size).toBe('lg')
      expect(width.is('lg')).toBe(true)
    })
  })

  describe('width breakpoint boundaries (critical edge cases)', () => {
    test('width transitions from xs to sm at breakpoint', () => {
      const before = computeTerminalLayout(WIDTH_XS_BREAKPOINT - 1, DEFAULT_HEIGHT)
      const after = computeTerminalLayout(WIDTH_XS_BREAKPOINT, DEFAULT_HEIGHT)
      expect(before.width.size).toBe('xs')
      expect(after.width.size).toBe('sm')
    })

    test('width transitions from sm to md at breakpoint', () => {
      const before = computeTerminalLayout(WIDTH_MD_BREAKPOINT, DEFAULT_HEIGHT)
      const after = computeTerminalLayout(WIDTH_MD_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(before.width.size).toBe('sm')
      expect(after.width.size).toBe('md')
    })

    test('width transitions from md to lg at breakpoint', () => {
      const before = computeTerminalLayout(WIDTH_LG_BREAKPOINT, DEFAULT_HEIGHT)
      const after = computeTerminalLayout(WIDTH_LG_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(before.width.size).toBe('md')
      expect(after.width.size).toBe('lg')
    })
  })

  describe('width.is() returns exactly one true', () => {
    test('only one size matches at a time', () => {
      const testWidths = [
        1,
        WIDTH_XS_BREAKPOINT - 1,
        WIDTH_XS_BREAKPOINT,
        WIDTH_MD_BREAKPOINT,
        WIDTH_MD_BREAKPOINT + 1,
        WIDTH_LG_BREAKPOINT,
        WIDTH_LG_BREAKPOINT + 1,
        1000,
      ]
      const sizes = ['xs', 'sm', 'md', 'lg'] as const

      for (const terminalWidth of testWidths) {
        const { width } = computeTerminalLayout(terminalWidth, DEFAULT_HEIGHT)
        const trueCount = sizes.filter((size) => width.is(size)).length
        expect(trueCount).toBe(1)
      }
    })

    test('size property matches the is() result', () => {
      const testCases = [
        { terminalWidth: 1, expectedSize: 'xs' },
        { terminalWidth: WIDTH_XS_BREAKPOINT, expectedSize: 'sm' },
        { terminalWidth: WIDTH_MD_BREAKPOINT + 1, expectedSize: 'md' },
        { terminalWidth: WIDTH_LG_BREAKPOINT + 1, expectedSize: 'lg' },
      ] as const

      for (const { terminalWidth, expectedSize } of testCases) {
        const { width } = computeTerminalLayout(terminalWidth, DEFAULT_HEIGHT)
        expect(width.size).toBe(expectedSize)
        expect(width.is(expectedSize)).toBe(true)
      }
    })
  })

  describe('width.atLeast() helper', () => {
    test('xs is atLeast xs only', () => {
      const { width } = computeTerminalLayout(1, DEFAULT_HEIGHT)
      expect(width.atLeast('xs')).toBe(true)
      expect(width.atLeast('sm')).toBe(false)
      expect(width.atLeast('md')).toBe(false)
      expect(width.atLeast('lg')).toBe(false)
    })

    test('sm is atLeast xs and sm', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.atLeast('xs')).toBe(true)
      expect(width.atLeast('sm')).toBe(true)
      expect(width.atLeast('md')).toBe(false)
      expect(width.atLeast('lg')).toBe(false)
    })

    test('md is atLeast xs, sm, and md', () => {
      const { width } = computeTerminalLayout(WIDTH_MD_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.atLeast('xs')).toBe(true)
      expect(width.atLeast('sm')).toBe(true)
      expect(width.atLeast('md')).toBe(true)
      expect(width.atLeast('lg')).toBe(false)
    })

    test('lg is atLeast everything', () => {
      const { width } = computeTerminalLayout(WIDTH_LG_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.atLeast('xs')).toBe(true)
      expect(width.atLeast('sm')).toBe(true)
      expect(width.atLeast('md')).toBe(true)
      expect(width.atLeast('lg')).toBe(true)
    })
  })

  describe('width.atMost() helper', () => {
    test('xs is atMost everything', () => {
      const { width } = computeTerminalLayout(1, DEFAULT_HEIGHT)
      expect(width.atMost('xs')).toBe(true)
      expect(width.atMost('sm')).toBe(true)
      expect(width.atMost('md')).toBe(true)
      expect(width.atMost('lg')).toBe(true)
    })

    test('sm is atMost sm, md, and lg', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.atMost('xs')).toBe(false)
      expect(width.atMost('sm')).toBe(true)
      expect(width.atMost('md')).toBe(true)
      expect(width.atMost('lg')).toBe(true)
    })

    test('md is atMost md and lg', () => {
      const { width } = computeTerminalLayout(WIDTH_MD_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.atMost('xs')).toBe(false)
      expect(width.atMost('sm')).toBe(false)
      expect(width.atMost('md')).toBe(true)
      expect(width.atMost('lg')).toBe(true)
    })

    test('lg is atMost lg only', () => {
      const { width } = computeTerminalLayout(WIDTH_LG_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.atMost('xs')).toBe(false)
      expect(width.atMost('sm')).toBe(false)
      expect(width.atMost('md')).toBe(false)
      expect(width.atMost('lg')).toBe(true)
    })
  })

  describe('combining atLeast and atMost for ranges', () => {
    test('xs is only xs', () => {
      const { width } = computeTerminalLayout(1, DEFAULT_HEIGHT)
      // In range [xs, sm]
      expect(width.atLeast('xs') && width.atMost('sm')).toBe(true)
      // In range [sm, md]
      expect(width.atLeast('sm') && width.atMost('md')).toBe(false)
    })

    test('sm is in [sm, md] but not [md, lg]', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT, DEFAULT_HEIGHT)
      expect(width.atLeast('sm') && width.atMost('md')).toBe(true)
      expect(width.atLeast('md') && width.atMost('lg')).toBe(false)
    })

    test('md is in [sm, lg]', () => {
      const { width } = computeTerminalLayout(WIDTH_MD_BREAKPOINT + 1, DEFAULT_HEIGHT)
      expect(width.atLeast('sm') && width.atMost('lg')).toBe(true)
      expect(width.atLeast('xs') && width.atMost('sm')).toBe(false)
    })
  })

  describe('raw dimensions passthrough', () => {
    test('terminalWidth is passed through unchanged', () => {
      const layout = computeTerminalLayout(100, 24)
      expect(layout.terminalWidth).toBe(100)
    })

    test('terminalHeight is passed through unchanged', () => {
      const layout = computeTerminalLayout(100, 50)
      expect(layout.terminalHeight).toBe(50)
    })

    test('height does not affect width size calculation', () => {
      const testWidth = WIDTH_XS_BREAKPOINT + 10
      const smallHeight = computeTerminalLayout(testWidth, 10)
      const largeHeight = computeTerminalLayout(testWidth, 100)

      expect(smallHeight.width.size).toBe(largeHeight.width.size)
    })

    test('various heights preserve correct width layout', () => {
      const heights = [1, 10, 24, 50, 100, 1000]
      const testWidth = WIDTH_XS_BREAKPOINT + 10

      for (const height of heights) {
        const layout = computeTerminalLayout(testWidth, height)
        expect(layout.width.size).toBe('sm')
        expect(layout.terminalHeight).toBe(height)
      }
    })
  })

  describe('floating point edge cases', () => {
    test('floating point width just below breakpoint is xs', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT - 0.1, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
    })

    test('floating point width just above breakpoint is sm', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT + 0.1, DEFAULT_HEIGHT)
      expect(width.size).toBe('sm')
    })

    test('floating point exactly at breakpoint', () => {
      const { width } = computeTerminalLayout(WIDTH_XS_BREAKPOINT + 0.0, DEFAULT_HEIGHT)
      expect(width.size).toBe('sm')
    })
  })

  describe('unusual input edge cases', () => {
    test('NaN width is treated as sm (NaN comparisons return false)', () => {
      const { width } = computeTerminalLayout(NaN, DEFAULT_HEIGHT)
      // NaN comparisons return false, so it falls through to 'sm'
      expect(width.is('sm')).toBe(true)
    })

    test('Infinity width is lg', () => {
      const { width } = computeTerminalLayout(Infinity, DEFAULT_HEIGHT)
      expect(width.size).toBe('lg')
      expect(width.is('lg')).toBe(true)
    })

    test('-Infinity width is xs', () => {
      const { width } = computeTerminalLayout(-Infinity, DEFAULT_HEIGHT)
      expect(width.size).toBe('xs')
      expect(width.is('xs')).toBe(true)
    })
  })

  describe('return value structure', () => {
    test('returns all expected properties', () => {
      const layout = computeTerminalLayout(100, 24)

      expect(layout).toHaveProperty('width')
      expect(layout).toHaveProperty('terminalWidth')
      expect(layout).toHaveProperty('terminalHeight')
      expect(layout.width).toHaveProperty('size')
      expect(layout.width).toHaveProperty('is')
      expect(layout.width).toHaveProperty('atLeast')
      expect(layout.width).toHaveProperty('atMost')
    })

    test('width.size is one of the valid TerminalWidthSize values', () => {
      const validSizes = ['xs', 'sm', 'md', 'lg']
      const widths = [
        1,
        WIDTH_XS_BREAKPOINT,
        WIDTH_MD_BREAKPOINT + 1,
        WIDTH_LG_BREAKPOINT + 1,
      ]

      for (const terminalWidth of widths) {
        const { width } = computeTerminalLayout(terminalWidth, DEFAULT_HEIGHT)
        expect(validSizes).toContain(width.size)
      }
    })

    test('helper methods return booleans', () => {
      const { width } = computeTerminalLayout(100, 24)

      expect(typeof width.is('xs')).toBe('boolean')
      expect(typeof width.atLeast('xs')).toBe('boolean')
      expect(typeof width.atMost('xs')).toBe('boolean')
    })

    test('dimension values are numbers', () => {
      const layout = computeTerminalLayout(100, 24)

      expect(typeof layout.terminalWidth).toBe('number')
      expect(typeof layout.terminalHeight).toBe('number')
    })
  })

  describe('consistency across multiple calls', () => {
    test('same input always produces same output', () => {
      const terminalWidth = 100
      const height = 24

      const layout1 = computeTerminalLayout(terminalWidth, height)
      const layout2 = computeTerminalLayout(terminalWidth, height)
      const layout3 = computeTerminalLayout(terminalWidth, height)

      expect(layout1.width.size).toBe(layout2.width.size)
      expect(layout2.width.size).toBe(layout3.width.size)
    })

    test('deterministic across all breakpoint boundaries', () => {
      const boundaries = [
        WIDTH_XS_BREAKPOINT - 1,
        WIDTH_XS_BREAKPOINT,
        WIDTH_MD_BREAKPOINT,
        WIDTH_MD_BREAKPOINT + 1,
        WIDTH_LG_BREAKPOINT,
        WIDTH_LG_BREAKPOINT + 1,
      ]

      for (const terminalWidth of boundaries) {
        const layout1 = computeTerminalLayout(terminalWidth, DEFAULT_HEIGHT)
        const layout2 = computeTerminalLayout(terminalWidth, DEFAULT_HEIGHT)
        expect(layout1.width.size).toBe(layout2.width.size)
      }
    })
  })
})

describe('height layout helpers', () => {
  const DEFAULT_WIDTH = 100

  describe('height breakpoint constants', () => {
    test('HEIGHT_XS_BREAKPOINT is 20', () => {
      expect(HEIGHT_XS_BREAKPOINT).toBe(20)
    })

    test('HEIGHT_MD_BREAKPOINT is 40', () => {
      expect(HEIGHT_MD_BREAKPOINT).toBe(40)
    })

    test('breakpoints are in ascending order', () => {
      expect(HEIGHT_XS_BREAKPOINT).toBeLessThan(HEIGHT_MD_BREAKPOINT)
    })
  })

  describe('xs height layout (< 20 rows)', () => {
    test('height 1 is xs', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 1)
      expect(height.size).toBe('xs')
      expect(height.is('xs')).toBe(true)
      expect(height.is('sm')).toBe(false)
      expect(height.is('md')).toBe(false)
    })

    test('height 10 is xs', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 10)
      expect(height.size).toBe('xs')
      expect(height.is('xs')).toBe(true)
    })

    test('height 19 is xs (just below breakpoint)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 19)
      expect(height.size).toBe('xs')
      expect(height.is('xs')).toBe(true)
      expect(height.is('sm')).toBe(false)
    })

    test('height 0 is xs (edge case)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 0)
      expect(height.size).toBe('xs')
      expect(height.is('xs')).toBe(true)
    })

    test('negative height is xs (edge case)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, -10)
      expect(height.size).toBe('xs')
      expect(height.is('xs')).toBe(true)
    })
  })

  describe('sm height layout (20-40 rows)', () => {
    test('height 20 is sm (exactly at xs breakpoint)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 20)
      expect(height.size).toBe('sm')
      expect(height.is('xs')).toBe(false)
      expect(height.is('sm')).toBe(true)
      expect(height.is('md')).toBe(false)
    })

    test('height 30 is sm', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 30)
      expect(height.size).toBe('sm')
      expect(height.is('sm')).toBe(true)
    })

    test('height 40 is sm (exactly at md breakpoint)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 40)
      expect(height.size).toBe('sm')
      expect(height.is('sm')).toBe(true)
      expect(height.is('md')).toBe(false)
    })
  })

  describe('md height layout (> 40 rows)', () => {
    test('height 41 is md (just above sm)', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 41)
      expect(height.size).toBe('md')
      expect(height.is('xs')).toBe(false)
      expect(height.is('sm')).toBe(false)
      expect(height.is('md')).toBe(true)
    })

    test('height 60 is md', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 60)
      expect(height.size).toBe('md')
      expect(height.is('md')).toBe(true)
    })

    test('very large height (100) is md', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 100)
      expect(height.size).toBe('md')
      expect(height.is('md')).toBe(true)
    })
  })

  describe('height breakpoint boundaries', () => {
    test('height 19 -> 20 transitions from xs to sm', () => {
      const before = computeTerminalLayout(DEFAULT_WIDTH, 19)
      const after = computeTerminalLayout(DEFAULT_WIDTH, 20)
      expect(before.height.size).toBe('xs')
      expect(after.height.size).toBe('sm')
    })

    test('height 40 -> 41 transitions from sm to md', () => {
      const before = computeTerminalLayout(DEFAULT_WIDTH, 40)
      const after = computeTerminalLayout(DEFAULT_WIDTH, 41)
      expect(before.height.size).toBe('sm')
      expect(after.height.size).toBe('md')
    })
  })

  describe('height.is() returns exactly one true', () => {
    test('only one size matches at a time', () => {
      const testHeights = [1, 10, 19, 20, 30, 40, 41, 60, 100]
      const sizes = ['xs', 'sm', 'md'] as const
      
      for (const terminalHeight of testHeights) {
        const { height } = computeTerminalLayout(DEFAULT_WIDTH, terminalHeight)
        const trueCount = sizes.filter(size => height.is(size)).length
        expect(trueCount).toBe(1)
      }
    })
  })

  describe('height.atLeast() helper', () => {
    test('xs is atLeast xs only', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 10)
      expect(height.atLeast('xs')).toBe(true)
      expect(height.atLeast('sm')).toBe(false)
      expect(height.atLeast('md')).toBe(false)
    })

    test('sm is atLeast xs and sm', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 30)
      expect(height.atLeast('xs')).toBe(true)
      expect(height.atLeast('sm')).toBe(true)
      expect(height.atLeast('md')).toBe(false)
    })

    test('md is atLeast everything', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 60)
      expect(height.atLeast('xs')).toBe(true)
      expect(height.atLeast('sm')).toBe(true)
      expect(height.atLeast('md')).toBe(true)
    })
  })

  describe('height.atMost() helper', () => {
    test('xs is atMost everything', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 10)
      expect(height.atMost('xs')).toBe(true)
      expect(height.atMost('sm')).toBe(true)
      expect(height.atMost('md')).toBe(true)
    })

    test('sm is atMost sm and md', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 30)
      expect(height.atMost('xs')).toBe(false)
      expect(height.atMost('sm')).toBe(true)
      expect(height.atMost('md')).toBe(true)
    })

    test('md is atMost md only', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 60)
      expect(height.atMost('xs')).toBe(false)
      expect(height.atMost('sm')).toBe(false)
      expect(height.atMost('md')).toBe(true)
    })
  })

  describe('width and height are independent', () => {
    test('xs width with md height', () => {
      const layout = computeTerminalLayout(1, HEIGHT_MD_BREAKPOINT + 1)
      expect(layout.width.size).toBe('xs')
      expect(layout.height.size).toBe('md')
    })

    test('lg width with xs height', () => {
      const layout = computeTerminalLayout(WIDTH_LG_BREAKPOINT + 1, 1)
      expect(layout.width.size).toBe('lg')
      expect(layout.height.size).toBe('xs')
    })

    test('sm width with sm height (common case)', () => {
      const layout = computeTerminalLayout(WIDTH_XS_BREAKPOINT, HEIGHT_XS_BREAKPOINT + 1)
      expect(layout.width.size).toBe('sm')
      expect(layout.height.size).toBe('sm')
    })
  })

  describe('real-world terminal heights', () => {
    test('very short terminal (10 rows) is xs', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 10)
      expect(height.size).toBe('xs')
    })

    test('standard 24-row terminal is sm', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 24)
      expect(height.size).toBe('sm')
    })

    test('macOS default ~50 rows is md', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 50)
      expect(height.size).toBe('md')
    })

    test('fullscreen 1080p ~45 rows is md', () => {
      const { height } = computeTerminalLayout(DEFAULT_WIDTH, 45)
      expect(height.size).toBe('md')
    })
  })
})
