import { getApiUrl } from 'common/api/utils'

export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint = getApiUrl('createcheckoutsession')
  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${encodeURIComponent(
    referer
  )}`
}
