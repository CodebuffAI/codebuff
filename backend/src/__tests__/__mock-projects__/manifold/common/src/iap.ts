export type IapTransaction = {
  id: string
  userId: string
  quantity: number
  manaQuantity: number
  productId: 'mana_2500' | 'mana_10000' | 'mana_1000'
  transactionId: string
  createdTime: number
  purchaseTime: number
  receipt: string
  revenue: number
  type: 'apple'
}

// Not exhaustive, but enough for what we need
export type PurchaseData = {
  quantity: number
  productId: 'mana_2500' | 'mana_10000' | 'mana_1000'
  transactionId: string
  originalTransactionId: string
  purchaseDateMs: number
}
