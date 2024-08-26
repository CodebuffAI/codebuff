import { z } from 'zod'
import { MaybeAuthedEndpoint, validate } from './helpers/endpoint'

const bodySchema = z.object({
  cityId: z.string(),
  radius: z.number().refine((data) => data > 0 && data < 501, {
    message: 'Number must be greater than 0 and less than 501',
  }),
})

export const searchnearcity = MaybeAuthedEndpoint(async (req) => {
  const { cityId, radius } = validate(bodySchema, req.body)
  return await searchNearCityMain(cityId, radius)
})

const searchNearCityMain = async (cityId: string, radius: number) => {
  const apiKey = process.env.GEODB_API_KEY

  if (!apiKey) {
    return { status: 'failure', data: 'Missing GEODB API key' }
  }
  const host = 'wft-geo-db.p.rapidapi.com'
  const baseUrl = `https://${host}/v1/geo`
  const url = `${baseUrl}/cities/${cityId}/nearbyCities?radius=${radius}&offset=0&sort=-population&limit=100`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
    })

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`)
    }

    const data = await res.json()

    return { status: 'success', data: data }
  } catch (error) {
    return { status: 'failure', data: error }
  }
}

export const getNearbyCities = async (cityId: string, radius: number) => {
  const result = await searchNearCityMain(cityId, radius)
  const cityIds = (result.data.data as any[]).map(
    (city) => city.id.toString() as string
  )
  return cityIds
}
