import { auth } from '../firebase/users'
import { getApiUrl } from 'common/api/utils'
import { JSONContent } from '@tiptap/core'
import { Group, PrivacyStatusType } from 'common/group'
import { AD_RATE_LIMIT } from 'common/boost'
import { ContractComment } from 'common/comment'
import { Portfolio, PortfolioItem } from 'common/portfolio'
import { ReportProps } from 'common/report'
import { BaseDashboard, DashboardItem } from 'common/dashboard'
import { Bet } from 'common/bet'
import { API, APIParams, APIPath, APIResponse } from 'common/api/schema'
import { baseApiCall, formatApiUrlWithParams } from 'common/util/api'
import { sleep } from 'common/util/time'
import { Contract } from 'common/contract'
export { APIError } from 'common/api/utils'

export async function call(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params?: any
) {
  return baseApiCall(url, method, params, auth.currentUser)
}

// This is the preferred way of using the api going forward
export async function api<P extends APIPath>(
  path: P,
  params: APIParams<P> = {}
) {
  // If the api is authed and the user is not loaded, wait for the user to load.
  if (API[path].authed && !auth.currentUser) {
    let i = 0
    while (!auth.currentUser) {
      i++
      await sleep(i * 10)
      if (i > 30) {
        console.error('User did not load after 30 iterations')
        break
      }
    }
  }

  return (await call(
    formatApiUrlWithParams(path, params),
    API[path].method,
    params
  )) as Promise<APIResponse<P>>
}

// helper function for the old apis so we don't have to migrate them
function curriedAPI<P extends APIPath>(path: P) {
  return (params: APIParams<P>) => api(path, params)
}

export function createAnswer(params: any) {
  return call(getApiUrl('createanswer'), 'POST', params)
}

export function claimDestinySub(params: any) {
  return call(getApiUrl('claimdestinysub'), 'POST', params)
}

export function createUser(params: any) {
  return call(getApiUrl('createuser'), 'POST', params)
}

export function swapCert(params: any) {
  return call(getApiUrl('swapcert'), 'POST', params)
}

export function dividendCert(params: any) {
  return call(getApiUrl('dividendcert'), 'POST', params)
}

export function claimManalink(params: any) {
  return call(getApiUrl('claimmanalink'), 'POST', params)
}

export function createGroup(params: any) {
  return call(getApiUrl('creategroup'), 'POST', params)
}

export function updateGroup(params: { id: string } & Partial<Group>) {
  return call(getApiUrl('updategroup'), 'POST', params)
}

export function acceptChallenge(params: any) {
  return call(getApiUrl('acceptchallenge'), 'POST', params)
}

export function boostMarket(params: any) {
  return call(getApiUrl('boost-market'), 'POST', params)
}

let nonce = 0
export function redeemBoost(params: any) {
  const now = Date.now()
  if (now - nonce < AD_RATE_LIMIT - 500) {
    throw Error(
      `Please wait ${AD_RATE_LIMIT / 1000} seconds between redeeming boosts.`
    )
  }
  nonce = now
  return call(getApiUrl('redeem-boost'), 'POST', params)
}

export function validateIapReceipt(params: any) {
  return call(getApiUrl('validateiap'), 'POST', params)
}

export function markAllNotifications(params: any) {
  return call(getApiUrl('markallnotifications'), 'POST', params)
}

export function updateMemberRole(params: {
  groupId: string
  memberId: string
  role: string
}) {
  return call(getApiUrl('updatememberrole'), 'POST', params)
}

export function updateGroupPrivacy(params: {
  groupId: string
  privacy: PrivacyStatusType
}) {
  return call(getApiUrl('updategroupprivacy'), 'POST', params)
}

export function registerDiscordId(params: any) {
  return call(getApiUrl('registerdiscordid'), 'POST', params)
}

export function getUserIsFollowingTopic(params: { groupSlug: string }) {
  return call(getApiUrl('getuserisgroupmember'), 'POST', params)
}

export function completeQuest(params: any) {
  return call(getApiUrl('completequest'), 'POST', params)
}

export function getSupabaseToken() {
  return call(getApiUrl('getsupabasetoken'), 'GET')
}

export function updateUserDisinterestEmbedding(params: {
  contractId: string
  creatorId: string
  feedId?: number
  removeContract?: boolean
}) {
  return call(getApiUrl('update-user-disinterest-embedding'), 'POST', params)
}

export const searchContracts = curriedAPI('search-markets-full')

export function deleteMarket(params: { contractId: string }) {
  return call(getApiUrl('delete-market'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function saveTopic(params: { topic: string }) {
  return call(getApiUrl('save-topic'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function setTV(params: {
  streamId: string
  slug: string
  source: string
  title: string
  startTime: string
  endTime: string
}) {
  return call(getApiUrl('settv'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function deleteTV(id: string) {
  return call(getApiUrl('deletetv'), 'POST', { id }) as Promise<{
    status: 'success'
  }>
}

export function joinGroupThroughInvite(params: { inviteId: string }) {
  return call(getApiUrl('joingroupthroughinvite'), 'POST', params)
}

export function followTopic(params: { groupId: string }) {
  return call(getApiUrl('follow-topic'), 'POST', params)
}

export const searchGroups = curriedAPI('search-groups')

export function leagueActivity(params: { season: number; cohort: string }) {
  return call(getApiUrl('league-activity'), 'POST', params) as Promise<{
    bets: Bet[]
    comments: ContractComment[]
    contracts: Contract[]
  }>
}

export function cancelBounty(params: { contractId: string }) {
  return call(getApiUrl('cancel-bounty'), 'POST', params)
}

export function createPortfolio(params: {
  name: string
  items: PortfolioItem[]
}) {
  return call(getApiUrl('createportfolio'), 'POST', params)
}

export function updatePortfolio(params: { id: string } & Partial<Portfolio>) {
  return call(getApiUrl('updateportfolio'), 'POST', params)
}

export function buyPortfolio(
  params: {
    portfolioId: string
    amount: number
    buyOpposite?: boolean
  } & Partial<Portfolio>
) {
  return call(getApiUrl('buyportfolio'), 'POST', params)
}

export function searchGiphy(params: { term: string; limit: number }) {
  return call(getApiUrl('searchgiphy'), 'POST', params)
}

export function tweetFromManaChan(params: { tweet: string }) {
  return call(getApiUrl('manachantweet'), 'POST', params)
}

export function leaveReview(params: any) {
  return call(getApiUrl('leave-review'), 'POST', params)
}
export function getUserContractsMetricsWithContracts(params: {
  userId: string
  offset: number
  limit: number
}) {
  return call(
    getApiUrl('get-user-contract-metrics-with-contracts'),
    'POST',
    params
  )
}

export function castPollVote(params: { contractId: string; voteId: string }) {
  return call(getApiUrl('cast-poll-vote'), 'POST', params)
}

export function getSimilarGroupsToContract(params: { question: string }) {
  return call(getApiUrl('get-similar-groups-to-contract'), 'POST', params)
}

export function bidForLeague(params: {
  season: number
  division: number
  cohort: string
  amount: number
}) {
  return call(getApiUrl('bidforleague'), 'POST', params)
}

export function followUser(userId: string) {
  return call(getApiUrl('follow-user'), 'POST', { userId, follow: true })
}

export function unfollowUser(userId: string) {
  return call(getApiUrl('follow-user'), 'POST', { userId, follow: false })
}

export function report(params: ReportProps) {
  return call(getApiUrl('report'), 'POST', params)
}

export function createDashboard(params: {
  title: string
  items: DashboardItem[]
  topics: string[]
}) {
  return call(getApiUrl('createdashboard'), 'POST', params)
}

export function getYourDashboards() {
  return call(getApiUrl('getyourdashboards'), 'POST')
}

export function followDashboard(params: { dashboardId: string }) {
  return call(getApiUrl('followdashboard'), 'POST', params)
}

export function supabaseSearchDashboards(params: {
  term: string
  offset: number
  limit: number
}) {
  return call(getApiUrl('supabasesearchdashboards'), 'POST', params) as Promise<
    BaseDashboard[]
  >
}

export function getYourFollowedDashboards() {
  return call(getApiUrl('getyourfolloweddashboards'), 'POST')
}

export function updateDashboard(params: {
  title: string
  dashboardId: string
  items: DashboardItem[]
  topics?: string[]
}) {
  return call(getApiUrl('updatedashboard'), 'POST', params)
}

export function deleteDashboard(params: { dashboardId: string }) {
  return call(getApiUrl('delete-dashboard'), 'POST', params)
}

export function referUser(params: {
  referredByUsername: string
  contractId?: string
}) {
  return call(getApiUrl('refer-user'), 'POST', params)
}

export const updateMarket = curriedAPI('market/:contractId/update')

export const updateUser = curriedAPI('me/update')

export function banUser(params: { userId: string; unban?: boolean }) {
  return call(getApiUrl('ban-user'), 'POST', params)
}
export function createPrivateMessageChannelWithUsers(params: {
  userIds: string[]
}) {
  return call(getApiUrl('create-private-user-message-channel'), 'POST', params)
}

export function sendUserPrivateMessage(params: {
  channelId: number
  content: JSONContent
}) {
  return call(getApiUrl('create-private-user-message'), 'POST', params)
}
export function leavePrivateMessageChannel(params: { channelId: number }) {
  return call(getApiUrl('leave-private-user-message-channel'), 'POST', params)
}
export function updatePrivateMessageChannel(params: {
  channelId: number
  notifyAfterTime: number
}) {
  return call(getApiUrl('update-private-user-message-channel'), 'POST', params)
}
export function editAnswerCpmm(params: {
  answerId: string
  text?: string
  color?: string
  contractId: string
}) {
  return call(getApiUrl('edit-answer-cpmm'), 'POST', params)
}

export function createChartAnnotation(params: {
  eventTime: number
  contractId: string
  text?: string
  commentId?: string
  thumbnailUrl?: string
  externalUrl?: string
  answerId?: string
  probChange?: number
}) {
  return call(getApiUrl('create-chart-annotation'), 'POST', params)
}

export function deleteChartAnnotation(params: { id: number }) {
  return call(getApiUrl('delete-chart-annotation'), 'POST', params)
}
export function getAdAnalytics(params: { contractId: string }) {
  return call(getApiUrl('get-ad-analytics'), 'POST', params)
}

export function requestLoan() {
  return call(getApiUrl('request-loan'), 'GET')
}
