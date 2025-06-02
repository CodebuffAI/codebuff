import db from 'common/db'
import { message } from 'common/db/schema'
import { lt } from 'drizzle-orm'
import cron from 'node-cron'
import { logger } from '@/util/logger'

/**
 * Delete messages from previous months.
 * Only keeps messages with finished_at in the current month.
 */
async function expireOldMessages() {
  const firstDayOfCurrentMonth = new Date()
  firstDayOfCurrentMonth.setDate(1)
  firstDayOfCurrentMonth.setHours(0, 0, 0, 0)

  logger.info(
    { cutoffDate: firstDayOfCurrentMonth },
    'Starting monthly message expiration'
  )

  try {
    // Delete messages from previous months
    const result = await db.delete(message).where(
      lt(message.finished_at, firstDayOfCurrentMonth)
    )

    // Note: rowCount might not be available depending on the driver
    logger.info(
      { cutoffDate: firstDayOfCurrentMonth },
      'Successfully expired old messages'
    )
  } catch (error) {
    logger.error(
      { error, cutoffDate: firstDayOfCurrentMonth },
      'Error expiring old messages'
    )
  }
}

async function main() {
  try {
    logger.info('Starting message expiration task scheduler...')
    
    // Run daily at 3:00 AM UTC
    cron.schedule('0 3 * * *', () => {
      logger.info('Running scheduled message expiration task')
      expireOldMessages()
    })

    logger.info('Message expiration task scheduled')
    
    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('Received SIGINT. Shutting down message expiration task...')
      process.exit(0)
    })
  } catch (error) {
    logger.error({ error }, 'Error starting message expiration task')
    process.exit(1)
  }
}

main()
