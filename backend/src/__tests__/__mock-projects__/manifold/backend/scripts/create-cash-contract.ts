import { runScript } from './run-script'
import { createCashContract } from '../shared/src/create-cash-contract'

runScript(async ({ pg }) => {
  const manaContractId = process.argv[2]
  const subsidyAmount = parseFloat(process.argv[3])

  if (!manaContractId || isNaN(subsidyAmount)) {
    console.error(
      'Usage: ts-node create-cash-contract.ts <mana_contract_id> <subsidy_amount>'
    )
    process.exit(1)
  }

  try {
    const cashContract = await createCashContract(
      manaContractId,
      subsidyAmount,
      pg
    )
    console.log('Success ' + cashContract.id)
  } catch (error) {
    console.error('Error creating cash contract:', error)
  }
})
