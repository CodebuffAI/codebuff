import { Metadata } from 'next'

export const generateMetadata = async ({
  params,
}: {
  params: { code: string }
}): Promise<Metadata> => {
  return {
    title: 'Redeem Referral | Codebuff',
  }
}