import { projectRoot } from './config'

export function displayMenu() {
  console.clear()
  console.log(`
                      (_)             | |     
 _ __ ___   __ _ _ __  _  ___ ___   __| | ___ 
| '_ \` _ \\ / _\` | '_ \\| |/ __/ _ \\ / _\` |/ _ \\
| | | | | | (_| | | | | | (_| (_) | (_| |  __/
|_| |_| |_|\\__,_|_| |_|_|\\___\\___/ \\__,_|\\___|
`)
  console.log('\nPress ESC to close menu, CTRL-C to exit app\n')
  console.log(
    `Manicode is your AI coding assistant. It will read and write files within your current directory (${projectRoot}), run commands in your terminal, and scrape the web to accomplish tasks you give it.\n`
  )
  console.log(
    'Ask it to implement small features, write unit tests, write scripts, or give advice.\n'
  )
  console.log('TIPS')
  console.log(
    '() Create a knowledge.md file and collect specific points of advice. The assistant will use this knowledge to improve its responses.'
  )
  console.log(
    '() Press the CTRL-U to undo file changes from the conversation. Press CTRL-R to redo.'
  )
  console.log(
    '() Press ESC or CTRL-C while Manicode is generating a response to cut it off.'
  )
  console.log(
    '() Email your feedback to james@manifold.markets. Thanks for using Manicode!'
  )
}
