import { bold, cyan, green, red, yellow } from 'picocolors'
import { DiffManager } from '../diff-manager'

export function handleDiff() {
  const lastChanges = DiffManager.getChanges()
  if (lastChanges.length === 0) {
    console.log(yellow('No changes found in the last assistant response.'))
    return
  }

  lastChanges.forEach((change) => {
    console.log(bold(`___${change.path}___`))
    const lines = change.content
      .split('\n')
      .map((line) => (change.type === 'file' ? '+' + line : line))

    lines.forEach((line) => {
      if (line.startsWith('+')) {
        console.log(green(line))
      } else if (line.startsWith('-')) {
        console.log(red(line))
      } else if (line.startsWith('@@')) {
        console.log(cyan(line))
      } else {
        console.log(line)
      }
    })
  })
}
