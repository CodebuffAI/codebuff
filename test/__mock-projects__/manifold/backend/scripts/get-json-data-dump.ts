import * as fs from 'fs'
import { runScript } from 'run-script'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { writeJson } from 'shared/helpers/file'

if (require.main === module)
  runScript(async ({ pg }) => {
    const filenameSuffix = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -9)

    console.log(`Exporting bets to JSON file...`)

    const PAGE_SIZE = 100000 // Adjust this value based on your system's memory constraints
    const betFilename = `manifold-bets-${filenameSuffix}.json`

    let offset = 0
    let totalBets = 0
    let hasMoreRows = true

    // Create or clear the output file
    fs.writeFileSync(betFilename, '[\n', { flag: 'w' })

    while (hasMoreRows) {
      const bets = await pg.map(
        `SELECT cb.data FROM contract_bets cb
        join contracts on cb.contract_id = contracts.id
        WHERE is_redemption = false
        and contracts.visibility = 'public'
        ORDER BY cb.created_time ASC
        LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset],
        (row) => row.data as Bet
      )

      hasMoreRows = bets.length === PAGE_SIZE
      offset += bets.length
      totalBets += bets.length

      const trimmedBets = bets.map((bet) => {
        const { ...trimmedBet } = bet as Bet & {
          userAvatarUrl: string
          userName: string
          userUsername: string
        }
        return trimmedBet
      })

      // Append the trimmed bets to the file
      const betString = JSON.stringify(trimmedBets, null, 2)
        .slice(1, -1) // Remove the opening and closing brackets
        .trim()

      fs.appendFileSync(betFilename, betString)

      // Add a comma if there are more rows to come
      if (hasMoreRows) {
        fs.appendFileSync(betFilename, ',\n')
      } else {
        fs.appendFileSync(betFilename, '\n')
      }

      console.log(`Processed ${totalBets} bets`)
    }

    // Close the JSON array
    fs.appendFileSync(betFilename, ']')

    console.log(`Total bets exported: ${totalBets}`)
    console.log(`Bets saved to ${betFilename}`)

    console.log(`Exporting contracts to JSON file...`)
    const contracts = await pg.map(
      `
      select data from contracts
      where visibility = 'public'
      order by created_time
      `,
      [],
      (row) => row.data as Contract
    )

    console.log(`Downloaded ${contracts.length} contracts`)

    await writeJson(`manifold-contracts-${filenameSuffix}.json`, contracts)

    console.log(`Exporting comments to JSON file...`)

    const comments = await pg.map(
      `
      select cc.data from contract_comments cc
      join contracts on cc.contract_id = contracts.id
      where contracts.visibility = 'public'
      order by cc.created_time
      `,
      [],
      (row) => row.data as Comment
    )

    console.log(`Downloaded ${comments.length} comments`)

    const filename = `manifold-comments-${filenameSuffix}.json`
    const writeStream = fs.createWriteStream(filename)

    writeStream.write('[\n')

    for (let i = 0; i < comments.length; i++) {
      const commentJson = JSON.stringify(comments[i])
      writeStream.write(commentJson)
      if (i < comments.length - 1) {
        writeStream.write(',\n')
      }
    }

    writeStream.write('\n]')

    writeStream.end(() => {
      console.log(`Comments written to ${filename}`)
    })

    // Wait for the stream to finish writing
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve())
      writeStream.on('error', (error) => reject(error))
    })
  })
