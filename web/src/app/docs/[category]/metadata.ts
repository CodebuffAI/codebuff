import { Metadata } from 'next'

export const generateMetadata = async ({
  params,
}: {
  params: { category: string }
}): Promise<Metadata> => {
  return {
    title: `${params.category} | Codebuff Docs`,
  }
}