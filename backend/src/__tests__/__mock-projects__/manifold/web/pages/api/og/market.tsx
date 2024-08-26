import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { OgMarket } from 'web/components/og/og-market'
import { classToTw } from 'web/components/og/utils'
import { OgCardProps } from 'common/contract-seo'

export const config = { runtime: 'edge' }
export const getCardOptions = async () => {
  const [light, med] = await Promise.all([figtreeLightData, figtreeMediumData])

  return {
    width: 600,
    height: 315,
    fonts: [
      {
        name: 'Figtree',
        data: med,
        style: 'normal',
      },
      {
        name: 'Figtree-light',
        data: light,
        style: 'normal',
      },
    ],
  }
}

const FIGTREE_LIGHT_URL = new URL('Figtree-Light.ttf', import.meta.url)
const figtreeLightData = fetch(FIGTREE_LIGHT_URL).then((res) =>
  res.arrayBuffer()
)
const FIGTREE_MED_URL = new URL('Figtree-Medium.ttf', import.meta.url)
const figtreeMediumData = fetch(FIGTREE_MED_URL).then((res) =>
  res.arrayBuffer()
)

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const OgMarketProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgMarket(OgMarketProps)

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
