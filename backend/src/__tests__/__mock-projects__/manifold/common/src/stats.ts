export type Stats = {
  startDate: [number]
  dailyActiveUsers: number[]
  avgDailyUserActions: number[]
  weeklyActiveUsers: number[]
  monthlyActiveUsers: number[]
  engagedUsers: number[]
  dailySales: number[]
  d1: number[]
  nd1: number[]
  fracDaysActiveD1ToD3: number[]
  nw1: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  dailySignups: number[]
  weekOnWeekRetention: number[]
  monthlyRetention: number[]
  dailyActivationRate: number[]
  manaBetDaily: number[]
  d1BetAverage: number[]
  d1Bet3DayAverage: number[]
  dailyNewRealUserSignups: number[]
  feedConversionScores: number[]
}

// stats fully calculated from the above stats
export type DerivedStats = {
  dailyActiveUsersWeeklyAvg: number[]
  salesWeeklyAvg: number[]
  monthlySales: number[]
  d1WeeklyAvg: number[]
  nd1WeeklyAvg: number[]
  fracDaysActiveD1ToD3Avg7d: number[]
  dailyActivationRateWeeklyAvg: number[]
  manaBetWeekly: number[]
  manaBetMonthly: number[]
}

export type ManaSupply = {
  balance: number
  spiceBalance: number
  investmentValue: number
  loanTotal: number
  ammLiquidity: number
  totalValue: number
}
