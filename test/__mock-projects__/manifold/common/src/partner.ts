export const PARTNER_UNIQUE_TRADER_BONUS = 0.1
export const PARTNER_UNIQUE_TRADER_BONUS_MULTI = 0.2
export const PARTNER_UNIQUE_TRADER_THRESHOLD = 20

export const PARTNER_QUARTER_START_DATE = new Date('2024-02-26')
export const getPartnerQuarterEndDate = (startDate: Date) => {
  const endDate = new Date(startDate)
  endDate.setMonth(startDate.getMonth() + 3)
  return endDate
}

export const PARTNER_RETAINED_REFERRAL_BONUS = 10