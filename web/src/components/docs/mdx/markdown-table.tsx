'use client'

import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

interface MarkdownTableProps {
  children: React.ReactNode
}

export function MarkdownTable({ children }: MarkdownTableProps) {
  const [copied, setCopied] = useState(false)

  const { content, tableData } = useMemo(() => {
    // Extract content from children
    let contentStr = ''
    if (typeof children === 'string') {
      contentStr = children
    } else if (Array.isArray(children)) {
      contentStr = children
        .map((child) => (typeof child === 'string' ? child : ''))
        .join('')
    } else if (
      children &&
      typeof children === 'object' &&
      'props' in children
    ) {
      contentStr =
        typeof children.props.children === 'string'
          ? children.props.children
          : Array.isArray(children.props.children)
            ? children.props.children.join('')
            : ''
    }

    // Parse table data from markdown string
    const lines = contentStr.trim().split('\n')
    const tableRows = lines.map(
      (line) =>
        line
          .split('|')
          .map((cell) => cell.trim())
          .filter((cell, i, arr) => i > 0 && i < arr.length - 1), // Remove empty cells at start/end
    )

    // Extract headers (first row)
    const headers = tableRows[0] || []

    // Extract alignment info from separator row (second row)
    const alignmentRow = tableRows[1] || []
    const alignments = headers.map((_, i) => {
      const cell = alignmentRow[i] || ''
      if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
      if (cell.endsWith(':')) return 'right'
      return 'left'
    })

    // Process data rows (skip header and separator rows)
    const rows = tableRows.slice(2)

    return {
      content: contentStr,
      tableData: {
        headers,
        alignments,
        rows,
      },
    }
  }, [children])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Function to determine if a cell contains a check or x mark emoji
  const getCellStyle = (cell: string) => {
    return 'font-semibold'
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-card shadow-sm group">
      <div className="w-full overflow-x-auto">
        <table className="w-full m-0 border-collapse">
          <thead>
            <tr className="border-b">
              {tableData.headers.map((header, i) => (
                <th
                  key={`header-${i}`}
                  className={cn(
                    'px-4 py-2 text-left font-semibold text-foreground',
                    tableData.alignments[i] === 'center' && 'text-center',
                    tableData.alignments[i] === 'right' && 'text-right',
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className={cn(
                  'border-b last:border-0',
                  rowIndex % 2 === 1 ? 'bg-muted/40' : '',
                )}
              >
                {row.map((cell, cellIndex) => {
                  // Determine if the cell is an emoji cell or a feature cell (first column)
                  const isFeatureCell = cellIndex === 0
                  const isCenteredCell =
                    tableData.alignments[cellIndex] === 'center'

                  return (
                    <td
                      key={`cell-${rowIndex}-${cellIndex}`}
                      className={cn(
                        'px-4 py-2',
                        isFeatureCell ? 'font-medium' : '',
                        tableData.alignments[cellIndex] === 'center' &&
                          'text-center',
                        tableData.alignments[cellIndex] === 'right' &&
                          'text-right',
                        getCellStyle(cell),
                      )}
                    >
                      {cell}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
