import { isVerified, User } from './user'
import { formatMoney } from 'common/util/format'

export async function canSendMana(
  user: User,
  getPortfolio: () => Promise<{
    investmentValue: number
  }>,
  netWorthThreshold = 1000
) {
  if (user.userDeleted || user.isBannedFromPosting)
    return {
      canSend: false,
      message: 'Your account is banned or deleted.',
    }
  const { investmentValue } = await getPortfolio()
  if (!isVerified(user))
    return {
      canSend: false,
      message:
        'You must verify your phone number or purchase mana to send mana.',
    }
  if ((investmentValue ?? 0) + user.balance < netWorthThreshold) {
    return {
      canSend: false,
      message: `Your account must have a net worth greater than ${formatMoney(
        netWorthThreshold
      )}.`,
    }
  }
  return {
    canSend: true,
    message: '',
  }
}
