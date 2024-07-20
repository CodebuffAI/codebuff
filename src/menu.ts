export function displayMenu() {
  console.clear()
  console.log(`
                      (_)             | |     
 _ __ ___   __ _ _ __  _  ___ ___   __| | ___ 
| '_ \` _ \\ / _\` | '_ \\| |/ __/ _ \\ / _\` |/ _ \\
| | | | | | (_| | | | | | (_| (_) | (_| |  __/
|_| |_| |_|\\__,_|_| |_|_|\\___\\___/ \\__,_|\\___|
`)
  console.log('\nPress SPACE to continue, ESC to exit\n\n')
  console.log('Tips')
  console.log('')
  console.log(
    '() Create a knowledge.md file in any directory and write down your wisdom for Manny, your assistant.'
  )
  console.log('')
  console.log(
    '() Ask Manny to update knowledge files when you\'ve told him how he\'s done something wrong.'
  )
  console.log('')
  console.log(
    '() Press the LEFT and RIGHT arrow keys to revert or reapply file changes from the conversation.'
  )
  console.log('')
  console.log('() Press ESC while Manny is generating a response to cut him off.')
  console.log('')
  console.log(
    '() Email your feedback to james@manifold.markets. Thanks for using Manicode!'
  )
}
