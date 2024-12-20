import { expect, describe, it } from 'bun:test'
import { parseAndGetDiffBlocksSingleFile } from 'backend/generate-diffs-prompt'
import { createSearchReplaceBlock, createSearchInsertBlock } from 'common/util/file'

describe('parseAndGetDiffBlocksSingleFile', () => {
  it('should handle multiline imports', () => {
    const oldContent = `import {
  Button,
  Card,
  Input,
  Label
} from './components'

function App() {
  return <div>Hello</div>
}`

    const searchReplaceContent = createSearchReplaceBlock(
      "import { Button, Card, Input, Label } from './components'",
      "import { Button, Card, Input, Label, Select } from './components'"
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(
      `import {
  Button,
  Card,
  Input,
  Label
} from './components'`
    )
    expect(diffBlocks[0].replaceContent).toBe(
      `import { Button, Card, Input, Label, Select } from './components'`
    )
  })

  it('should handle python-style indentation mismatch', () => {
    const oldContent = `def process_data():
    items = get_items()
    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)
    return True`

    const searchReplaceContent = createSearchReplaceBlock(
      `for item in items:
    if item.valid:
        process_item(item)
        log_item(item)`,
      `for item in items:
    if item.valid:
        process_item(item)
        log_item(item)
        mark_processed(item)`
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)

    expect(diffBlocks[0].searchContent).toBe(`    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)`)
    expect(diffBlocks[0].replaceContent).toBe(`    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)
            mark_processed(item)`)
  })

  it('should handle whitespace differences in search content', async () => {
    const oldContent = `function processData(data) {
    const result = data
        .map(item => {
            return item.value;
        })
        .filter(value => value > 0);
    return result;
}`

    const searchReplaceContent = createSearchReplaceBlock(
      `    const result = data
        .map(item => {
            return item.value;
        })`,
      `    const result = data.map(item=>{return item.value;})`
    )
    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`    const result = data
        .map(item => {
            return item.value;
        })`)
  })

  it('should handle INSERT blocks', () => {
    const oldContent = `interface Props {
  name: string;
  email: string;
  role: string;
}`

    const searchInsertContent = createSearchInsertBlock(
      `interface Props {
  name: string;
  email: string;`,
      '  age: number;'
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchInsertContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`interface Props {
  name: string;
  email: string;`)
    expect(diffBlocks[0].replaceContent).toBe(`interface Props {
  name: string;
  email: string;
  age: number;`)
  })

  it('should handle INSERT blocks with indentation', () => {
    const oldContent = `class User {
    private data = {
        name: '',
        email: '',
    }
}`

    const searchInsertContent = createSearchInsertBlock(
      `    private data = {
        name: '',
        email: '',`,
      '        age: 0,'
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchInsertContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`    private data = {
        name: '',
        email: '',`)
    expect(diffBlocks[0].replaceContent).toBe(`    private data = {
        name: '',
        email: '',
        age: 0,`)
  })

  it('should handle empty or single newline replace blocks', () => {
    const oldContent = `function test() {
  // Some comment
  doSomething();
}`

    // Test empty replace
    let searchReplaceContent = createSearchReplaceBlock(
      '  // Some comment\n',
      ''
    )
    let { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].replaceContent).toBe('')
  })

  it('should handle search block with content but empty replace block', () => {
    const oldContent = `import { useState, useEffect } from 'react'
import { Chess } from 'chess.js'
import axios from 'axios'

function ChessGame() {
  // Chess game state management
  const [game] = useState(new Chess())
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0)
  const [moves, setMoves] = useState<string[]>([])

  useEffect(() => {
      // Fetch latest game from Tata Steel tournament
      // TODO: Replace with actual tournament API endpoint
      const fetchGame = async () => {
          try {
              const response = await axios.get('https://lichess.org/api/broadcast/round/latest')
              // Process PGN and set moves
              // This is a placeholder - we'll need the actual tournament API
              setMoves(['e4', 'e5', 'Nf3']) // Example moves
          } catch (error) {
              console.error('Failed to fetch game:', error)
          }
      }
      fetchGame()
  }, [])

  const nextMove = () => {
      if (currentMoveIndex < moves.length) {
          game.move(moves[currentMoveIndex])
          setCurrentMoveIndex(prev => prev + 1)
      }
  }

  const prevMove = () => {
      if (currentMoveIndex > 0) {
          game.undo()
          setCurrentMoveIndex(prev => prev - 1)
      }
  }
}`

    const searchReplaceContent = `<<<<<<< SEARCH
  // Chess game state management
  const [game] = useState(new Chess())
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0)
  const [moves, setMoves] = useState<string[]>([])

  useEffect(() => {
      // Fetch latest game from Tata Steel tournament
      // TODO: Replace with actual tournament API endpoint
      const fetchGame = async () => {
          try {
              const response = await axios.get('https://lichess.org/api/broadcast/round/latest')
              // Process PGN and set moves
              // This is a placeholder - we'll need the actual tournament API
              setMoves(['e4', 'e5', 'Nf3']) // Example moves
          } catch (error) {
              console.error('Failed to fetch game:', error)
          }
      }
      fetchGame()
  }, [])

  const nextMove = () => {
      if (currentMoveIndex < moves.length) {
          game.move(moves[currentMoveIndex])
          setCurrentMoveIndex(prev => prev + 1)
      }
  }

  const prevMove = () => {
      if (currentMoveIndex > 0) {
          game.undo()
          setCurrentMoveIndex(prev => prev - 1)
      }
  }
=======
>>>>>>> REPLACE
`
    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].replaceContent).toBe('')
  })

  it('should preserve original whitespace when matching', () => {
    const oldContent = `function test() {
    doSomething(
        arg1,
        arg2
    );
}`

    const searchReplaceContent = createSearchReplaceBlock(
      'doSomething(arg1,arg2)',
      'doSomething(arg2,arg1)'
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`
    doSomething(
        arg1,
        arg2
    )`)
  })
})
