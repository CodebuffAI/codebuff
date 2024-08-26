import { getManaSupply as fetchManaSupply } from 'shared/mana-supply'
import { APIHandler } from './helpers/endpoint'

export const getManaSupply: APIHandler<'get-mana-supply'> = async () => {
  return await fetchManaSupply(false)
}
