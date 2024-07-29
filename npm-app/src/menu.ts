export function displayMenu() {
  console.clear()
  console.log(`
                      (_)             | |     
 _ __ ___   __ _ _ __  _  ___ ___   __| | ___ 
| '_ \` _ \\ / _\` | '_ \\| |/ __/ _ \\ / _\` |/ _ \\
| | | | | | (_| | | | | | (_| (_) | (_| |  __/
|_| |_| |_|\\__,_|_| |_|_|\\___\\___/ \\__,_|\\___|
`)
  console.log('\nPress ESC to close menu, CTRL-C to exit\n\n')
  console.log('TIPS')
  console.log('')
  console.log(
    '() Create a knowledge.md file and write down your wisdom for Manny, your assistant.'
  )
  console.log('')
  console.log(
    "() Ask Manny to update knowledge files when he's done something wrong."
  )
  console.log('')
  console.log(
    '() Press the CTRL-U to undo file changes from the conversation. Press CTRL-R to redo.'
  )
  console.log('')
  console.log(
    '() Press ESC while Manny is generating a response to cut him off.'
  )
  console.log('')
  console.log(
    '() Email your feedback to james@manifold.markets. Thanks for using Manicode!'
  )
}
