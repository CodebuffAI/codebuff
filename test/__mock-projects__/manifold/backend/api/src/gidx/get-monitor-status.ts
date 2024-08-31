import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { GIDXMonitorResponse } from 'common/gidx/gidx'
import { log } from 'shared/utils'
import { TWOMBA_ENABLED } from 'common/envs/constants'

export const getMonitorStatus: APIHandler<'get-monitor-status-gidx'> = async (
  _,
  auth
) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  await getUserRegistrationRequirements(userId)
  const data = await getCustomerMonitorStatus(userId)
  return {
    status: 'success',
    data,
  }
}

const getCustomerMonitorStatus = async (userId: string) => {
  const ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerMonitor'
  const body = {
    MerchantCustomerID: userId,
    ...getGIDXStandardParams(),
  } as Record<string, string>
  const queryParams = new URLSearchParams(body).toString()
  const urlWithParams = `${ENDPOINT}?${queryParams}`

  const res = await fetch(urlWithParams)
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }

  const data = (await res.json()) as GIDXMonitorResponse
  log(
    'Monitor response:',
    data.ResponseMessage,
    'reasons',
    data.ReasonCodes,
    'watches',
    data.WatchChecks,
    'userId',
    data.MerchantCustomerID
  )
  return data
}
