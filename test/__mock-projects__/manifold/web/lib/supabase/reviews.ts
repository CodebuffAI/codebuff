import { Json } from 'common/supabase/schema'
import { db } from './db'
import { Row, run, tsToMillis } from 'common/supabase/utils'

export const getUserRating = async (userId: string) => {
  const { data } = await db.rpc('get_rating', { user_id: userId }).single()
  return data
}

export const getAverageUserRating = async (userId: string) => {
  const { data } = await db.rpc('get_average_rating', { user_id: userId })
  return data
}

export const getUserReviews = async (userId: string) => {
  const { data } = await run(
    db
      .from('reviews')
      .select('*')
      .eq('vendor_id', userId)
      .order('created_time', { ascending: false })
  )

  return data.map(convertReview)
}

export const getMyReviewOnContract = async (
  contractId: string,
  userId: string
) => {
  const { data } = await db
    .from('reviews')
    .select('*')
    .eq('market_id', contractId)
    .eq('reviewer_id', userId)
    .limit(1)

  return data?.[0] ? convertReview(data[0]) : null
}

export type Review = {
  created_time: number
  content: Json
  market_id: string
  rating: number
  reviewer_id: string
  vendor_id: string
}

const convertReview = (review: Row<'reviews'>) => ({
  ...review,
  created_time: tsToMillis(review.created_time),
})
