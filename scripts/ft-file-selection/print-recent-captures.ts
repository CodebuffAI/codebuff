import db from 'common/db'
import { ft_filepicker_capture } from 'common/db/schema'
import { desc } from 'drizzle-orm'

async function getRecentCaptures() {
  try {
    const captures = await db
      .select({
        id: ft_filepicker_capture.id,
        system: ft_filepicker_capture.system,
        messages: ft_filepicker_capture.messages,
        timestamp: ft_filepicker_capture.timestamp,
        output: ft_filepicker_capture.output,
      })
      .from(ft_filepicker_capture)
      .orderBy(desc(ft_filepicker_capture.timestamp))
      .limit(10)

    console.log('\nLast 10 captures by timestamp:')
    console.log('--------------------------------')

    captures.forEach((capture) => {
      console.log(`
ID: ${capture.id}
Output: ${capture.output}
Created at: ${capture.timestamp}
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching captures:', error)
  }
}

// Run the function
getRecentCaptures()
