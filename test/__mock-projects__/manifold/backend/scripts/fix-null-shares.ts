import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    console.log('Fix bets with null shares')

    const bets = await pg.map(
      `select bet_id, contract_id, amount from contract_bets where shares is null`,
      [],
      (r) => ({
        id: r.bet_id,
        contractId: r.contract_id,
        amount: r.amount,
      })
    )

    const writer = firestore.bulkWriter()
    for (const bet of bets) {
      console.log('Updating bet:', bet.id, 'shares', bet.amount ?? 0)
      writer.update(
        firestore
          .collection('contracts')
          .doc(bet.contractId)
          .collection('bets')
          .doc(bet.id),
        {
          shares: bet.amount ?? 0,
        }
      )
    }
    await writer.close()
  })
}
