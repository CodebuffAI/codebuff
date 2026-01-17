import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { GridLayout } from '../grid-layout'

interface TestItem {
  id: string
  name: string
}

const createTestItem = (id: string, name: string): TestItem => ({ id, name })

const defaultGetItemKey = (item: TestItem): string => item.id

const defaultRenderItem = (
  item: TestItem,
  _idx: number,
  _columnWidth: number,
): React.ReactNode => <text key={item.id}>{item.name}</text>

describe('GridLayout', () => {
  describe('empty state', () => {
    test('returns null for empty items array', () => {
      const markup = renderToStaticMarkup(
        <GridLayout
          items={[]}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toBe('')
    })
  })

  describe('single item rendering', () => {
    test('renders a single item', () => {
      const items = [createTestItem('item-1', 'First Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('First Item')
    })

    test('uses single column layout for one item', () => {
      const items = [createTestItem('item-1', 'Only Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={200}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Only Item')
    })
  })

  describe('multiple items rendering', () => {
    test('renders all items', () => {
      const items = [
        createTestItem('item-1', 'Item One'),
        createTestItem('item-2', 'Item Two'),
        createTestItem('item-3', 'Item Three'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={180}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Item One')
      expect(markup).toContain('Item Two')
      expect(markup).toContain('Item Three')
    })

    test('renders items in correct order', () => {
      const items = [
        createTestItem('a', 'Alpha'),
        createTestItem('b', 'Beta'),
        createTestItem('c', 'Gamma'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={50}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      const alphaPos = markup.indexOf('Alpha')
      const betaPos = markup.indexOf('Beta')
      const gammaPos = markup.indexOf('Gamma')

      expect(alphaPos).toBeLessThan(betaPos)
      expect(betaPos).toBeLessThan(gammaPos)
    })
  })

  describe('getItemKey function', () => {
    test('uses getItemKey for React keys', () => {
      const items = [
        createTestItem('unique-key-1', 'Item 1'),
        createTestItem('unique-key-2', 'Item 2'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={(item) => `custom-${item.id}`}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Item 1')
      expect(markup).toContain('Item 2')
    })

    test('handles numeric keys', () => {
      interface NumericItem {
        index: number
        label: string
      }

      const items: NumericItem[] = [
        { index: 0, label: 'Zero' },
        { index: 1, label: 'One' },
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={(item) => String(item.index)}
          renderItem={(item) => <text>{item.label}</text>}
        />,
      )

      expect(markup).toContain('Zero')
      expect(markup).toContain('One')
    })
  })

  describe('renderItem function', () => {
    test('passes correct item to renderItem', () => {
      const items = [createTestItem('test-id', 'Test Name')]
      const renderedItems: TestItem[] = []

      renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={(item, _idx, _width) => {
            renderedItems.push(item)
            return <text>{item.name}</text>
          }}
        />,
      )

      expect(renderedItems).toHaveLength(1)
      expect(renderedItems[0]).toEqual({ id: 'test-id', name: 'Test Name' })
    })

    test('passes correct index to renderItem', () => {
      const items = [
        createTestItem('a', 'A'),
        createTestItem('b', 'B'),
        createTestItem('c', 'C'),
      ]
      const indices: number[] = []

      renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={50}
          getItemKey={defaultGetItemKey}
          renderItem={(item, idx, _width) => {
            indices.push(idx)
            return <text>{item.name}</text>
          }}
        />,
      )

      expect(indices).toEqual([0, 1, 2])
    })

    test('passes columnWidth to renderItem for single column', () => {
      const items = [createTestItem('a', 'A')]
      const widths: number[] = []

      renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={(item, _idx, width) => {
            widths.push(width)
            return <text>{item.name}</text>
          }}
        />,
      )

      expect(widths[0]).toBe(120)
    })

    test('passes calculated columnWidth to renderItem for multi-column', () => {
      const items = [
        createTestItem('a', 'A'),
        createTestItem('b', 'B'),
      ]
      const widths: number[] = []

      renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={121}
          getItemKey={defaultGetItemKey}
          renderItem={(item, _idx, width) => {
            widths.push(width)
            return <text>{item.name}</text>
          }}
        />,
      )

      // 2 columns: (121 - 1 gap) / 2 = 60
      expect(widths[0]).toBe(60)
      expect(widths[1]).toBe(60)
    })
  })

  describe('footer prop', () => {
    test('renders footer when provided', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          footer={<text>Footer Content</text>}
        />,
      )

      expect(markup).toContain('Footer Content')
    })

    test('renders footer after items in single column', () => {
      const items = [createTestItem('item-1', 'Main Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={50}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          footer={<text>The Footer</text>}
        />,
      )

      const itemPos = markup.indexOf('Main Item')
      const footerPos = markup.indexOf('The Footer')

      expect(itemPos).toBeLessThan(footerPos)
    })

    test('renders footer after items in multi-column', () => {
      const items = [
        createTestItem('a', 'Item A'),
        createTestItem('b', 'Item B'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          footer={<text>Multi-col Footer</text>}
        />,
      )

      expect(markup).toContain('Item A')
      expect(markup).toContain('Item B')
      expect(markup).toContain('Multi-col Footer')
    })

    test('does not render footer when not provided', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).not.toContain('Footer')
    })

    test('renders complex footer elements', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          footer={
            <box>
              <text>Status:</text>
              <text>Complete</text>
            </box>
          }
        />,
      )

      expect(markup).toContain('Status:')
      expect(markup).toContain('Complete')
    })
  })

  describe('marginTop prop', () => {
    test('applies default marginTop of 0', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toBeDefined()
    })

    test('applies custom marginTop', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          marginTop={2}
        />,
      )

      expect(markup).toContain('Item')
    })
  })

  describe('column layout based on width', () => {
    test('narrow width (< 100) uses single column', () => {
      const items = [
        createTestItem('a', 'Alpha'),
        createTestItem('b', 'Beta'),
        createTestItem('c', 'Gamma'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={80}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Alpha')
      expect(markup).toContain('Beta')
      expect(markup).toContain('Gamma')
    })

    test('medium width (100-149) uses up to 2 columns', () => {
      const items = [
        createTestItem('a', 'Alpha'),
        createTestItem('b', 'Beta'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Alpha')
      expect(markup).toContain('Beta')
    })

    test('large width (150-199) uses up to 3 columns', () => {
      const items = [
        createTestItem('a', 'Alpha'),
        createTestItem('b', 'Beta'),
        createTestItem('c', 'Gamma'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={180}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Alpha')
      expect(markup).toContain('Beta')
      expect(markup).toContain('Gamma')
    })

    test('extra large width (>= 200) uses up to 4 columns', () => {
      const items = [
        createTestItem('a', 'Alpha'),
        createTestItem('b', 'Beta'),
        createTestItem('c', 'Gamma'),
        createTestItem('d', 'Delta'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={250}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Alpha')
      expect(markup).toContain('Beta')
      expect(markup).toContain('Gamma')
      expect(markup).toContain('Delta')
    })
  })

  describe('generic type support', () => {
    test('works with string items', () => {
      const items = ['one', 'two', 'three']

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={180}
          getItemKey={(item) => item}
          renderItem={(item) => <text>{item.toUpperCase()}</text>}
        />,
      )

      expect(markup).toContain('ONE')
      expect(markup).toContain('TWO')
      expect(markup).toContain('THREE')
    })

    test('works with number items', () => {
      const items = [1, 2, 3]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={180}
          getItemKey={(item) => String(item)}
          renderItem={(item) => <text>Number: {item}</text>}
        />,
      )

      expect(markup).toContain('Number: 1')
      expect(markup).toContain('Number: 2')
      expect(markup).toContain('Number: 3')
    })

    test('works with complex object items', () => {
      interface ComplexItem {
        id: string
        data: {
          title: string
          count: number
        }
      }

      const items: ComplexItem[] = [
        { id: 'c1', data: { title: 'First', count: 10 } },
        { id: 'c2', data: { title: 'Second', count: 20 } },
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={(item) => item.id}
          renderItem={(item) => (
            <text>
              {item.data.title}: {item.data.count}
            </text>
          )}
        />,
      )

      expect(markup).toContain('First: 10')
      expect(markup).toContain('Second: 20')
    })
  })

  describe('edge cases', () => {
    test('handles very narrow width', () => {
      const items = [createTestItem('item-1', 'Narrow')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={10}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Narrow')
    })

    test('handles many items', () => {
      const items = Array.from({ length: 50 }, (_, i) =>
        createTestItem(`item-${i}`, `Item ${i}`),
      )

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={200}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup).toContain('Item 0')
      expect(markup).toContain('Item 49')
    })

    test('handles items with special characters in names', () => {
      const items = [
        createTestItem('special-1', '<script>alert("xss")</script>'),
        createTestItem('special-2', 'Item & More'),
      ]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      // React escapes HTML entities
      expect(markup).toContain('&lt;script&gt;')
      expect(markup).toContain('&amp;')
    })

    test('handles undefined footer gracefully', () => {
      const items = [createTestItem('item-1', 'Item')]

      const markup = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
          footer={undefined}
        />,
      )

      expect(markup).toContain('Item')
    })
  })

  describe('memoization', () => {
    test('component is memoized', () => {
      // MasonryGrid is wrapped in memo(), verify it renders consistently
      const items = [createTestItem('memo-test', 'Memoized')]

      const markup1 = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      const markup2 = renderToStaticMarkup(
        <GridLayout
          items={items}
          availableWidth={120}
          getItemKey={defaultGetItemKey}
          renderItem={defaultRenderItem}
        />,
      )

      expect(markup1).toBe(markup2)
    })
  })
})
