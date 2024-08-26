import { runScript } from 'run-script'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { MINUTE_MS } from 'common/util/time'

const MAX_RETRIES = 5
if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('timeout', {
      alias: 't',
      description: 'Timeout in seconds for the database connection',
      type: 'number',
      default: 10 * MINUTE_MS,
    })
    .help()
    .alias('help', 'h')
    .parse() as { timeout: number }

  runScript(async () => {
    let retries = 0
    const runBackfill = async () => {
      const pg = createSupabaseDirectClient()

      for (const range of ranges) {
        log(`Processing range ${range.start} to ${range.end}`)
        await pg.timeout(argv.timeout, async (t) => {
          await t.none(
            // Works bc contract_bet_populate_cols reads from the data blob and sets the column
            `update contract_bets
             set bet_id = bet_id
             where bet_id >= $1
               and ($2 is null or bet_id < $2)
               and loan_amount is null
               and data ->> 'loanAmount' is not null`,
            [range.start, range.end]
          )
          log(`Converted ${range.start} to ${range.end}`)
        })
      }
    }

    while (retries < MAX_RETRIES) {
      try {
        await runBackfill()
        break // If successful, exit the retry loop
      } catch (error) {
        retries++
        log(`Attempt ${retries} failed`)
        if (retries >= MAX_RETRIES) {
          log(`Max retries (${MAX_RETRIES}) reached. Script failed.`)
          throw error
        }
        log(`Retrying in a 5 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  })
}

export const ranges = [
  { start: '0', end: '1' },
  { start: '1', end: '2' },
  { start: '2', end: '3' },
  { start: '3', end: '4' },
  { start: '4', end: '5' },
  { start: '5', end: '6' },
  { start: '6', end: '7' },
  { start: '7', end: '8' },
  { start: '8', end: '9' },
  { start: '9', end: 'A' },
  { start: 'A', end: 'B' },
  { start: 'B', end: 'C' },
  { start: 'C', end: 'D' },
  { start: 'D', end: 'E' },
  { start: 'E', end: 'F' },
  { start: 'F', end: 'G' },
  { start: 'G', end: 'H' },
  { start: 'H', end: 'I' },
  { start: 'I', end: 'J' },
  { start: 'J', end: 'K' },
  { start: 'K', end: 'L' },
  { start: 'L', end: 'M' },
  { start: 'M', end: 'N' },
  { start: 'N', end: 'O' },
  { start: 'O', end: 'P' },
  { start: 'P', end: 'Q' },
  { start: 'Q', end: 'R' },
  { start: 'R', end: 'S' },
  { start: 'S', end: 'T' },
  { start: 'T', end: 'U' },
  { start: 'U', end: 'V' },
  { start: 'V', end: 'W' },
  { start: 'W', end: 'X' },
  { start: 'X', end: 'Y' },
  { start: 'Y', end: 'Z' },
  { start: 'Z', end: 'a' },
  { start: 'a', end: 'b' },
  { start: 'b', end: 'c' },
  { start: 'c', end: 'd' },
  { start: 'd', end: 'e' },
  { start: 'e', end: 'f' },
  { start: 'f', end: 'g' },
  { start: 'g', end: 'h' },
  { start: 'h', end: 'i' },
  { start: 'i', end: 'j' },
  { start: 'j', end: 'k' },
  { start: 'k', end: 'l' },
  { start: 'l', end: 'm' },
  { start: 'm', end: 'n' },
  { start: 'n', end: 'o' },
  { start: 'o', end: 'p' },
  { start: 'p', end: 'q' },
  { start: 'q', end: 'r' },
  { start: 'r', end: 's' },
  { start: 's', end: 't' },
  { start: 't', end: 'u' },
  { start: 'u', end: 'v' },
  { start: 'v', end: 'w' },
  { start: 'w', end: 'x' },
  { start: 'x', end: 'y' },
  { start: 'y', end: 'z' },
  { start: 'z', end: null },
]
