import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { runScript } from './run-script'
import { convertUser } from 'common/supabase/users'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const fromUserId = 'zgCIqq8AmRUYVu6AdQ9vVEJN8On1'
    const contractIdsToTransfer = await pg.map(
      `select id from contracts where creator_id = $1`,
      [fromUserId],
      (row) => row.id
    )
    const toUserId = '4juQfJkFnwX9nws3dFOpz4gc1mi2'
    const toUser = await pg.one(
      `select * from users where id = $1`,
      [toUserId],
      (row) => convertUser(row)
    )
    console.log(
      `Transferring ${contractIdsToTransfer.length} contracts from ${fromUserId} to ${toUser.name}`
    )
    const writer = new SafeBulkWriter()
    for (const id of contractIdsToTransfer) {
      const doc = firestore.collection('contracts').doc(id)
      writer.update(doc, {
        creatorId: toUser.id,
        creatorAvatarUrl: toUser.avatarUrl,
        creatorUsername: toUser.username,
        creatorName: toUser.name,
        creatorCreatedTime: toUser.createdTime,
      })
    }
    await writer.close()

    console.log('done.')
  })
}
